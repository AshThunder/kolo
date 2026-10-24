import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { KoloLayout } from '../../components/KoloLayout'
import { Field } from '../../design/Field'
import { usePayeeNames } from '../../hooks/usePayeeNames'
import { PayeeRow } from '../../design/PayeeRow'
import { Skeleton } from '../../design/Skeleton'
import { EmptyState } from '../../design/EmptyState'
import { Button } from '../../design/Button'
import { usePayeeList } from '../../hooks/usePayeeRegistry'
import { AdminContactLine } from '../../components/AdminContact'
import { PayeeApprovalInfo } from '../../components/PayeeApprovalInfo'

const KIND_LABELS = ['School', 'Vendor', 'Hospital', 'All']

export default function PayeesDirectory() {
  const { payeeLabel } = usePayeeNames()
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<number | null>(null)
  const { payees, isLoading, isError, refetch } = usePayeeList()

  // Public list: Verified payees only. Pending applications are visible to the registrar (/admin) and to the applicant (status page).
  const filtered = payees.filter(p => {
    if (!p || p.status !== 2) return false
    if (kindFilter !== null && p.kind !== kindFilter) return false
    if (query && !`${p.wallet} ${payeeLabel(p.id, p.kind, p.nameHash)}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  return (
    <KoloLayout>
      <div className="py-10">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="eyebrow mb-1">Public registry · visible to everyone</p>
            <h1 className="font-display text-[36px] font-medium">Payee directory</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/payees/status"><Button variant="ghost" data-testid="directory-status-link">Check application status</Button></Link>
            <Link to="/payees/apply"><Button variant="ghost">Apply to register</Button></Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {KIND_LABELS.map((l, i) => {
            const k = i === 3 ? null : i
            return (
              <button
                key={l}
                onClick={() => setKindFilter(k)}
                className={`h-8 px-4 rounded-full text-[13px] font-medium border transition-colors ${kindFilter === k ? 'bg-ink text-surface border-ink' : 'border-line hover:border-ink-2'}`}
              >
                {l}
              </button>
            )
          })}
          <div className="flex-1 min-w-[200px] max-w-sm ml-auto">
            <Field
              id="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or address…"
              prefix={<Search size={16} className="text-ink-3 flex-shrink-0" />}
            />
          </div>
        </div>

        {isLoading && <Skeleton rows={4} />}
        {!isLoading && isError && (
          <EmptyState
            title="Couldn’t load the registry"
            body="This browser could not reach Arc or Kolo’s server. Your data is safe on-chain. Check your connection and try again."
            action={<Button variant="ghost" onClick={refetch}>Try again</Button>}
          />
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <EmptyState
            title={query ? `No verified payees match ‘${query}’` : 'No verified payees yet'}
            body="Apply to register a school, vendor or hospital."
            action={<Link to="/payees/apply"><Button variant="ghost">Apply to register</Button></Link>}
          />
        )}
        {!isLoading && !isError && (
          <div className="space-y-6">
            {[
              { title: 'Verified', note: 'Checked by the Kolo registrar. These can be chosen as the payee of a new pot.', rows: filtered },
            ].filter(g => g.rows.length > 0).map(g => (
              <section key={g.title} aria-label={g.title}>
                <div className="flex items-baseline gap-3 mb-2"><h2 className="font-display text-[20px] font-medium">{g.title}</h2><span className="font-mono text-[12px] text-ink-3">{g.rows.length}</span></div>
                <p className="text-[13px] text-ink-3 mb-3">{g.note}</p>
                <div className="space-y-2.5" data-testid={`payees-${g.title.split(' ')[0].toLowerCase()}`}>
                  {g.rows.map(p => (
                    <PayeeRow key={p.id} id={p.id} name={payeeLabel(p.id, p.kind, p.nameHash)} kind={p.kind as 0 | 1 | 2} status={p.status} wallet={p.wallet} verifiedAt={p.verifiedAt} href={`/payees/${p.id}`} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <AdminContactLine className="mt-8" />
        <div className="mt-6"><PayeeApprovalInfo /></div>
      </div>
    </KoloLayout>
  )
}
