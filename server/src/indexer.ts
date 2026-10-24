/* oxlint-disable typescript/no-explicit-any -- dynamic ABI/log decoding in the indexer/keeper */
import { formatUnits, decodeFunctionData, parseAbi, type Address } from 'viem'
import { KOLO_ADDRESSES } from '../../src/addresses'
import { NET } from '../../src/network'
import { pub, FACTORY, listPots, potAbi, scanLogs, blockTime, type PotRow } from './chain'
import { KOLO_FACTORY_ABI } from '../../src/abi/KoloFactory'

export const MONEY_EVENTS = [
  'event Contributed(uint256 indexed potId, address indexed contributor, uint256 amount, bytes32 memoHash)',
  'event Released(uint256 indexed potId, uint256 indexed invoiceId, uint256 indexed payeeId, uint256 amount)',
  'event Refunded(uint256 indexed potId, address indexed contributor, uint256 amount)',
  'event Pulled(uint256 indexed potId, uint256 indexed subId, address indexed subscriber, uint256 amount)',
  'event TermPaid(uint256 indexed potId, uint8 indexed termIndex, address indexed school, uint256 amount)',
  'event Pledged(uint256 indexed potId, address indexed pledger, uint256 amount, uint256 dueBy)',
]

type Stats = { pots: number; groupPots: number; tuitionPots: number; locked: string; released: string; refunded: string; contributors: number; contributions: number; updatedAt: string }
let stats: Stats | undefined
const contributedPots = new Map<string, Set<number>>()

export async function refreshStats(): Promise<Stats> {
  const pots = await listPots()
  const [locked, released, refunded] = await pub.readContract({ address: FACTORY, abi: KOLO_FACTORY_ABI, functionName: 'globalStats' }) as readonly bigint[]
  const contributors = new Set<string>(); let contributions = 0; contributedPots.clear()
  if (pots.length) {
    for (const l of await scanLogs(pots.map(p => p.address), [MONEY_EVENTS[0]])) {
      const who = String(l.args.contributor).toLowerCase(); contributors.add(who); contributions++
      ;(contributedPots.get(who) ?? contributedPots.set(who, new Set()).get(who)!).add(Number(l.args.potId))
    }
  }
  stats = { pots: pots.length, groupPots: pots.filter(p => p.type === 'group').length, tuitionPots: pots.filter(p => p.type === 'tuition').length,
    locked: formatUnits(locked, 6), released: formatUnits(released, 6), refunded: formatUnits(refunded, 6),
    contributors: contributors.size, contributions, updatedAt: new Date().toISOString() }
  return stats
}
export const getStats = async () => (stats && Date.now() - Date.parse(stats.updatedAt) < 20_000 ? stats : refreshStats())

export async function resolvePot(idOrAddr: string): Promise<PotRow | undefined> {
  const pots = await listPots()
  return /^0x[0-9a-fA-F]{40}$/.test(idOrAddr)
    ? pots.find(p => p.address.toLowerCase() === idOrAddr.toLowerCase())
    : pots.find(p => p.id === Number(idOrAddr))
}

// CSV cell: neutralise spreadsheet formula injection (=,+,-,@,tab,CR) then RFC 4180 quote
export const esc = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export type Origin = 'arc' | 'base' | 'solana' | 'cctp'
export type LedgerRow = { ts: number; event: string; party: string; amount: string; ref: string; tx: string; logIndex: number; verify: string; origin: Origin }

// Cross-chain pay-ins arrive through KoloCctpReceiver.relay(message, attestation). The CCTP V2 message header carries the
// source domain at bytes 4..8 (Base = 6, Solana = 5), so the origin is recovered from the relay calldata — nothing to trust off-chain.
const RELAY_ABI = parseAbi(['function relay(bytes message, bytes attestation)'])
const DOMAIN_ORIGIN: Record<number, Origin> = { 6: 'base', 5: 'solana' }
const originCache = new Map<string, Origin>()
async function originOf(tx: `0x${string}`): Promise<Origin> {
  const hit = originCache.get(tx); if (hit) return hit
  let o: Origin = 'arc'
  try {
    const t = await pub.getTransaction({ hash: tx })
    if (t.to && t.to.toLowerCase() === KOLO_ADDRESSES.cctpReceiver.toLowerCase()) {
      o = 'cctp'
      try {
        const { args } = decodeFunctionData({ abi: RELAY_ABI, data: t.input }); const msg = args[0] as string
        o = DOMAIN_ORIGIN[parseInt(msg.slice(2 + 8 * 2, 2 + 12 * 2), 16)] ?? 'cctp'
      } catch { /* keep generic cctp */ }
    }
  } catch { return 'arc' } // transient RPC failure: don't cache
  originCache.set(tx, o); return o
}
const ledgerCache = new Map<number, { at: number; p: Promise<LedgerRow[]> }>()
/** Short TTL + in-flight sharing: the pot page, public page and CSV all hit this at once and each scan is many RPC calls. */
export function potLedger(pot: PotRow): Promise<LedgerRow[]> {
  const c = ledgerCache.get(pot.id); if (c && Date.now() - c.at < 15_000) return c.p
  const p = potLedgerFresh(pot); ledgerCache.set(pot.id, { at: Date.now(), p }); p.catch(() => ledgerCache.delete(pot.id)); return p
}
async function potLedgerFresh(pot: PotRow): Promise<LedgerRow[]> {
  const logs = await scanLogs(pot.address, MONEY_EVENTS)
  const blocks = new Map<bigint, number>(); for (const bn of new Set(logs.map(l => l.blockNumber as bigint))) blocks.set(bn, await blockTime(bn))
  const origins = new Map<string, Origin>()
  for (const l of logs) if (l.eventName === 'Contributed' && !origins.has(l.transactionHash!)) origins.set(l.transactionHash!, await originOf(l.transactionHash!))
  return logs.map(l => {
    const a: any = l.args
    const party = a.contributor ?? a.subscriber ?? a.school ?? a.pledger ?? (a.payeeId !== undefined ? `payee#${a.payeeId}` : '')
    const ref = a.invoiceId !== undefined ? `invoice#${a.invoiceId}` : a.subId !== undefined ? `sub#${a.subId}` : a.termIndex !== undefined ? `term#${a.termIndex}` : a.memoHash ?? ''
    return { ts: Number(blocks.get(l.blockNumber)), event: String(l.eventName), party: String(party), amount: formatUnits(a.amount, 6), ref: String(ref),
      tx: l.transactionHash!, logIndex: Number(l.logIndex), verify: `/verify/r/${NET.chainId}/${l.transactionHash}/${l.logIndex}`, origin: origins.get(l.transactionHash!) ?? 'arc' }
  })
}
export async function potCsv(pot: PotRow): Promise<string> {
  const rows: unknown[][] = [['timestamp_utc', 'event', 'party', 'amount_usdc', 'ref', 'tx_hash', 'log_index', 'verify_url', 'origin_chain']]
  for (const r of await potLedger(pot)) rows.push([new Date(r.ts * 1000).toISOString(), r.event, r.party, r.amount, r.ref, r.tx, r.logIndex, r.verify, r.origin])
  return rows.map(r => r.map(esc).join(',')).join('\n') + '\n'
}
export type { Address }

/** Pots an address organises, contributed to, or co-signs. */
const potsForCache = new Map<string, { at: number; v: { organising: number[]; contributed: number[]; cosigning: number[] } }>()
export async function potsFor(addr: string) {
  const c = potsForCache.get(addr.toLowerCase()); if (c && Date.now() - c.at < 20_000) return c.v
  const v = await potsForFresh(addr); potsForCache.set(addr.toLowerCase(), { at: Date.now(), v }); return v
}
async function potsForFresh(addr: string) {
  await refreshStats(); const a = addr.toLowerCase(); const pots = await listPots()
  const res = { organising: [] as number[], contributed: [...(contributedPots.get(a) ?? [])], cosigning: [] as number[] }
  for (const p of pots) {
    const abi = potAbi(p.type) as any
    const org = await pub.readContract({ address: p.address, abi, functionName: 'organizer' }) as string
    if (org.toLowerCase() === a) res.organising.push(p.id)
    if (p.type === 'group') {
      const n = Number(await pub.readContract({ address: p.address, abi, functionName: 'coSignerCount' }))
      for (let i = 0; i < n; i++) if (String(await pub.readContract({ address: p.address, abi, functionName: 'coSigners', args: [BigInt(i)] })).toLowerCase() === a) { res.cosigning.push(p.id); break }
    }
  }
  return res
}

/** Lifecycle events beyond money movement: invoices, approvals, disputes, releases, refunds, milestones. */
export const TIMELINE_EVENTS = [
  'event InvoiceSubmitted(uint256 indexed potId, uint256 indexed invoiceId, uint8 payeeIdx, uint256 amount)',
  'event InvoiceApproved(uint256 indexed potId, uint256 indexed invoiceId, address coSigner)',
  'event InvoiceFlagged(uint256 indexed potId, uint256 indexed invoiceId, address indexed flagger, bytes32 reasonHash)',
  'event InvoiceCancelled(uint256 indexed potId, uint256 indexed invoiceId)',
  'event DisputeResolved(uint256 indexed potId, uint256 indexed invoiceId, bool uphold)',
  'event Released(uint256 indexed potId, uint256 indexed invoiceId, uint256 indexed payeeId, uint256 amount)',
  'event Released(uint256 indexed potId, uint256 indexed payeeId, uint256 amount)',
  'event TermPaid(uint256 indexed potId, uint8 indexed termIndex, address indexed school, uint256 amount)',
  'event MilestoneCompleted(uint256 indexed potId, uint8 milestoneId)',
  'event Refunding(uint256 indexed potId)',
  'event Refunding(uint256 indexed potId, string reason)',
  'event Closed(uint256 indexed potId)',
  'event Paused(uint256 indexed potId)',
  'event Unpaused(uint256 indexed potId)',
]
export type TimelineRow = { ts: number; event: string; tx: string; logIndex: number; invoiceId?: number; payeeIdx?: number; payeeId?: number; actor?: string; amount?: string; uphold?: boolean; reasonHash?: string; reason?: string; termIndex?: number; milestoneId?: number }
export async function potTimeline(pot: PotRow): Promise<TimelineRow[]> {
  const logs = await scanLogs(pot.address, TIMELINE_EVENTS)
  const blocks = new Map<bigint, number>(); for (const bn of new Set(logs.map(l => l.blockNumber as bigint))) blocks.set(bn, await blockTime(bn))
  const origins = new Map<string, Origin>()
  for (const l of logs) if (l.eventName === 'Contributed' && !origins.has(l.transactionHash!)) origins.set(l.transactionHash!, await originOf(l.transactionHash!))
  return logs.map(l => {
    const a: any = l.args
    const row: TimelineRow = { ts: blocks.get(l.blockNumber)!, event: String(l.eventName), tx: l.transactionHash, logIndex: Number(l.logIndex) }
    if (a.invoiceId !== undefined) row.invoiceId = Number(a.invoiceId)
    if (a.payeeIdx !== undefined) row.payeeIdx = Number(a.payeeIdx)
    if (a.payeeId !== undefined) row.payeeId = Number(a.payeeId)
    if (a.amount !== undefined) row.amount = formatUnits(a.amount, 6)
    const actor = a.coSigner ?? a.flagger ?? a.school; if (actor) row.actor = String(actor)
    if (a.uphold !== undefined) row.uphold = Boolean(a.uphold)
    if (a.reasonHash) row.reasonHash = String(a.reasonHash)
    if (typeof a.reason === 'string') row.reason = a.reason
    if (a.termIndex !== undefined) row.termIndex = Number(a.termIndex)
    if (a.milestoneId !== undefined) row.milestoneId = Number(a.milestoneId)
    return row
  })
}

/** Incrementally refresh every pot's ledger and timeline logs (sequential, to stay inside public RPC limits). */
let warming = false
export async function warmIndex() {
  if (warming) return; warming = true
  try { await refreshStats(); for (const p of await listPots()) { await potLedger(p); await potTimeline(p) } } finally { warming = false }
}

// ── Payee activity (payments received, upcoming terms, disputes) ───────────────────────────────
const payeeIdsCache = new Map<number, number[]>()
/** Registry payee ids a pot is sealed to. Immutable after creation, so cached for the process lifetime. */
async function potPayeeIds(p: PotRow): Promise<number[]> {
  const hit = payeeIdsCache.get(p.id); if (hit) return hit
  const abi = potAbi(p.type) as any
  let ids: number[]
  if (p.type === 'tuition') ids = [Number(await pub.readContract({ address: p.address, abi, functionName: 'payeeId' }))]
  else {
    const n = Number(await pub.readContract({ address: p.address, abi, functionName: 'payeeCount' }))
    ids = n ? (await pub.multicall({ allowFailure: false, contracts: Array.from({ length: n }, (_, i) => ({ address: p.address, abi, functionName: 'payeeIds', args: [BigInt(i)] })) }) as bigint[]).map(Number) : []
  }
  payeeIdsCache.set(p.id, ids); return ids
}
export type PayeeActivity = {
  payeeId: number; pots: number[]
  payments: (LedgerRow & { potId: number })[]
  upcoming: { potId: number; termIndex: number; dueDate: number; amount: string }[]
  disputes: (TimelineRow & { potId: number })[]
}
export async function payeeActivity(payeeId: number): Promise<PayeeActivity> {
  const out: PayeeActivity = { payeeId, pots: [], payments: [], upcoming: [], disputes: [] }
  for (const p of await listPots()) {
    if (!(await potPayeeIds(p)).includes(payeeId)) continue
    out.pots.push(p.id)
    for (const r of await potLedger(p)) {
      if (r.event === 'TermPaid' || (r.event === 'Released' && r.party === `payee#${payeeId}`)) out.payments.push({ ...r, potId: p.id })
    }
    for (const r of await potTimeline(p)) if (r.event === 'InvoiceFlagged' || r.event === 'DisputeResolved') out.disputes.push({ ...r, potId: p.id })
    if (p.type === 'tuition') {
      const abi = potAbi(p.type) as any
      const n = Number(await pub.readContract({ address: p.address, abi, functionName: 'termCount' }))
      const terms = n ? await pub.multicall({ allowFailure: false, contracts: Array.from({ length: n }, (_, i) => ({ address: p.address, abi, functionName: 'terms', args: [BigInt(i)] })) }) as any[] : []
      terms.forEach((t, i) => { if (Number(t[2]) === 0) out.upcoming.push({ potId: p.id, termIndex: i, dueDate: Number(t[0]), amount: formatUnits(t[1], 6) }) })
    }
  }
  out.payments.sort((a, b) => b.ts - a.ts); out.disputes.sort((a, b) => b.ts - a.ts); out.upcoming.sort((a, b) => a.dueDate - b.dueDate)
  return out
}
