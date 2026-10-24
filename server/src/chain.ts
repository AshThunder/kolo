/* oxlint-disable typescript/no-explicit-any -- dynamic ABI/log decoding in the indexer/keeper */
import { createPublicClient, createWalletClient, http, parseAbiItem, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { KOLO_FACTORY_ABI } from '../../src/abi/KoloFactory'
import { KOLO_GROUP_POT_ABI } from '../../src/abi/KoloGroupPot'
import { KOLO_TUITION_POT_ABI } from '../../src/abi/KoloTuitionPot'
import { KOLO_ADDRESSES } from '../../src/addresses'
import { NET } from '../../src/network'

export const RPC = process.env.ARC_RPC_URL ?? NET.rpc
export const FACTORY = KOLO_ADDRESSES.factory as Address
export const SWEEPER_FACTORY = KOLO_ADDRESSES.sweeperFactory as Address
export const USDC = NET.usdc as Address
export const START_BLOCK = BigInt(process.env.KOLO_START_BLOCK ?? String(NET.startBlock))

// The public RPC rate-limits hard. One shared gate: max 3 requests in flight, 80ms apart,
// and a rate-limited reply (JSON-RPC error body) is retried with backoff before viem ever sees it.
let inflight = 0; let lastStart = 0; const waiters: (() => void)[] = []
async function gate<T>(fn: () => Promise<T>): Promise<T> {
  while (inflight >= 3) await new Promise<void>(r => waiters.push(r))
  inflight++
  try { const wait = lastStart + 80 - Date.now(); lastStart = Math.max(Date.now(), lastStart + 80); if (wait > 0) await new Promise(r => setTimeout(r, wait)); return await fn() }
  finally { inflight--; waiters.shift()?.() }
}
const rpcFetch: typeof fetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    const res = await gate(() => fetch(input, init))
    const limited = res.status === 429 || (res.ok && /exceeds defined limit|rate limit/i.test(await res.clone().text().catch(() => '')))
    if (!limited || attempt >= 7) return res
    await new Promise(r => setTimeout(r, 400 * 2 ** Math.min(attempt, 4)))
  }
}
/** Forward a raw JSON-RPC body to Arc through the same gate/backoff the indexer uses (powers the browser's same-origin read fallback). */
export async function rpcForward(body: string): Promise<{ status: number; text: string }> {
  const res = await rpcFetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  return { status: res.status, text: await res.text() }
}
export const pub = createPublicClient({ chain: NET.chain, transport: http(RPC, { fetchFn: rpcFetch, timeout: 30_000, retryCount: 3, retryDelay: 400 }) })

// Keeper key comes only from env; never logged.
const pk = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined
export const keeperAccount = pk ? privateKeyToAccount(pk) : undefined
export const wallet = keeperAccount ? createWalletClient({ chain: NET.chain, transport: http(RPC), account: keeperAccount }) : undefined

export type PotRow = { id: number; address: Address; type: 'group' | 'tuition' }
let potsCache: { at: number; rows: PotRow[] } | undefined
let potsInflight: Promise<PotRow[]> | undefined
/** Pot list from the factory. Cached 15s and de-duplicated so concurrent requests share one RPC round-trip. */
export function listPots(): Promise<PotRow[]> {
  if (potsCache && Date.now() - potsCache.at < 15_000) return Promise.resolve(potsCache.rows)
  potsInflight ??= (async () => {
    try {
      const n = Number(await pub.readContract({ address: FACTORY, abi: KOLO_FACTORY_ABI, functionName: 'potCount' }))
      const ids = Array.from({ length: n }, (_, i) => BigInt(i + 1))
      const res = n ? await pub.multicall({ allowFailure: false, contracts: ids.flatMap(id => [
        { address: FACTORY, abi: KOLO_FACTORY_ABI, functionName: 'potAddress', args: [id] },
        { address: FACTORY, abi: KOLO_FACTORY_ABI, functionName: 'potType', args: [id] },
      ] as const) }) : []
      const rows = ids.map((id, i): PotRow => ({ id: Number(id), address: res[i * 2] as Address, type: Number(res[i * 2 + 1]) === 1 ? 'tuition' : 'group' }))
      potsCache = { at: Date.now(), rows }; return rows
    } finally { potsInflight = undefined }
  })()
  return potsInflight
}
export const potAbi = (t: PotRow['type']) => (t === 'tuition' ? KOLO_TUITION_POT_ABI : KOLO_GROUP_POT_ABI)

const blockTimes = new Map<bigint, number>()
export async function blockTime(n: bigint): Promise<number> {
  const hit = blockTimes.get(n); if (hit) return hit
  const t = Number((await pub.getBlock({ blockNumber: n })).timestamp); blockTimes.set(n, t); return t
}

// Incremental log index: each (addresses, events) query remembers what it has seen and only scans new blocks.
// The public RPC caps eth_getLogs ranges (adaptive window) and rejects ~11+ OR-ed event topics (chunked).
let STEP = 9_000n
const MAX_TOPICS = 10
let headCache: { at: number; n: bigint } | undefined
const head = async () => (headCache && Date.now() - headCache.at < 4_000 ? headCache.n : (headCache = { at: Date.now(), n: await pub.getBlockNumber() }).n)
const logIndex = new Map<string, { upto: bigint; logs: any[] }>()
const scanning = new Map<string, Promise<any[]>>()
/** Test hook: forget the head, the window size and every cached scan. */
export function resetScanState(headOnly = false) { headCache = undefined; if (!headOnly) { STEP = 9_000n; logIndex.clear(); scanning.clear() } }
/** Concurrent identical scans (warm-up + a page request) share one in-flight promise. */
export function scanLogs(address: Address | Address[], events: string[], from = START_BLOCK): Promise<any[]> {
  const k = JSON.stringify([address, events, String(from)])
  const p = scanning.get(k) ?? scanLogsRaw(address, events, from).finally(() => scanning.delete(k))
  scanning.set(k, p); return p
}
async function scanLogsRaw(address: Address | Address[], events: string[], from: bigint): Promise<any[]> {
  if (events.length > MAX_TOPICS) {
    const parts: any[][] = []
    for (let i = 0; i < events.length; i += MAX_TOPICS) parts.push(await scanLogs(address, events.slice(i, i + MAX_TOPICS), from))
    return parts.flat().sort((x, y) => Number(x.blockNumber - y.blockNumber) || x.logIndex - y.logIndex)
  }
  const items = events.map(e => parseAbiItem(e) as any)
  const key = JSON.stringify([address, events])
  const cached = from === START_BLOCK ? logIndex.get(key) : undefined
  const h = await head(); const fresh: any[] = []
  let b = cached ? cached.upto + 1n : from
  let rl = 0
  while (b <= h) {
    const to = b + STEP - 1n > h ? h : b + STEP - 1n
    try { fresh.push(...(await pub.getLogs({ address, events: items, fromBlock: b, toBlock: to }))); b = to + 1n }
    catch (e: any) {
      const msg = String(e.details ?? e.message)
      if (/range too large|too many|exceed|-32014|block range|10,?000|9,?999/i.test(msg) && STEP > 500n) { STEP = STEP / 2n; continue }
      // public RPC rate limit (-32005): back off and retry instead of failing the request
      if (/rate limit|-32005|429/i.test(msg) && rl < 8) { rl++; await new Promise(r => setTimeout(r, 600 * rl)); continue }
      throw e
    }
  }
  if (from !== START_BLOCK) return fresh
  const logs = [...(cached?.logs ?? []), ...fresh]
  logIndex.set(key, { upto: h, logs }); return logs
}
