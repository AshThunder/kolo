import { useSignMessage } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Link } from 'react-router-dom'
import { Loader2, Wallet, ShieldCheck, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { KoloLayout } from '../../components/KoloLayout'
import { EmptyState } from '../../design/EmptyState'
import { Skeleton } from '../../design/Skeleton'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { PayeeRow } from '../../design/PayeeRow'
import { PayeeApprovalInfo } from '../../components/PayeeApprovalInfo'
import { RegistrarActions } from '../../components/RegistrarActions'
import { useAdminPayeeList } from '../../hooks/usePayeeRegistry'
import { usePayeeNames } from '../../hooks/usePayeeNames'
import { useApplications, useRejectApplication, type Application } from '../../hooks/useActivity'
import { useState } from 'react'
import { useIsRegistrar, useRegistrarTx } from '../../hooks/useRegistrar'
import { shortAddr } from '../../lib/format'
import { KOLO_ADDRESSES } from '../../addresses'

const KIND = { school: 0, vendor: 1, hospital: 2 } as const

function ApplicationCard({ a, canAct, onReject }: { a: Application; canAct: boolean; onReject: (id: number, reason: string) => Promise<boolean> }) {
  const { run, busy } = useRegistrarTx()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const key = `register:${a.wallet}`
  return (
    <li className="border border-line rounded-[14px] bg-surface px-4 py-3.5 flex flex-wrap items-center gap-3" data-testid="application">
      <div className="flex-1 min-w-[220px]">
        <p className="font-semibold text-[15px]">{a.name}</p>
        <p className="font-mono text-[12px] text-ink-3 mt-0.5 capitalize">{a.kind} · {shortAddr(a.wallet)}{a.country ? ` · ${a.country}` : ''}{a.regNo ? ` · reg ${a.regNo}` : ''}</p>
      </div>
      <Chip variant={a.status === 'registered' ? 'green' : a.status === 'pending' ? 'neutral' : 'warn'}>{a.status === 'registered' ? 'On-chain' : a.status[0].toUpperCase() + a.status.slice(1)}</Chip>
      {a.status === 'pending' && canAct && !rejecting && (
        <div className="flex gap-2">
          <Button size="sm" variant="ink" disabled={!!busy} onClick={() => { void run({ kind: 'register', payeeKind: KIND[a.kind], wallet: a.wallet as `0x${string}`, name: a.name, regNo: a.regNo }) }}>
            {busy === key && <Loader2 size={14} className="animate-spin" />}Register on-chain
          </Button>
          <Button size="sm" variant="ghost" data-testid="reject-open" onClick={() => setRejecting(true)}>Reject</Button>
        </div>
      )}
      {a.status === 'rejected' && a.rejectReason && <p className="basis-full text-[13px] text-ink-3">Reason shown to the applicant: {a.rejectReason}</p>}
      {rejecting && (
        <div className="basis-full flex flex-wrap items-center gap-2" data-testid="reject-form">
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Reason (optional, shown to the applicant)" aria-label="Rejection reason" className="flex-1 min-w-[220px] h-10 px-3 rounded-[10px] border border-line bg-paper text-[14px] outline-none focus:border-ink" />
          <Button size="sm" variant="warn" disabled={sending} data-testid="reject-confirm" onClick={() => { setSending(true); void onReject(a.id, reason).then(ok => { setSending(false); if (ok) setRejecting(false) }) }}>{sending && <Loader2 size={14} className="animate-spin" />}Reject application</Button>
          <Button size="sm" variant="ghost" disabled={sending} onClick={() => setRejecting(false)}>Cancel</Button>
        </div>
      )}
    </li>
  )
}

/** What everyone except the registrar sees: no lists, no queue, nothing about applicants. */
function RegistrarGate({ address, checking }: { address?: string; checking: boolean }) {
  return (
    <KoloLayout>
      <div className="max-w-md mx-auto py-24 text-center" data-testid="registrar-gate">
        <span className="mx-auto mb-5 w-14 h-14 rounded-full bg-paper border border-line grid place-items-center"><Lock size={22} className="text-ink-2" /></span>
        <h1 className="font-display text-[32px] font-medium mb-2">Registrar access only</h1>
        {checking
          ? <p className="text-ink-3 text-[15px]" role="status">Checking this wallet…</p>
          : <p className="text-ink-2 text-[15px] mb-6">{address ? 'The connected wallet is not a registrar. Connect the registrar wallet to continue.' : 'Connect the registrar wallet to continue.'}</p>}
        {!checking && (
          <ConnectKitButton.Custom>{({ show }) => <Button variant="ink" onClick={show} data-testid="gate-connect"><Wallet size={16} />{address ? 'Switch wallet' : 'Connect wallet'}</Button>}</ConnectKitButton.Custom>
        )}
      </div>
    </KoloLayout>
  )
}

export default function AdminRegistry() {
  const { address, isRegistrar, isLoading: roleLoading } = useIsRegistrar()
  if (!address || roleLoading || !isRegistrar) return <RegistrarGate address={address} checking={roleLoading} />
  return <RegistrarConsole address={address} />
}

function RegistrarConsole({ address }: { address: `0x${string}` }) {
  const { payees, isLoading, isError, refetch } = useAdminPayeeList()
  const { payeeLabel } = usePayeeNames()
  const { signMessageAsync } = useSignMessage()
  const apps = useApplications(address, signMessageAsync)
  const rejectMut = useRejectApplication(address, signMessageAsync)
  const [rejected, setRejected] = useState<Record<number, string>>({})
  const queue = (apps.data ?? []).map(a => rejected[a.id] !== undefined ? { ...a, status: 'rejected' as const, rejectReason: rejected[a.id] || undefined } : a)
  const nameOf = (p: (typeof payees)[number]) => queue.find(a => a.wallet.toLowerCase() === p.wallet.toLowerCase())?.name ?? payeeLabel(p.id, p.kind, p.nameHash)
  const waiting = payees.filter(p => p.status === 1)
  const reject = async (id: number, reason: string) => {
    try { await rejectMut.mutateAsync({ id, reason }); setRejected(r => ({ ...r, [id]: reason.trim() })); toast.success('Application rejected', { description: reason.trim() ? 'The applicant will see your reason on the status page.' : 'The applicant will see it on the status page.' }); return true }
    catch { toast.error('Could not reject. Not authorised, or the signature was declined.'); return false }
  }

  return (
    <KoloLayout>
      <div className="py-10 max-w-[860px]">
        <p className="eyebrow mb-1">Registrar console</p>
        <h1 className="font-display text-[36px] font-medium mb-2">Approve payees</h1>
        <p className="text-ink-2 text-[15px] mb-6 max-w-[620px]">
          Visible only to wallets holding the registrar role on the PayeeRegistry
          (<a className="font-mono text-[13px] underline" href={`https://explorer.arc.io/address/${KOLO_ADDRESSES.payeeRegistry}`} target="_blank" rel="noopener noreferrer">{shortAddr(KOLO_ADDRESSES.payeeRegistry)}</a>). Applicants see only their own status, and the public directory lists Verified payees only.
        </p>

        <div className="border border-line rounded-[14px] bg-surface p-4 flex flex-wrap items-center gap-3 mb-8" data-testid="registrar-status">
          <ShieldCheck size={20} className="text-green" />
          <div className="flex-1 min-w-[220px]"><p className="font-semibold text-[15px]">You are the registrar</p><p className="font-mono text-[12px] text-ink-3">{shortAddr(address)} · Verify, Revoke, Register and Reject are enabled</p></div>
        </div>

        <section className="mb-10" aria-label="Awaiting verification">
          <div className="flex items-baseline gap-3 mb-3"><h2 className="font-display text-[22px] font-medium">Awaiting verification</h2><span className="font-mono text-[12px] text-ink-3">{waiting.length}</span></div>
          {isLoading && <Skeleton rows={2} />}
          {!isLoading && waiting.length === 0 && !isError && <p className="text-[14px] text-ink-3">Nothing to verify. Every registered payee is already verified.</p>}
          <ul className="space-y-2.5">
            {waiting.map(p => (
              <li key={p.id} className="space-y-2">
                <PayeeRow id={p.id} name={nameOf(p)} kind={p.kind as 0 | 1 | 2} status={p.status} wallet={p.wallet} href={`/payees/${p.id}`} />
                <div className="pl-1"><RegistrarActions id={p.id} status={p.status} name={nameOf(p)} /></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10" aria-label="Applications">
          <h2 className="font-display text-[22px] font-medium mb-1">Applications</h2>
          <p className="text-[13px] text-ink-3 mb-3">Sent from the <Link to="/payees/apply" className="underline">Apply page</Link>. Registering stores the name hash and wallet on-chain; verification is a second step. A rejection reason is shown to the applicant on their status page.</p>
          {!apps.data && !apps.isPending && (
            <p className="text-ink-2 text-[14px]">
              The queue is private to the registrar. <button type="button" data-testid="load-queue" className="underline font-medium" onClick={() => apps.mutate()}>Sign to load it</button>
              {apps.isError && <span className="text-warn"> Not authorised, or the signature was declined.</span>}
            </p>
          )}
          {apps.isPending && <Skeleton rows={2} />}
          {apps.data && apps.data.length === 0 && <p className="text-ink-3 text-[14px]">No applications waiting.</p>}
          {queue.length > 0 && <ul className="space-y-2.5" data-testid="application-queue">{queue.map(a => <ApplicationCard key={a.id} a={a} canAct onReject={reject} />)}</ul>}
        </section>

        <section className="mb-10" aria-label="All payees">
          <h2 className="font-display text-[22px] font-medium mb-3">Registry</h2>
          {isLoading && <Skeleton rows={3} />}
          {!isLoading && isError && <EmptyState title="Couldn’t load the registry" body="Check your connection and try again." action={<Button variant="ghost" onClick={refetch}>Try again</Button>} />}
          <ul className="space-y-2.5">
            {payees.map(p => (
              <li key={p.id} className="space-y-2">
                <PayeeRow id={p.id} name={nameOf(p)} kind={p.kind as 0 | 1 | 2} status={p.status} wallet={p.wallet} verifiedAt={p.verifiedAt} href={`/payees/${p.id}`} />
                {p.status === 2 && <div className="pl-1"><RegistrarActions id={p.id} status={p.status} name={nameOf(p)} /></div>}
              </li>
            ))}
          </ul>
        </section>

        <PayeeApprovalInfo />
      </div>
    </KoloLayout>
  )
}
