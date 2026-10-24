import { decodeEventLog, parseAbi, getAddress, type PublicClient, type Log } from 'viem'
import { KOLO_FACTORY_ABI } from '../abi/KoloFactory'
import { PAYEE_REGISTRY_ABI } from '../abi/PayeeRegistry'
import { KOLO_ADDRESSES, ARC_CHAIN_ID } from '../addresses'
import { NET } from '../network'
import { formatUsdcExact } from './money'
import { fmtDateTime, shortAddr } from './format'

export const RECEIPT_EVENTS = parseAbi([
  'event Contributed(uint256 indexed potId, address indexed contributor, uint256 amount, bytes32 memoHash)',
  'event Released(uint256 indexed potId, uint256 indexed invoiceId, uint256 indexed payeeId, uint256 amount)',
  'event Released(uint256 indexed potId, uint256 indexed payeeId, uint256 amount)',
  'event Refunded(uint256 indexed potId, address indexed contributor, uint256 amount)',
  'event Pulled(uint256 indexed potId, uint256 indexed subId, address indexed subscriber, uint256 amount)',
  'event TermPaid(uint256 indexed potId, uint8 indexed termIndex, address indexed school, uint256 amount)',
  'event Pledged(uint256 indexed potId, address indexed pledger, uint256 amount, uint256 dueBy)',
])
const ERC20_TRANSFER = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])

export interface CheckRow { label: string; detail: string; ok: boolean }
export interface ReceiptResult {
  checks: CheckRow[]
  pass: boolean
  event?: string
  potId?: number
  amount?: string // exact two-plus-decimals string
  timestamp?: string
  kind: 'C' | 'R' | 'F' | 'T'
}

const KIND: Record<string, ReceiptResult['kind']> = { Contributed: 'C', Pulled: 'C', Pledged: 'C', Released: 'R', TermPaid: 'T', Refunded: 'F' }
const ZERO = '0x' + '0'.repeat(64)

/** Re-derives every claim of a Kolo receipt from Arc itself. Nothing is read from the Kolo server. */
export async function verifyReceipt(client: PublicClient, chain: string, tx: string, logIndex: number): Promise<ReceiptResult> {
  const checks: CheckRow[] = []
  const res: ReceiptResult = { checks, pass: false, kind: 'C' }
  const done = () => { res.pass = checks.length > 0 && checks.every(c => c.ok); return res }

  checks.push({ label: 'Network', detail: chain === String(ARC_CHAIN_ID) ? `${NET.label} · chain ${chain}` : `Chain ${chain} is not ${NET.label} (${ARC_CHAIN_ID})`, ok: chain === String(ARC_CHAIN_ID) })
  if (chain !== String(ARC_CHAIN_ID)) return done()

  let receipt, ts: number
  try {
    receipt = await client.getTransactionReceipt({ hash: tx as `0x${string}` })
    ts = Number((await client.getBlock({ blockNumber: receipt.blockNumber })).timestamp)
  } catch {
    checks.push({ label: 'Transaction not found on Arc', detail: `${tx.slice(0, 10)}…${tx.slice(-4)}`, ok: false }); return done()
  }
  res.timestamp = fmtDateTime(ts)
  checks.push({ label: 'Transaction found', detail: `${tx.slice(0, 10)}…${tx.slice(-4)} · block ${Number(receipt.blockNumber).toLocaleString('en-US')} · ${receipt.status === 'success' ? 'succeeded' : 'reverted'}`, ok: receipt.status === 'success' })

  const raw = receipt.logs.find((l: Log) => Number(l.logIndex) === logIndex)
  if (!raw) { checks.push({ label: `No event at log index ${logIndex}`, detail: 'This transaction has no log with that index', ok: false }); return done() }
  let ev: { eventName: string; args: Record<string, unknown> }
  try { ev = decodeEventLog({ abi: RECEIPT_EVENTS, data: raw.data, topics: raw.topics }) }
  catch { checks.push({ label: `Log ${logIndex} is not a Kolo money event`, detail: `emitted by ${shortAddr(raw.address)}`, ok: false }); return done() }

  const a = ev.args as Record<string, bigint | string>
  const amount = a.amount as bigint
  const potId = Number(a.potId)
  res.event = ev.eventName; res.potId = potId; res.amount = formatUsdcExact(amount); res.kind = KIND[ev.eventName] ?? 'C'
  checks.push({ label: `${ev.eventName} event decoded`, detail: `pot #${potId} · ${formatUsdcExact(amount)} USDC · log index ${logIndex}`, ok: true })

  // The emitting contract must be the pot the factory registered under this id.
  const [isClone, registered] = await Promise.all([
    client.readContract({ address: KOLO_ADDRESSES.factory, abi: KOLO_FACTORY_ABI, functionName: 'isClone', args: [raw.address] }),
    client.readContract({ address: KOLO_ADDRESSES.factory, abi: KOLO_FACTORY_ABI, functionName: 'potAddress', args: [BigInt(potId)] }),
  ]).catch(() => [false, ''] as const)
  const genuine = isClone === true && String(registered).toLowerCase() === raw.address.toLowerCase()
  checks.push({ label: genuine ? 'Emitted by a genuine Kolo pot' : 'Not emitted by a Kolo pot', detail: `Factory ${shortAddr(KOLO_ADDRESSES.factory)} registers pot #${potId} at ${shortAddr(raw.address)}`, ok: genuine })
  if (!genuine) return done()

  // Money really moved: a USDC Transfer with the same amount in the same tx.
  const usdc = await client.readContract({ address: KOLO_ADDRESSES.factory, abi: KOLO_FACTORY_ABI, functionName: 'usdc' })
  const transfers = receipt.logs.filter((l: Log) => l.address.toLowerCase() === usdc.toLowerCase()).flatMap((l: Log) => {
    try { const d = decodeEventLog({ abi: ERC20_TRANSFER, data: l.data, topics: l.topics }); return [d.args] } catch { return [] }
  })
  const pot = raw.address.toLowerCase()
  const moved = (pred: (t: { from: string; to: string; value: bigint }) => boolean) => transfers.some(t => t.value === amount && pred(t))

  if (ev.eventName === 'Released') {
    const payeeId = BigInt(a.payeeId)
    if (payeeId === 0n) {
      const paid = transfers.find(t => t.value === amount && t.from.toLowerCase() === pot)
      checks.push({ label: paid ? `${formatUsdcExact(amount)} USDC paid out to the pot's named payee` : 'No matching USDC transfer out of the pot', detail: paid ? `to ${shortAddr(getAddress(paid.to))} · this payee is not in the verified registry` : 'The release event has no USDC movement behind it', ok: !!paid })
      return done()
    }
    const info = await client.readContract({ address: KOLO_ADDRESSES.payeeRegistry, abi: PAYEE_REGISTRY_ABI, functionName: 'payeeInfo', args: [payeeId] }) as readonly [number, number, string, string, string, string, bigint, bigint]
    const wallet = info[2]
    const paid = transfers.find(t => t.value === amount && t.from.toLowerCase() === pot)
    const changed = !!paid && paid.to.toLowerCase() !== wallet.toLowerCase()
    checks.push({ label: paid ? `${formatUsdcExact(amount)} USDC paid out to payee #${String(payeeId).padStart(3, '0')}` : 'No matching USDC transfer out of the pot',
      detail: paid ? `to ${shortAddr(getAddress(paid.to))}${changed ? ` · the registry wallet has changed since (now ${shortAddr(getAddress(wallet))})` : ' · matches the registry wallet'}` : 'The release event has no USDC movement behind it', ok: !!paid })
    const statusText = ['unknown', 'registered, not yet verified', 'verified', 'revoked'][info[1]] ?? 'unknown'
    checks.push({ label: info[1] === 3 ? 'Payee has since been revoked' : info[1] === 2 ? 'Payee verified in PayeeRegistry' : 'Payee registered in PayeeRegistry', detail: `status ${statusText} · ${info[4] !== ZERO ? 'evidence hash on file' : 'no evidence hash'} · registry ${shortAddr(KOLO_ADDRESSES.payeeRegistry)}`, ok: info[1] === 1 || info[1] === 2 })
  } else if (ev.eventName === 'TermPaid') {
    const school = String(a.school)
    const ok = moved(t => t.from.toLowerCase() === pot && t.to.toLowerCase() === school.toLowerCase())
    checks.push({ label: ok ? `${formatUsdcExact(amount)} USDC paid to the school wallet` : 'No matching USDC transfer to the school', detail: shortAddr(school), ok })
  } else if (ev.eventName === 'Refunded') {
    const who = String(a.contributor)
    const ok = moved(t => t.from.toLowerCase() === pot && t.to.toLowerCase() === who.toLowerCase())
    checks.push({ label: ok ? `${formatUsdcExact(amount)} USDC returned to the contributor` : 'No matching USDC refund transfer', detail: shortAddr(who), ok })
  } else if (ev.eventName === 'Pledged') {
    checks.push({ label: 'Pledge recorded', detail: `No USDC moves until the pledge is collected · due ${fmtDateTime(Number(a.dueBy))}`, ok: true })
  } else {
    const ok = moved(t => t.to.toLowerCase() === pot)
    checks.push({ label: ok ? `${formatUsdcExact(amount)} USDC arrived in the pot` : 'No matching USDC transfer into the pot', detail: `into ${shortAddr(raw.address)}`, ok })
  }

  // Origin: native Arc transfer or CCTP mint through Kolo's receiver.
  const viaCctp = receipt.logs.some((l: Log) => l.address.toLowerCase() === KOLO_ADDRESSES.cctpReceiver.toLowerCase())
  if (res.kind === 'C') checks.push({ label: viaCctp ? 'Cross-chain origin: CCTP mint via Kolo receiver' : 'Native Arc contribution', detail: viaCctp ? `receiver ${shortAddr(KOLO_ADDRESSES.cctpReceiver)} in the same transaction` : 'No cross-chain hop in this transaction', ok: true })
  return done()
}
