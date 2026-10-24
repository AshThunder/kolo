import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { KoloLayout } from '../../components/KoloLayout'
import { Skeleton } from '../../design/Skeleton'
import { EmptyState } from '../../design/EmptyState'
import { Chip } from '../../design/Chip'
import { usePayeeList } from '../../hooks/usePayeeRegistry'
import { usePayeeNames } from '../../hooks/usePayeeNames'
import { usePayeeActivity } from '../../hooks/useActivity'
import { formatDecimal } from '../../lib/money'
import { fmtDate, fmtDateTime } from '../../lib/format'

function Account({ id, kind, nameHash, status }: { id: number; kind: number; nameHash: string; status: number }) {
  const { payeeLabel } = usePayeeNames()
  const { data, isLoading } = usePayeeActivity(id)
  const payments = data?.payments ?? [], upcoming = data?.upcoming ?? []
  const total = payments.reduce((n, p) => n + Math.round(Number(p.amount) * 1e6), 0) / 1e6
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 mt-8 first:mt-0" data-testid={`school-account-${id}`}>
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="font-display text-[26px] font-medium">{payeeLabel(id, kind, nameHash)}</h2>
          {status === 2 ? <Chip variant="green">Verified</Chip> : <Chip variant="neutral">Registered</Chip>}
        </div>
        <Link to={`/payees/${id}`} className="text-[13px] text-green hover:underline">Public proof page ↗</Link>

        <span className="eyebrow block mt-6">Upcoming terms</span>
        {isLoading ? <div className="mt-3"><Skeleton rows={2} /></div> : upcoming.length === 0
          ? <p className="text-ink-3 text-[14px] mt-3">No terms scheduled. Pots naming this school as payee will appear here.</p>
          : <ul className="mt-2 divide-y divide-line border-t border-line text-[14px]">
              {upcoming.map(u => (
                <li key={`${u.potId}:${u.termIndex}`} className="flex justify-between py-2.5">
                  <span>Pot #{u.potId} · Term {u.termIndex + 1} · due {fmtDate(u.dueDate)}</span>
                  <span className="num font-mono">{formatDecimal(u.amount)} <span className="text-ink-3 text-[12px]">USDC</span></span>
                </li>
              ))}
            </ul>}

        <span className="eyebrow block mt-8">Receipts</span>
        {isLoading ? <div className="mt-3"><Skeleton rows={2} /></div> : payments.length === 0
          ? <p className="text-ink-3 text-[14px] mt-3">No payments received yet.</p>
          : <ul className="mt-2 divide-y divide-line border-t border-line text-[14px]">
              {payments.map(p => (
                <li key={`${p.tx}:${p.logIndex}`} className="flex items-center justify-between py-2.5 gap-4">
                  <span><span className="font-mono text-[12px] text-ink-3">{fmtDateTime(p.ts)}</span><span className="text-ink-2"> · pot #{p.potId} · {p.ref.replace('#', ' #')}</span></span>
                  <span className="flex items-center gap-4">
                    <span className="num font-mono">{formatDecimal(p.amount)} <span className="text-ink-3 text-[12px]">USDC</span></span>
                    <Link to={p.verify} className="text-green font-medium hover:underline">Receipt</Link>
                  </span>
                </li>
              ))}
            </ul>}
      </div>
      <div className="bg-surface border border-line rounded-lg p-5 self-start">
        <span className="eyebrow">Total received</span>
        <p className="font-display text-[28px] font-medium mt-1 num" data-testid="school-total">{formatDecimal(total)} <span className="font-mono text-[14px] text-ink-3">USDC</span></p>
        <p className="text-[13px] text-ink-3 mt-1">{payments.length} payment{payments.length === 1 ? '' : 's'} · {data?.pots.length ?? 0} pot{data?.pots.length === 1 ? '' : 's'}</p>
      </div>
    </div>
  )
}

export default function SchoolPortal() {
  const { address } = useAccount()
  const { payees, isLoading } = usePayeeList()

  if (!address) {
    return (
      <KoloLayout>
        <EmptyState
          illustration="/assets/illustrations/empty-pot.svg"
          title="Sign in to access the school portal"
          body="Connect the wallet registered as a verified school to see your pots, upcoming terms and receipts."
        />
      </KoloLayout>
    )
  }

  const mine = payees.filter(p => p && p.wallet.toLowerCase() === address.toLowerCase())

  return (
    <KoloLayout>
      <div className="py-10">
        <p className="eyebrow mb-1">School portal</p>
        <h1 className="font-display text-[36px] font-medium mb-1">Upcoming terms &amp; receipts</h1>
        <p className="font-mono text-[12px] text-ink-3 mb-8 break-all">Signed in as {address}</p>
        {isLoading && <Skeleton rows={3} />}
        {!isLoading && mine.length === 0 && (
          <EmptyState
            illustration="/assets/illustrations/empty-pot.svg"
            title="This wallet is not a registered payee"
            body="Only the wallet recorded in the payee registry can see its terms and receipts. Apply to join the registry, or connect the registered wallet."
          />
        )}
        {mine.map(p => p && <Account key={p.id} id={p.id} kind={p.kind} nameHash={p.nameHash} status={p.status} />)}
      </div>
    </KoloLayout>
  )
}
