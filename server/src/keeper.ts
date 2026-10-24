/* oxlint-disable typescript/no-explicit-any -- dynamic ABI/log decoding in the indexer/keeper */
import { parseAbi, type Address } from 'viem'
import { KOLO_ADDRESSES } from '../../src/addresses'
import { relayPending } from './cctp'
import { pub, wallet, keeperAccount, listPots, potAbi, scanLogs, SWEEPER_FACTORY, USDC, START_BLOCK } from './chain'

export type KeeperAction = { kind: 'pull' | 'payTerm' | 'sweep' | 'relay'; target: Address; arg?: number; status: 'sent' | 'dry-run' | 'error'; tx?: string; error?: string }
const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)'])
const SWEEPER = parseAbi(['function sweep()', 'function pendingBalance() view returns (uint256)'])
const PAY_WINDOW = 3 * 86400

async function send(a: Omit<KeeperAction, 'status'>, req: () => Promise<`0x${string}`>): Promise<KeeperAction> {
  if (!wallet) return { ...a, status: 'dry-run' }
  try { const tx = await req(); await pub.waitForTransactionReceipt({ hash: tx }); return { ...a, status: 'sent', tx } }
  catch (e: any) { return { ...a, status: 'error', error: String(e.shortMessage ?? e.message).slice(0, 160) } }
}

/** Find due work. Pure reads; safe to call without a key. */
export async function findDue(now = Math.floor(Date.now() / 1000)) {
  const due: Omit<KeeperAction, 'status'>[] = []
  for (const p of await listPots()) {
    const abi = potAbi(p.type) as any
    const [state, subCount] = await pub.multicall({ allowFailure: false, contracts: [
      { address: p.address, abi, functionName: 'state' }, { address: p.address, abi, functionName: 'subCount' }] }) as [number, bigint]
    if (Number(state) !== 0) continue // only Active pots
    for (let s = 1n; s <= subCount; s++) {
      const sub = await pub.readContract({ address: p.address, abi, functionName: 'subscriptions', args: [s] }) as any[]
      // (subscriber, amountPerPull, interval, maxPulls, pullCount, nextDue, active)
      if (sub[6] && Number(sub[5]) <= now) due.push({ kind: 'pull', target: p.address, arg: Number(s) })
    }
    if (p.type === 'tuition') {
      const termCount = Number(await pub.readContract({ address: p.address, abi, functionName: 'termCount' }))
      const bal = await pub.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [p.address] })
      let avail = bal
      for (let i = 0; i < termCount; i++) {
        const t = await pub.readContract({ address: p.address, abi, functionName: 'terms', args: [BigInt(i)] }) as any[]
        // (dueDate, amount, status, invoiceHash); status 0 = Pending
        if (Number(t[2]) === 0 && now >= Number(t[0]) - PAY_WINDOW && avail >= t[1]) { due.push({ kind: 'payTerm', target: p.address, arg: i }); avail -= t[1] }
      }
    }
  }
  const deployed = await scanLogs(SWEEPER_FACTORY, ['event SweeperDeployed(address indexed sweeper, address indexed pot, address indexed contributor)'], START_BLOCK)
  for (const l of deployed) {
    const sw = (l.args as any).sweeper as Address
    if ((await pub.readContract({ address: sw, abi: SWEEPER, functionName: 'pendingBalance' })) > 0n) due.push({ kind: 'sweep', target: sw })
  }
  return due
}

export async function runKeeper(): Promise<KeeperAction[]> {
  const out: KeeperAction[] = []
  for (const d of await findDue()) {
    const abi = d.kind === 'sweep' ? SWEEPER : parseAbi(['function pull(uint256)', 'function payTerm(uint8)'])
    out.push(await send(d, () => wallet!.writeContract({
      address: d.target, abi: abi as any, account: keeperAccount!, chain: wallet!.chain,
      functionName: d.kind === 'sweep' ? 'sweep' : d.kind, args: d.kind === 'sweep' ? [] : [d.kind === 'pull' ? BigInt(d.arg!) : d.arg!] } as any)))
  }
  // Cross-chain pay-ins whose Circle attestation is ready
  for (const r of await relayPending()) if (r.status !== 'pending') out.push({ kind: 'relay', target: KOLO_ADDRESSES.cctpReceiver as Address, status: r.status === 'ready' ? 'dry-run' : r.status === 'relayed' ? 'sent' : 'error', tx: r.relayTx, error: r.error })
  return out
}
