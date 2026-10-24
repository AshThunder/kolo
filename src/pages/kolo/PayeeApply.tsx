import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KoloLayout } from '../../components/KoloLayout'
import { Button } from '../../design/Button'
import { Field } from '../../design/Field'
import { toast } from 'sonner'
import { API_BASE } from '../../lib/api'
import { AdminContactCard, AdminContactLine } from '../../components/AdminContact'
import { saveApplication, statusLink } from '../../lib/application'

/** "about 12 minutes" / "about 1 hour" / "under a minute" */
const waitText = (s: number) => s < 60 ? 'under a minute' : s < 3600 ? `about ${Math.ceil(s / 60)} minute${Math.ceil(s / 60) === 1 ? '' : 's'}` : `about ${Math.ceil(s / 3600)} hour${Math.ceil(s / 3600) === 1 ? '' : 's'}`

export default function PayeeApply() {
  const [kind, setKind] = useState<'school' | 'vendor' | 'hospital'>('school')
  const [name, setName] = useState('')
  const [wallet, setWallet] = useState('')
  const [regNo, setRegNo] = useState('')
  const [country, setCountry] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState<{ reference: string; name: string; updated: boolean } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !/^0x[0-9a-fA-F]{40}$/.test(wallet.trim())) {
      toast.error('Enter an organisation name and a valid 0x wallet address')
      return
    }
    setBusy(true)
    try {
      const r = await fetch(API_BASE + '/payees/applications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, name: name.trim(), wallet: wallet.trim(), country: country.trim() || undefined, regNo: regNo.trim() || undefined }) })
      const body = await r.json().catch(() => ({})) as { error?: string; retryAfter?: number; updated?: boolean; application?: { reference?: string; name?: string } }
      if (r.status === 429) {
        const wait = Number(body.retryAfter ?? r.headers.get('retry-after') ?? 0)
        toast.error('Too many applications from this connection', { description: wait > 0 ? `Try again in ${waitText(wait)}.` : 'Try again in a little while.' })
      } else if (!r.ok) {
        toast.error('Could not accept this application', { description: body.error ? body.error.charAt(0).toUpperCase() + body.error.slice(1) + '.' : 'Check the details and try again.' })
      } else {
        if (body.application?.reference) saveApplication({ ref: body.application.reference })
        setSubmitted({ reference: body.application?.reference ?? '', name: body.application?.name ?? name.trim(), updated: !!body.updated })
        toast.success(body.updated ? 'Application updated' : 'Application submitted', { description: 'The Kolo registrar will review it within 1–3 days.' })
      }
    } catch {
      toast.error('Could not reach the registry service', { description: 'Check your connection and try again.' })
    } finally { setBusy(false) }
  }

  return (
    <KoloLayout>
      <div className="max-w-lg mx-auto py-12">
        <p className="eyebrow mb-2">Verified payees</p>
        <h1 className="font-display text-[36px] font-medium mb-2">Apply to join the registry</h1>
        <p className="text-ink-2 mb-8">Schools, vendors and hospitals can apply to become a verified payee. The Kolo registrar reviews applications within 1–3 days.</p>

        {submitted ? (
          <div className="py-6" data-testid="apply-confirmation">
            <div className="text-center mb-6">
              <img src="/assets/brand/seal-locked.svg" width={88} alt="" className="mx-auto mb-4" />
              <h2 className="font-display text-[26px] font-medium mb-2">{submitted.updated ? 'Application updated' : 'Application received'}</h2>
              <p className="text-ink-2">The registrar will check your documents and wallet, usually within 1–3 days. You appear in the payee directory once registered.</p>
            </div>
            {submitted.reference && (
              <Link to={statusLink(submitted.reference)} className="block mb-4" data-testid="check-status-link"><Button variant="ink" fullWidth type="button" tabIndex={-1}>Check your application status</Button></Link>
            )}
            {submitted.reference && <AdminContactCard reference={submitted.reference} orgName={submitted.name} />}
          </div>
        ) : (
          <form onSubmit={e => { void handleSubmit(e) }} className="space-y-5">
            <div>
              <span className="eyebrow block mb-2">Kind</span>
              <div className="flex gap-2">
                {(['school', 'vendor', 'hospital'] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 h-10 rounded-[12px] border text-[14px] capitalize transition-colors ${kind === k ? 'border-ink bg-paper font-semibold' : 'border-line'}`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Organisation name" id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Northfield Academy" />
            <Field label="Receiving wallet (Arc)" id="wallet" value={wallet} onChange={e => setWallet(e.target.value)} placeholder="0x…" hint="This is the wallet that will receive payments. Any change requires 48-hour notice." />
            <Field label="Country (optional)" id="country" value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. Kenya" />
            <Field label="Registration number (optional)" id="reg" value={regNo} onChange={e => setRegNo(e.target.value)} placeholder="Company, school or licence number" hint="Kept private; only the registrar sees it." />
            <p className="text-[13px] text-ink-3">Before verification the registrar will ask you to prove you control this wallet by signing a message, and to share supporting documents. Review takes 1–3 days.</p>
            <Button variant="green" fullWidth type="submit" data-testid="submit-apply" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit application'}
            </Button>
            <AdminContactLine className="text-center" />
            <p className="text-[13px] text-ink-3 text-center">Already applied? <Link to="/payees/status" className="underline" data-testid="status-link">Check your application status</Link></p>
          </form>
        )}
      </div>
    </KoloLayout>
  )
}
