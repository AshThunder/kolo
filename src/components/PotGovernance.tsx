// Invoices, approvals, disputes, release and close/refund for a GroupPot — every action is a real Arc tx.
import { useAccount, useReadContract, useReadContracts, useWriteContract, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import { keccak256, toBytes, type Address } from 'viem'
import { useState } from 'react'
import { KOLO_GROUP_POT_ABI } from '../abi/KoloGroupPot'
import { InvoiceCard } from '../design/InvoiceCard'
import { DisputeCard } from '../design/DisputeCard'
import { Button } from '../design/Button'
import { formatUsdc } from '../lib/money'
import { usePotPayee } from '../hooks/usePotPayee'
import { ARC_CHAIN_ID } from '../addresses'

const C = ARC_CHAIN_ID
const STATUS = ['None', 'Pending', 'Approved', 'Released', 'Cancelled', 'Disputed']
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export function PotGovernance({ pot }: { pot: Address; potId?: number }) {
  const { address: me } = useAccount()
  const client = usePublicClient({ chainId: C })
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState<string>()
  const sealed = usePotPayee(pot, true)
  const payTo = (idx: number) => idx === 0 ? (sealed.payeeId > 0 ? sealed.payeeName : `sealed address ${sealed.wallet}`) : `payee #${idx + 1}`
  const base = { address: pot, abi: KOLO_GROUP_POT_ABI, chainId: C } as const
  const { data: head, refetch: refetchHead } = useReadContracts({ contracts: [
    { ...base, functionName: 'invoiceCount' }, { ...base, functionName: 'organizer' }, { ...base, functionName: 'threshold' },
    { ...base, functionName: 'coSignerCount' }, { ...base, functionName: 'state' }, { ...base, functionName: 'closeApprovalBitmap' },
    { ...base, functionName: 'contributed', args: [me ?? '0x0000000000000000000000000000000000000000'] },
  ], query: { refetchInterval: 8000 } })
  const n = Number(head?.[0]?.result ?? 0), organizer = head?.[1]?.result
  const threshold = Number(head?.[2]?.result ?? 0), csCount = Number(head?.[3]?.result ?? 0), state = Number(head?.[4]?.result ?? 0)
  const closeBits = BigInt((head?.[5]?.result) ?? 0n), myContribution = BigInt((head?.[6]?.result) ?? 0n)
  const { data: cosRes } = useReadContracts({ contracts: Array.from({ length: csCount }, (_, i) => ({ ...base, functionName: 'coSigners', args: [BigInt(i)] } as const)) })
  const cosigners = (cosRes ?? []).map(r => String(r.result ?? '').toLowerCase())
  const { data: invRes, refetch: refetchInv } = useReadContracts({ contracts: Array.from({ length: n }, (_, i) => ({ ...base, functionName: 'invoices', args: [BigInt(i + 1)] } as const)), query: { refetchInterval: 8000 } })
  const { data: unlocked } = useReadContract({ ...base, functionName: 'totalContributed' })

  const meL = me?.toLowerCase()
  const isOrg = !!meL && meL === organizer?.toLowerCase()
  const myCs = meL ? cosigners.indexOf(meL) : -1
  const mySigner = isOrg || myCs >= 0
  const myBit = isOrg ? 1n << 127n : myCs >= 0 ? 1n << BigInt(myCs) : 0n
  const slotsFor = (bits: bigint) => [
    { label: 'Organiser', approved: (bits & (1n << 127n)) !== 0n },
    ...cosigners.map((c, i) => ({ label: short(c), approved: (bits & (1n << BigInt(i))) !== 0n })),
  ]

  async function tx(label: string, functionName: string, args: unknown[]) {
    if (!me) { toast.error('Sign in first'); return }
    setBusy(label)
    try {
      const write = writeContractAsync as unknown as (p: Record<string, unknown>) => Promise<`0x${string}`>
      const hash = await write({ ...base, functionName, args })
      await client!.waitForTransactionReceipt({ hash })
      toast.success(`${label} confirmed`, { description: hash.slice(0, 10) + '…' })
      await Promise.all([refetchHead(), refetchInv()])
    } catch (e) {
      const m = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message
      toast.error(`${label} failed`, { description: String(m).slice(0, 120) })
    } finally { setBusy(undefined) }
  }

  const closeStarted = (closeBits & (1n << 127n)) !== 0n
  return (
    <div className="bg-surface border border-line rounded-lg p-5 space-y-4" data-testid="pot-governance">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Invoices & approvals · {threshold} of {csCount + 1} signers</span>
        {busy && <span className="font-mono text-[12px] text-ink-3" data-testid="tx-busy">{busy}…</span>}
      </div>
      {n === 0 && <p className="text-ink-3 text-[14px]">No invoices yet. The organiser submits one; co-signers approve before any money moves.</p>}
      {(invRes ?? []).map((r, i) => {
        const inv = r.result; if (!inv) return null
        const id = i + 1, st = STATUS[inv[2]] ?? '?'
        if (st === 'Disputed') return (
          <div key={id} data-testid={`invoice-${id}`}>
            <DisputeCard milestoneLabel={`invoice #${id} · ${formatUsdc(inv[3])} USDC`} flaggedBy="a contributor" flaggedAt="on-chain" reason=""
              slots={slotsFor(inv[7]).map(s => ({ label: s.label, voted: s.approved }))} deadlineLabel="the pot deadline + grace"
              canVote={mySigner && (inv[7] & myBit) === 0n && !busy}
              onUphold={() => void tx('Uphold invoice', 'resolve', [BigInt(id), true])} onReject={() => void tx('Reject invoice', 'resolve', [BigInt(id), false])} />
          </div>)
        return (
          <div key={id} data-testid={`invoice-${id}`} data-status={st}>
            <InvoiceCard invoiceId={id} description={`Payment to ${payTo(inv[0])}`} amount={`${formatUsdc(inv[3])} USDC`}
              sha256Short={`${inv[4].slice(2, 10)}…${inv[4].slice(-6)}`} status={st} slots={slotsFor(inv[6])}
              canApprove={st === 'Pending' && mySigner && (inv[6] & myBit) === 0n && !busy} onApprove={() => void tx('Approve', 'approve', [BigInt(id)])}
              canRelease={st === 'Approved' && isOrg && !busy} onRelease={() => void tx('Release', 'release', [BigInt(id)])}
              canFlag={(st === 'Pending' || st === 'Approved') && myContribution > 0n && !busy}
              onFlag={() => void tx('Flag dispute', 'flagInvoice', [BigInt(id), keccak256(toBytes('flagged in Kolo UI'))])} />
          </div>)
      })}
      {state === 0 && (isOrg || (myCs >= 0 && closeStarted)) && (
        <div className="border-t border-line pt-4 flex items-center gap-3">
          <p className="flex-1 text-[13px] text-ink-2">
            {closeStarted ? `Close requested by the organiser — ${threshold} signer(s) needed to open refunds.` : `Call it off: once ${threshold} signer(s) agree, the unspent ${formatUsdc(unlocked ?? 0n)} USDC becomes refundable pro-rata.`}
          </p>
          {isOrg && !closeStarted && <Button variant="warn" size="sm" disabled={!!busy} onClick={() => void tx('Close pot', 'close', [])} data-testid="close-pot">Close & refund</Button>}
          {myCs >= 0 && closeStarted && (closeBits & myBit) === 0n && <Button variant="ink" size="sm" disabled={!!busy} onClick={() => void tx('Approve close', 'approveClose', [])} data-testid="approve-close">Approve close</Button>}
        </div>
      )}
      {state === 1 && <p className="text-[13px] text-warn font-semibold" data-testid="pot-refunding">Closed · contributors can claim their pro-rata refund.</p>}
    </div>
  )
}
