import { useParams } from 'react-router-dom'
import { UserCheck, FileText, KeyRound, FileSpreadsheet } from 'lucide-react'
import { KoloLayout } from '../../components/KoloLayout'
import { Chip } from '../../design/Chip'
import { Seal } from '../../design/Seal'
import { Skeleton } from '../../design/Skeleton'
import { usePayeeInfo, usePendingWalletChange } from '../../hooks/usePayeeRegistry'
import { usePayeeNames } from '../../hooks/usePayeeNames'
import { PayeeApprovalPanel } from '../../components/PayeeApprovalPanel'
import { BRAND } from '../../brand'
import { Link } from 'react-router-dom'
import { usePayeeActivity } from '../../hooks/useActivity'
import { useIsRegistrar } from '../../hooks/useRegistrar'
import { Button } from '../../design/Button'
import { exportRows } from '../../hooks/useCsvExport'
import { formatDecimal, formatDecimalExact, formatUsdc, toMicro } from '../../lib/money'
import { fmtDate, fmtDateTime, shortAddr } from '../../lib/format'

const KIND_LABELS = ['School', 'Vendor', 'Hospital']
const KIND_ICONS = ['/assets/icons/landmark.svg', '/assets/icons/building-2.svg', '/assets/icons/heart-pulse.svg']

function shortHash(h: string) {
  return h && h !== '0x' + '0'.repeat(64) ? `${h.slice(0, 6)}…${h.slice(-2)}` : '—'
}

export default function PayeeDetail() {
  const { id } = useParams<{ id: string }>()
  const payeeId = Number(id ?? 0)
  const { data, isLoading } = usePayeeInfo(payeeId)
  const pendingChange = usePendingWalletChange(payeeId)
  const { payeeLabel } = usePayeeNames()
  const { isRegistrar, isLoading: roleLoading } = useIsRegistrar()
  const activity = usePayeeActivity(payeeId)
  const payments = activity.data?.payments ?? []
  const upcoming = activity.data?.upcoming ?? []
  const disputes = activity.data?.disputes ?? []
  const hasDoc = (h: string) => !!h && h !== '0x' + '0'.repeat(64)

  if (isLoading) return <KoloLayout><div className="py-10"><Skeleton rows={4} /></div></KoloLayout>

  const pi = data as readonly [number, number, string, string, string, string, bigint, bigint] | undefined
  if (!pi) return <KoloLayout><div className="py-20 text-center text-ink-3">Payee #{payeeId} not found.</div></KoloLayout>

  const [kind, status, wallet, nameHash, docHash, verifier, verifiedAt, registeredAt] = pi
  const isVerified = status === 2
  // Public visitors only get a minimal page for payees that are not (or no longer) verified; the registrar sees everything.
  if (!isVerified && roleLoading) return <KoloLayout><div className="py-10"><Skeleton rows={4} /></div></KoloLayout>
  if (!isVerified && !isRegistrar) return (
    <KoloLayout>
      <div className="max-w-md mx-auto py-20 text-center" data-testid="payee-not-verified">
        <Chip variant="neutral" className="mb-4">Not verified</Chip>
        <h1 className="font-display text-[32px] font-medium mb-2">Payee #{String(payeeId).padStart(3, '0')} is not verified</h1>
        <p className="text-ink-2 text-[15px] mb-6">The Kolo registrar has not verified this payee, so there is nothing to show here yet. Only verified payees have a public page. If this is your organisation, check where your application stands.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link to="/payees/status"><Button variant="ink">Check application status</Button></Link>
          <Link to="/payees"><Button variant="ghost">Verified payees</Button></Link>
        </div>
      </div>
    </KoloLayout>
  )
  const walletPending = pendingChange && pendingChange[0] !== '0x0000000000000000000000000000000000000000'

  return (
    <KoloLayout>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 py-10">
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Chip variant="ink">
              <img src={KIND_ICONS[kind] ?? KIND_ICONS[1]} width={14} height={14} alt="" className="inline mr-1" />
              {KIND_LABELS[kind] ?? 'Unknown'}
            </Chip>
            {isVerified && <Chip variant="green"><img src="/assets/icons/badge-check.svg" width={14} className="inline mr-1" />Verified</Chip>}
            {status === 1 && <Chip variant="neutral">Awaiting verification</Chip>}
            {status === 3 && <Chip variant="warn">Revoked</Chip>}
          </div>

          <h1 className="font-display text-[40px] font-medium mb-1.5">{payeeLabel(payeeId, kind, nameHash)}</h1>
          <p className="text-ink-2">
            {KIND_LABELS[kind] ?? 'Payee'} #{String(payeeId).padStart(3, '0')} · wallet{' '}
            <span className="font-mono text-[14px]">
              {wallet.slice(0, 6)} {wallet.slice(6, 10)} … {wallet.slice(-4)}
            </span>
          </p>

          {walletPending && (
            <div className="mt-4 border-l-4 border-warn bg-warn-soft/40 rounded-r-[12px] px-4 py-3 text-[14px]">
              <p className="font-semibold">Payee wallet change pending: goes live {fmtDateTime(Number(pendingChange[1]))}</p>
              <p className="text-ink-2 mt-0.5">New wallet: <span className="font-mono">{pendingChange[0].slice(0, 8)}…{pendingChange[0].slice(-4)}</span></p>
            </div>
          )}

          {/* Proof checks */}
          <div className="mt-6 border-t-2 border-ink divide-y divide-line">
            <div className="flex items-start gap-3 py-4">
              <UserCheck size={20} strokeWidth={2} className="flex-shrink-0 mt-0.5 text-ink-2" />
              <div>
                <p className="font-semibold text-[15px]">
                  {isVerified ? 'Verified by Kolo Registrar' : status === 1 ? 'Registered (pending verification)' : 'Not verified'}
                </p>
                <p className="font-mono text-[12px] text-ink-3 mt-0.5">
                  {verifiedAt > 0n
                    ? `${fmtDateTime(Number(verifiedAt))} · verifier ${verifier.slice(0, 8)}…${verifier.slice(-4)}`
                    : `Registered ${registeredAt > 0n ? fmtDateTime(Number(registeredAt)) : '—'}`}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 py-4">
              <FileText size={20} strokeWidth={2} className="flex-shrink-0 mt-0.5 text-ink-2" />
              <div>
                <p className="font-semibold text-[15px]">{hasDoc(docHash) ? 'Evidence reviewed' : 'No evidence on file'}</p>
                <p className="text-[14px] text-ink-2 mt-0.5">
                  {hasDoc(docHash)
                    ? <>Registration documents hashed on-chain · <span className="font-mono text-ink-3">doc hash {shortHash(docHash)}</span></>
                    : 'The registrar has not attached registration documents to this payee.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 py-4">
              <KeyRound size={20} strokeWidth={2} className="flex-shrink-0 mt-0.5 text-ink-2" />
              <div>
                <p className="font-semibold text-[15px]">
                  {walletPending ? 'Wallet change pending (48-hour notice)' : 'Wallet unchanged since verification'}
                </p>
                <p className="text-[14px] text-ink-2 mt-0.5">
                  Any change requires a 48-hour public notice shown here.
                </p>
              </div>
            </div>
          </div>

          {/* Payment history */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <span className="eyebrow">Payment history</span>
              <button
                type="button"
                disabled={payments.length === 0}
                onClick={() => exportRows(
                  ['timestamp_utc', 'pot_id', 'event', 'reference', 'amount_usdc', 'arc_tx', 'log_index', 'verify_url'],
                  payments.map(p => [new Date(p.ts * 1000).toISOString(), String(p.potId), p.event, p.ref, formatDecimalExact(p.amount), p.tx, String(p.logIndex), `${window.location.origin}${p.verify}`]),
                  `kolo-payee-${payeeId}.csv`)}
                className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 border border-line rounded-[10px] px-3 h-9 hover:border-ink disabled:opacity-40 disabled:hover:border-line"
              >
                <FileSpreadsheet size={15} />CSV
              </button>
            </div>
            {activity.isLoading && <Skeleton rows={2} />}
            {!activity.isLoading && payments.length === 0 && <p className="text-ink-3 text-[14px]">No payments released to this payee yet.</p>}
            {payments.length > 0 && (
              <table className="w-full border-collapse text-[14px]" data-testid="payee-payments">
                <thead><tr>
                  <th className="eyebrow text-left pb-2 pr-3 border-b border-line">Date</th>
                  <th className="eyebrow text-left pb-2 pr-3 border-b border-line">Pot</th>
                  <th className="eyebrow text-left pb-2 pr-3 border-b border-line">For</th>
                  <th className="eyebrow text-right pb-2 pr-3 border-b border-line">Amount</th>
                  <th className="eyebrow text-right pb-2 border-b border-line">Receipt</th>
                </tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={`${p.tx}:${p.logIndex}`} className="border-b border-line">
                      <td className="py-2.5 pr-3 font-mono text-[12px] text-ink-3 whitespace-nowrap">{fmtDateTime(p.ts)}</td>
                      <td className="py-2.5 pr-3 font-mono text-[13px]">#{p.potId}</td>
                      <td className="py-2.5 pr-3 text-ink-2">{p.ref.replace('#', ' #')}</td>
                      <td className="py-2.5 pr-3 text-right num font-mono">{formatDecimal(p.amount)} <span className="text-ink-3 text-[12px]">USDC</span></td>
                      <td className="py-2.5 text-right"><Link to={p.verify} className="text-green font-medium hover:underline">Verify</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {upcoming.length > 0 && (
              <div className="mt-6">
                <span className="eyebrow">Upcoming terms</span>
                <ul className="mt-2 divide-y divide-line border-t border-line text-[14px]">
                  {upcoming.map(u => (
                    <li key={`${u.potId}:${u.termIndex}`} className="flex justify-between py-2.5">
                      <span>Pot #{u.potId} · Term {u.termIndex + 1} · due {fmtDate(u.dueDate)}</span>
                      <span className="num font-mono">{formatDecimal(u.amount)} <span className="text-ink-3 text-[12px]">USDC</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4">
              <a
                href={`${BRAND.explorerBase}/address/${wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-green text-[14px] font-medium hover:underline"
              >
                View wallet on Arc Explorer ↗
              </a>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-surface border border-line rounded-lg p-8 text-center">
            <Seal released={isVerified} size={130} />
            <div className="grid grid-cols-2 border-t border-line mt-6 pt-4" data-testid="payee-stats">
              <div><span className="eyebrow">Received</span><p className="font-display text-[26px] mt-1 num">{formatUsdc(payments.reduce((n, p) => n + toMicro(p.amount), 0n))}</p></div>
              <div className="border-l border-line"><span className="eyebrow">Pots</span><p className="font-display text-[26px] mt-1 num">{activity.data?.pots.length ?? 0}</p></div>
            </div>
          </div>
          <PayeeApprovalPanel id={payeeId} name={payeeLabel(payeeId, kind, nameHash)} status={status} verifier={verifier} pending={walletPending ? { newWallet: pendingChange[0], executeAfter: Number(pendingChange[1]) } : undefined} />
          <div className="bg-surface border border-line rounded-lg p-5">
            <span className="eyebrow">Disputes against this payee</span>
            {disputes.length === 0
              ? <p className="mt-2 text-[14px] text-ink-2">No disputes recorded.</p>
              : <ul className="mt-2 space-y-2 text-[14px]" data-testid="payee-disputes">
                  {disputes.map(d => (
                    <li key={`${d.tx}:${d.logIndex}`}>
                      <p className="text-ink">
                        {d.event === 'InvoiceFlagged' ? `Invoice #${d.invoiceId} flagged` : `Invoice #${d.invoiceId} dispute ${d.uphold ? 'upheld' : 'dismissed'}`}
                        <span className="text-ink-3"> · pot #{d.potId}</span>
                      </p>
                      <p className="font-mono text-[12px] text-ink-3">{fmtDateTime(d.ts)}{d.actor ? ` · ${shortAddr(d.actor)}` : ''}</p>
                    </li>
                  ))}
                </ul>}
          </div>
        </div>
      </div>
    </KoloLayout>
  )
}
