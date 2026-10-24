/* oxlint-disable typescript/no-explicit-any -- iris JSON */
// CCTP pay-in relayer. A contributor (or the UI) submits the SOURCE-chain burn tx; the keeper polls Circle's iris API
// until the attestation is complete, then calls KoloCctpReceiver.relay(message, attestation) on Arc, which mints the USDC
// and credits the pot via contributeFor. Nothing here is trusted: the receiver verifies the attestation on-chain.
import { keccak256, parseAbi, type Address } from 'viem'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pub, wallet, keeperAccount } from './chain'
import { KOLO_ADDRESSES } from '../../src/addresses'
import { NET } from '../../src/network'

const IRIS = process.env.CCTP_IRIS_URL ?? NET.cctp.iris // mainnet: iris-api.circle.com, testnet: iris-api-sandbox.circle.com
const FILE = process.env.KOLO_CCTP_FILE ?? new URL('../data/cctp.json', import.meta.url).pathname
export const ARC_DOMAIN = NET.cctp.domain
const RECEIVER = KOLO_ADDRESSES.cctpReceiver as Address
const RECV_ABI = parseAbi(['function relay(bytes message, bytes attestation)', 'function processedMessages(bytes32) view returns (bool)'])

export type Burn = { sourceDomain: number; tx: string; at: string; status: 'pending' | 'relayed' | 'failed'; relayTx?: string; error?: string }
let db: Burn[] = []
try { db = JSON.parse(readFileSync(FILE, 'utf8')) } catch { /* empty */ }
const save = () => { mkdirSync(FILE.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(FILE, JSON.stringify(db, null, 1)) }
export const listBurns = () => db

export function submitBurn(sourceDomain: number, tx: string) {
  if (!Number.isInteger(sourceDomain) || sourceDomain < 0 || sourceDomain > 100) return { ok: false as const, error: 'bad source domain' }
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return { ok: false as const, error: 'bad tx hash' }
  if (!db.some(b => b.tx.toLowerCase() === tx.toLowerCase())) {
    if (db.filter(b => b.status === 'pending').length >= 200) return { ok: false as const, error: 'relay queue is full, try again later' }
    db.push({ sourceDomain, tx, at: new Date().toISOString(), status: 'pending' }); save() }
  return { ok: true as const }
}

export type Attested = { message: `0x${string}`; attestation: `0x${string}` }
/** 'pending' until Circle has attested; throws only on transport errors. */
export async function fetchAttested(b: Pick<Burn, 'sourceDomain' | 'tx'>): Promise<Attested | 'pending' | 'wrong-destination'> {
  const res = await fetch(`${IRIS}/v2/messages/${b.sourceDomain}?transactionHash=${b.tx}`)
  if (res.status === 404) return 'pending'
  if (!res.ok) throw new Error(`iris ${res.status}`)
  const m = ((await res.json()) as any).messages?.[0]
  if (!m || m.status !== 'complete' || !m.message?.startsWith('0x')) return 'pending'
  // header: destinationDomain at bytes 8..12, destinationCaller at 44+..; only relay messages that name OUR receiver as caller
  const hex: string = m.message
  if (parseInt(hex.slice(2 + 16, 2 + 24), 16) !== ARC_DOMAIN) return 'wrong-destination'
  if (('0x' + hex.slice(2 + 2 * 108 + 24, 2 + 2 * 140)).toLowerCase() !== RECEIVER.toLowerCase()) return 'wrong-destination'
  return { message: m.message, attestation: m.attestation }
}

/** Relay every burn whose attestation is ready. Dry-run (reports only) without a keeper key. */
export async function relayPending(): Promise<{ tx: string; status: 'relayed' | 'ready' | 'pending' | 'failed'; relayTx?: string; error?: string }[]> {
  const out: Awaited<ReturnType<typeof relayPending>> = []
  for (const b of db.filter(x => x.status === 'pending')) {
    try {
      const a = await fetchAttested(b)
      if (a === 'pending') { out.push({ tx: b.tx, status: 'pending' }); continue }
      if (a === 'wrong-destination') { b.status = 'failed'; b.error = 'not addressed to the Kolo receiver on Arc'; save(); out.push({ tx: b.tx, status: 'failed', error: b.error }); continue }
      if (await pub.readContract({ address: RECEIVER, abi: RECV_ABI, functionName: 'processedMessages', args: [keccak256(a.message)] })) { b.status = 'relayed'; save(); out.push({ tx: b.tx, status: 'relayed' }); continue }
      if (!wallet || !keeperAccount) { out.push({ tx: b.tx, status: 'ready' }); continue }
      const hash = await wallet.writeContract({ address: RECEIVER, abi: RECV_ABI, functionName: 'relay', args: [a.message, a.attestation], account: keeperAccount, chain: wallet.chain })
      await pub.waitForTransactionReceipt({ hash })
      b.status = 'relayed'; b.relayTx = hash; save(); out.push({ tx: b.tx, status: 'relayed', relayTx: hash })
    } catch (e: any) { out.push({ tx: b.tx, status: 'pending', error: String(e.shortMessage ?? e.message).slice(0, 160) }) }
  }
  return out
}
