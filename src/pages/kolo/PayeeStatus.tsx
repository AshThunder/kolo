import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, X, Search, ExternalLink, Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { KoloLayout } from '../../components/KoloLayout'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Field } from '../../design/Field'
import { AdminContactCard } from '../../components/AdminContact'
import { API_BASE } from '../../lib/api'
import { BRAND } from '../../brand'
import { loadSavedApplication, saveApplication, type SavedApplication } from '../../lib/application'
import type { ApplicationStatus, StatusStep } from '../../hooks/useActivity'
import { shortAddr } from '../../lib/format'

type Result = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; data: ApplicationStatus; q: SavedApplication }

const when = (iso?: string) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : ''
const isWallet = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim())
const STAGE_CHIP = { review: ['Under review', 'neutral'], registered: ['Registered, awaiting verification', 'neutral'], verified: ['Verified', 'green'], revoked: ['Revoked', 'warn'], rejected: ['Rejected', 'warn'] } as const

function Dot({ s }: { s: StatusStep['state'] }) {
  if (s === 'done') return <span className="w-7 h-7 rounded-full bg-green text-surface grid place-items-center shrink-0"><Check size={15} strokeWidth={3} /></span>
  if (s === 'failed') return <span className="w-7 h-7 rounded-full bg-warn text-surface grid place-items-center shrink-0"><X size={15} strokeWidth={3} /></span>
  if (s === 'current') return <span className="w-7 h-7 rounded-full border-2 border-ink grid place-items-center shrink-0"><span className="w-2.5 h-2.5 rounded-full bg-ink animate-pulse" /></span>
  return <span className="w-7 h-7 rounded-full border-2 border-line shrink-0" />
}

function Timeline({ steps }: { steps: StatusStep[] }) {
  return (
    <ol className="mt-1" data-testid="status-timeline">
      {steps.map((s, i) => (
        <li key={s.key + i} className="flex gap-3.5" data-testid={`step-${s.key}`} data-state={s.state}>
          <div className="flex flex-col items-center"><Dot s={s.state} />{i < steps.length - 1 && <span className={`w-0.5 flex-1 min-h-[22px] ${s.state === 'done' ? 'bg-green' : 'bg-line'}`} />}</div>
          <div className="pb-5 min-w-0">
            <p className={`font-semibold text-[16px] leading-7 ${s.state === 'pending' ? 'text-ink-3' : s.state === 'failed' ? 'text-warn' : ''}`}>{s.label}</p>
            {s.at && <p className="text-[13px] text-ink-3 font-mono">{when(s.at)}</p>}
            {s.note && <p className="text-[14px] text-ink-2 mt-0.5 break-words" data-testid={`note-${s.key}`}>{s.note}</p>}
            {s.tx && <a href={`${BRAND.explorerBase}/tx/${s.tx}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-green font-medium mt-0.5" data-testid={`tx-${s.key}`}>View transaction {shortAddr(s.tx)}<ExternalLink size={12} /></a>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function PayeeStatus() {
  const [params, setParams] = useSearchParams()
  const [input, setInput] = useState('')
  const [res, setRes] = useState<Result>({ state: 'idle' })
  const [own, setOwn] = useState(false) // true when it came from this device's saved lookup
  const seq = useRef(0)

  async function lookup(q: SavedApplication, fromSaved = false) {
    const n = ++seq.current
    setRes({ state: 'loading' }); setOwn(fromSaved)
    try {
      const qs = q.ref ? `ref=${encodeURIComponent(q.ref)}` : `wallet=${encodeURIComponent(q.wallet ?? '')}`
      const r = await fetch(`${API_BASE}/payees/status?${qs}`)
      if (n !== seq.current) return
      if (r.status === 429) { const b = await r.json().catch(() => ({})) as { retryAfter?: number }; setRes({ state: 'error', message: `Too many lookups from this connection. Try again in ${Math.max(1, Math.ceil((b.retryAfter ?? 60) / 60))} minute(s).` }); return }
      if (!r.ok) { setRes({ state: 'error', message: 'Could not reach the registry service. Check your connection and try again.' }); return }
      const data = await r.json() as ApplicationStatus
      if (n !== seq.current) return
      setRes({ state: 'done', data, q })
      if (data.found) saveApplication(q)
    } catch { if (n === seq.current) setRes({ state: 'error', message: 'Could not reach the registry service. Check your connection and try again.' }) }
  }

  // Open with ?ref= / ?wallet=, else show this device's saved application.
  useEffect(() => {
    const ref = params.get('ref')?.trim(), wallet = params.get('wallet')?.trim()
    const saved = loadSavedApplication()
    if (ref || wallet) { setInput(ref || wallet || ''); void lookup(ref ? { ref } : { wallet }, !!ref && saved?.ref?.toUpperCase() === ref.toUpperCase()); return }
    if (saved) { setInput(saved.ref ?? saved.wallet ?? ''); void lookup(saved, true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const v = input.trim(); if (!v) return
    const q: SavedApplication = isWallet(v) ? { wallet: v } : { ref: v }
    setParams(q.ref ? { ref: q.ref } : { wallet: q.wallet! }, { replace: true })
    void lookup(q)
  }

  const d = res.state === 'done' && res.data.found ? res.data : null
  const chip = d ? STAGE_CHIP[d.stage] : null
  return (
    <KoloLayout>
      <div className="max-w-lg mx-auto py-12">
        <p className="eyebrow mb-2">Verified payees</p>
        <h1 className="font-display text-[36px] font-medium mb-2">{d && own ? 'Your application' : 'Application status'}</h1>
        <p className="text-ink-2 mb-6">Check where an application to the Kolo registry stands. Enter the reference you received when you applied, or the receiving wallet address. No wallet connection or signature is needed.</p>

        <form onSubmit={submit} className="space-y-3 mb-8" data-testid="status-form">
          <Field label="Reference or wallet address" id="status-q" value={input} onChange={e => setInput(e.target.value)} placeholder="KOLO-APP-1-ABC123 or 0x…" autoComplete="off" spellCheck={false} />
          <Button variant="ink" fullWidth type="submit" disabled={!input.trim() || res.state === 'loading'} data-testid="status-submit">
            {res.state === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}Check status
          </Button>
        </form>

        {res.state === 'loading' && <p className="text-ink-3 text-[14px]" role="status">Looking up your application…</p>}
        {res.state === 'error' && <p className="text-warn text-[14px]" role="alert" data-testid="status-error">{res.message}</p>}

        {res.state === 'done' && !res.data.found && (
          <div className="border border-line rounded-[16px] bg-surface p-5" data-testid="status-not-found">
            <h2 className="font-display text-[20px] font-medium mb-1">No application found</h2>
            <p className="text-[14px] text-ink-2">We could not find an application for that reference or wallet. Check it for typos (the reference ends with a six-character code), or <Link to="/payees/apply" className="underline">apply now</Link>.</p>
          </div>
        )}

        {d && chip && (
          <div className="space-y-5" data-testid="status-result" data-stage={d.stage}>
            <div className="border border-line rounded-[16px] bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h2 className="font-display text-[24px] font-medium break-words" data-testid="status-name">{d.name ?? `Payee #${d.payeeId}`}</h2>
                  <p className="text-[13px] text-ink-3 capitalize">{d.kind}</p>
                </div>
                <Chip variant={chip[1]} className="shrink-0" ><span data-testid="status-stage">{chip[0]}</span></Chip>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
                {d.reference && <><dt className="text-ink-3">Reference</dt><dd className="flex items-center gap-2 min-w-0"><code className="font-mono text-[13px] break-all" data-testid="status-reference">{d.reference}</code><button type="button" aria-label="Copy reference" className="shrink-0 text-ink-2 hover:text-ink cursor-pointer" onClick={() => { void navigator.clipboard.writeText(d.reference!).then(() => toast.success('Reference copied'), () => toast.error('Could not copy.')) }}><Copy size={14} /></button></dd></>}
                <dt className="text-ink-3">Wallet</dt><dd className="font-mono text-[13px] break-all" data-testid="status-wallet">{d.wallet}</dd>
                {d.submittedAt && <><dt className="text-ink-3">Submitted</dt><dd data-testid="status-submitted">{when(d.submittedAt)}</dd></>}
              </dl>
            </div>
            <div className="border border-line rounded-[16px] bg-surface p-5"><Timeline steps={d.steps} /></div>
            {d.stage === 'verified' && d.payeeId && <Link to={`/payees/${d.payeeId}`} className="block"><Button variant="green" fullWidth type="button" tabIndex={-1}>View your public payee page</Button></Link>}
            {(d.stage === 'review' || d.stage === 'registered') && d.reference && <AdminContactCard reference={d.reference} orgName={d.name ?? ''} />}
            {(d.stage === 'review' || d.stage === 'registered') && !d.reference && (
              <p className="text-[13px] text-ink-3">For faster verification, message the admin on Telegram: <a href={d.contact.url} target="_blank" rel="noopener noreferrer" className="text-ink underline" data-testid="admin-telegram-link">{d.contact.telegram}</a></p>
            )}
            {(d.stage === 'rejected' || d.stage === 'revoked') && (
              <p className="text-[14px] text-ink-2">Questions? Message the admin on Telegram: <a href={d.contact.url} target="_blank" rel="noopener noreferrer" className="text-ink underline" data-testid="admin-telegram-link">{d.contact.telegram}</a>. You can also <Link to="/payees/apply" className="underline">submit a new application</Link>.</p>
            )}
          </div>
        )}

        {res.state === 'idle' && (
          <p className="text-[14px] text-ink-3">Haven’t applied yet? <Link to="/payees/apply" className="underline">Apply to join the registry</Link>.</p>
        )}
      </div>
    </KoloLayout>
  )
}
