import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowLeft, X, Gift, Plane, HeartPulse, GraduationCap, Sprout, Check, Copy, Share2, ExternalLink, Loader2, AlertCircle, Plus, Trash2, Info } from 'lucide-react'
import { useWriteContract, useAccount, usePublicClient } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { encodeAbiParameters, parseAbiParameters, keccak256, toBytes, isAddress, parseEventLogs, formatUnits } from 'viem'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { KoloLayout } from '../../components/KoloLayout'
import { PayeeApprovalInfo } from '../../components/PayeeApprovalInfo'
import { Button } from '../../design/Button'
import { Field } from '../../design/Field'
import { MoneyField } from '../../design/MoneyField'
import { Stepper } from '../../design/Stepper'
import { PayeeRow } from '../../design/PayeeRow'
import { Seal } from '../../design/Seal'
import { PotFill } from '../../design/PotFill'
import { EmptyState } from '../../design/EmptyState'
import { Skeleton } from '../../design/Skeleton'
import { FxEstimate } from '../../design/FxEstimate'
import { usePayeeNames } from '../../hooks/usePayeeNames'
import { usePayeeList } from '../../hooks/usePayeeRegistry'
import { useFxRate, getBrowserCurrency } from '../../hooks/useFxRate'
import { KOLO_ADDRESSES } from '../../config'
import { KOLO_FACTORY_ABI } from '../../abi/KoloFactory'
import { parseUsdc } from '../../onchain-money'
import { registerTitle } from '../../hooks/usePotMeta'
import { ARC_CHAIN_ID } from '../../addresses'
import { formatUsdc } from '../../lib/money'
import { fmtDate, shortAddr } from '../../lib/format'
import { txError } from '../../lib/txError'
import { NetworkBadge } from '../../design/NetworkBadge'
import { BRAND } from '../../brand'

type TemplateId = 'gift' | 'trip' | 'medical' | 'tuition' | 'community'
interface Template { id: TemplateId; icon: typeof Gift; name: string; blurb: string; type: 0 | 1; kind: number | null; payee: string; rule: string; shortfall: string; cosigners: number; days: number; titleHint: string; targetHint: string }
const TEMPLATES: Template[] = [
  { id: 'gift',      icon: Gift,          name: 'Group gift',        blurb: 'Friends chip in for one thing.',          type: 0, kind: null, payee: 'One verified payee',  rule: 'Invoice approved by you and 1 co-signer',    shortfall: 'Everyone can claim a refund after the deadline', cosigners: 1, days: 14, titleHint: 'Ada’s leaving gift',       targetHint: '250.00' },
  { id: 'trip',      icon: Plane,         name: 'Trip',              blurb: 'Deposit and balance for a shared trip.',  type: 0, kind: null, payee: 'One verified vendor', rule: 'Each invoice approved by you and 1 co-signer', shortfall: 'Unspent money can be claimed back pro-rata',     cosigners: 1, days: 60, titleHint: 'Lisbon trip, June 2027',   targetHint: '1500.00' },
  { id: 'medical',   icon: HeartPulse,    name: 'Medical bill',      blurb: 'Pay a hospital directly, never a person.', type: 0, kind: 2,    payee: 'Verified hospital',   rule: 'Hospital invoice approved by 2 co-signers',   shortfall: 'Unspent money can be claimed back pro-rata',     cosigners: 2, days: 30, titleHint: 'Tolu’s surgery fund',      targetHint: '2000.00' },
  { id: 'tuition',   icon: GraduationCap, name: 'Term tuition',      blurb: 'Pay a school on the due date.',           type: 1, kind: 0,    payee: 'Verified school',     rule: 'Paid to the school on the due date', shortfall: 'Leftovers can be claimed back pro-rata',    cosigners: 0, days: 90, titleHint: 'Ada’s tuition, 2026–27',   targetHint: '800.00' },
  { id: 'community', icon: Sprout,        name: 'Community project', blurb: 'A shared build with a vendor you trust.', type: 0, kind: null, payee: 'One verified vendor', rule: 'Each invoice approved by you and 2 co-signers', shortfall: 'Unspent money can be claimed back pro-rata',   cosigners: 2, days: 45, titleHint: 'Borehole for Ward 4',      targetHint: '3000.00' },
]
const STEPS = [{ label: 'Template' }, { label: 'Payee' }, { label: 'Amount & deadline' }, { label: 'Co-signers' }, { label: 'Review & seal' }]
const DEADLINE_PRESETS = [{ l: '1 week', d: 7 }, { l: '2 weeks', d: 14 }, { l: '1 month', d: 30 }, { l: '3 months', d: 90 }]
const USDC = '0x3600000000000000000000000000000000000000' as const
const ZERO = '0x0000000000000000000000000000000000000000' as const
const DRAFT_KEY = 'kolo:create-draft'

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d) }
/** A picked day means "until the end of that day, your time". */
const deadlineTs = (day: string) => Math.floor(new Date(`${day}T23:59:00`).getTime() / 1000)
const safeUsdc = (s: string) => { try { return s && Number(s) > 0 ? parseUsdc(s) : 0n } catch { return 0n } }

interface Draft { template: TemplateId; payeeId: number; title: string; target: string; minContrib: string; deadline: string; cosigners: string[]; needed: number }
const loadDraft = (): Draft | undefined => { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null; return d && TEMPLATES.some(t => t.id === d.template) ? d : undefined } catch { return undefined } }

export default function CreateWizard() {
  const { payeeLabel } = usePayeeNames()
  const navigate = useNavigate()
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [ccy, setCcy] = useState(getBrowserCurrency)
  const { rate, symbol } = useFxRate(ccy)
  const { payees, isLoading: payeesLoading, isError: payeesError, refetch: retryPayees } = usePayeeList()

  const [draft] = useState(loadDraft)
  const [nowS] = useState(() => Math.floor(Date.now() / 1000))
  const [restored, setRestored] = useState(!!draft)
  const [step, setStep] = useState(0)
  const [tpl, setTpl] = useState<Template>(TEMPLATES.find(t => t.id === draft?.template) ?? TEMPLATES[0])
  const [payeeId, setPayeeId] = useState(draft?.payeeId ?? 0)
  const [title, setTitle] = useState(draft?.title ?? '')
  const [target, setTarget] = useState(draft?.target ?? '')
  const [minContrib, setMinContrib] = useState(draft?.minContrib ?? '1.00')
  const [deadline, setDeadline] = useState(draft?.deadline ?? inDays(TEMPLATES[0].days))
  const [cosigners, setCosigners] = useState<string[]>(draft?.cosigners ?? [''])
  const [needed, setNeeded] = useState(draft?.needed ?? 2)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [attempted, setAttempted] = useState<Record<number, boolean>>({})
  const [ack, setAck] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'wallet' | 'chain' | 'title'>('idle')
  const [error, setError] = useState<string>()
  const [created, setCreated] = useState<{ potId: number; tx: string } | null>(null)
  const [fee, setFee] = useState<string>()

  useEffect(() => { if (!created) localStorage.setItem(DRAFT_KEY, JSON.stringify({ template: tpl.id, payeeId, title, target, minContrib, deadline, cosigners, needed } satisfies Draft)) }, [tpl, payeeId, title, target, minContrib, deadline, cosigners, needed, created])
  const touch = (k: string) => setTouched(t => ({ ...t, [k]: true }))
  const show = (k: string, s: number) => touched[k] || attempted[s]

  function pickTemplate(t: Template) {
    setTpl(t); setPayeeId(0)
    setDeadline(inDays(t.days)); setCosigners(Array.from({ length: Math.max(1, t.cosigners) }, () => '')); setNeeded(t.cosigners + 1)
  }

  const pickable = payees.filter(p => p.status === 2).filter(p => tpl.kind === null || p.kind === tpl.kind)
  const verified = pickable.filter(p => p.status === 2)
  const payee = payees.find(p => p.id === payeeId)
  const payeeName = payee ? payeeLabel(payee.id, payee.kind, payee.nameHash) : undefined

  // ── validation (one place; each step reads its own slice) ──
  const validCos = cosigners.map(c => c.trim()).filter(Boolean)
  const cosKey = validCos.join(',')
  const errs = {
    payee: !payeeId ? 'Choose who will be paid.' : payee?.status !== 2 ? 'This payee is not verified yet.' : undefined,
    title: title.trim().length < 3 ? 'Give the pot a name of at least 3 characters.' : title.trim().length > 80 ? 'Keep the name under 80 characters.' : undefined,
    target: safeUsdc(target) === 0n ? 'Enter how much you need, for example 250.00.' : Number(target) > 1_000_000 ? 'The target can’t exceed 1,000,000 USDC.' : undefined,
    min: safeUsdc(minContrib) === 0n ? 'Enter a minimum of at least 0.01 USDC.' : safeUsdc(minContrib) > safeUsdc(target) && safeUsdc(target) > 0n ? 'The minimum can’t be higher than the target.' : undefined,
    deadline: !deadline ? 'Pick a deadline.' : deadlineTs(deadline) < nowS + 3600 ? 'The deadline must be at least an hour from now.' : deadlineTs(deadline) > nowS + 2 * 365 * 86400 ? 'The deadline can’t be more than 2 years away.' : undefined,
    cos: cosigners.map(c => { const v = c.trim(); if (!v) return undefined; if (!isAddress(v)) return 'Not a valid 0x address.'; if (address && v.toLowerCase() === address.toLowerCase()) return 'That’s your own wallet. You already sign as the organiser.'; if (validCos.filter(x => x.toLowerCase() === v.toLowerCase()).length > 1) return 'Added twice.'; return undefined }),
  }
  const cosOk = errs.cos.every(e => !e)
  const maxNeeded = validCos.length + 1
  const neededOk = needed >= 1 && needed <= maxNeeded
  const valid = [true, !errs.payee, !errs.title && !errs.target && !errs.min && !errs.deadline, cosOk && neededOk && validCos.length <= 10, true]
  const allValid = valid.every(Boolean)

  function next() { setAttempted(a => ({ ...a, [step]: true })); if (valid[step]) { setStep(step + 1); window.scrollTo({ top: 0 }) } }
  function back() { setStep(step - 1); window.scrollTo({ top: 0 }) }
  const goto = (s: number) => { if (s < step || (s <= 4 && valid.slice(0, s).every(Boolean))) setStep(s) }

  // ── on-chain call, built once and used for the fee estimate and the real transaction ──
  const call = useMemo(() => {
    if (!address || !allValid || !payeeId) return undefined
    const dl = deadlineTs(deadline), titleHash = keccak256(toBytes(title.trim())), cos = validCos as `0x${string}`[]
    const th = Math.min(needed, cos.length + 1)
    const params = tpl.type === 1
      ? encodeAbiParameters(
          parseAbiParameters('address, address, address, uint256, bytes32, uint96, uint40, bool, uint256, uint8, address[], uint40[], uint128[]'),
          [address, USDC, KOLO_ADDRESSES.factory, 0n, titleHash, parseUsdc(minContrib), dl, true, BigInt(payeeId), th, cos, [dl], [parseUsdc(target)]])
      : encodeAbiParameters(
          parseAbiParameters('address, address, address, uint256, bytes32, uint128, uint96, uint40, bool, uint8, address[], uint256[], address[], bytes32[], uint8[], uint128[]'),
          [address, USDC, KOLO_ADDRESSES.factory, 0n, titleHash, parseUsdc(target), parseUsdc(minContrib), dl, true, th, cos, [BigInt(payeeId)], [ZERO], [], [], []])
    return { address: KOLO_ADDRESSES.factory, abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID, functionName: tpl.type === 1 ? 'createTuitionPot' : 'createGroupPot', args: [params] } as const
  }, [address, allValid, payeeId, deadline, title, tpl, minContrib, target, needed, cosKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setFee(undefined)
    if (step !== 4 || !call || !publicClient || !address) return
    let alive = true
    void (async () => {
      try {
        const [gas, price] = await Promise.all([publicClient.estimateContractGas({ ...call, account: address }), publicClient.getGasPrice()])
        const usdc = Number(formatUnits(gas * price, 18)) // Arc gas is USDC at 18 decimals
        if (alive) setFee(usdc < 0.01 ? 'under 0.01 USDC' : `about ${usdc.toFixed(2)} USDC`)
      } catch { /* the estimate is a courtesy; the wallet shows the real fee */ }
    })()
    return () => { alive = false }
  }, [step, call, publicClient, address])

  async function seal() {
    if (!call || !publicClient) return
    setError(undefined); setPhase('wallet')
    try {
      const hash = await writeContractAsync(call)
      setPhase('chain')
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const ev = parseEventLogs({ abi: KOLO_FACTORY_ABI, logs: receipt.logs, eventName: 'PotCreated' })[0] as unknown as { args: { potId: bigint } } | undefined
      if (receipt.status !== 'success' || !ev) throw new Error('The pot contract rejected this setup. Nothing was created.')
      const potId = Number(ev.args.potId)
      setPhase('title')
      await registerTitle(potId, title.trim()).catch(() => undefined) // title is verifiable against titleHash on-chain
      localStorage.removeItem(DRAFT_KEY)
      setCreated({ potId, tx: hash })
    } catch (e) { setError(txError(e)); toast.error(txError(e)) } finally { setPhase('idle') }
  }

  const busy = phase !== 'idle'
  const eachNote = `${formatUsdc(safeUsdc(minContrib))} USDC`

  // ── live preview (what contributors will see) ──
  const preview = (
    <div aria-label="Live preview of your pot page" data-testid="pot-preview">
      <div className="bg-surface rounded-t-lg border border-line border-b-0 p-6">
        <div className="flex items-center justify-between"><span className="eyebrow">Preview · public page</span><span className="font-mono text-[11px] bg-green-soft text-green-deep px-2 h-5 rounded-full inline-flex items-center">Open</span></div>
        <div className={`font-display text-[24px] leading-tight mt-3 ${title.trim() ? '' : 'text-ink-3'}`}>{title.trim() || tpl.titleHint}</div>
        <p className="text-[13px] text-ink-2 mt-1">{payeeName ? <>Pays <strong className="text-ink">{payeeName}</strong> only</> : <span className="text-ink-3">Payee not chosen yet</span>}</p>
        <PotFill paidPct={0} label="0% funded" />
        <div className="flex items-baseline justify-between">
          <span className="font-display text-[26px] num">0.00 <span className="font-mono text-[12px] text-ink-3">USDC</span></span>
          <span className="text-[13px] text-ink-3 num">of {target ? formatUsdc(safeUsdc(target)) : '—'}</span>
        </div>
        {Number(target) > 0 && <div className="mt-0.5"><FxEstimate usdc={Number(target)} rate={rate} symbol={symbol} /></div>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mt-4 pt-4 border-t border-line text-[13px]">
          <dt className="text-ink-3">Deadline</dt><dd className="text-right">{errs.deadline ? '—' : fmtDate(deadlineTs(deadline))}</dd>
          <dt className="text-ink-3">Releases</dt><dd className="text-right">{tpl.type === 1 ? 'On the due date, sent by Kolo’s keeper' : `${Math.min(needed, maxNeeded)} of ${maxNeeded} signer${maxNeeded > 1 ? 's' : ''} approve`}</dd>
          <dt className="text-ink-3">Minimum</dt><dd className="text-right num">{errs.min ? '—' : eachNote}</dd>
        </dl>
        <div className="mt-4 h-10 rounded-[10px] bg-green/90 text-surface text-[14px] font-semibold grid place-items-center opacity-60" aria-hidden>Contribute</div>
      </div>
      <div className="h-2 border-x border-line" style={{ background: `url('/assets/illustrations/perforation.svg') repeat-x, white` }} />
      <div className="text-center py-4 bg-surface border-x border-b border-line rounded-b-lg"><Seal released={false} size={72} /><p className="text-[12px] text-ink-3 mt-1">Sealed at the last step. The payee can’t change.</p></div>
    </div>
  )

  const eyebrow = <span className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full bg-[#ECEAF0] text-ink font-mono text-[12px] mb-4"><tpl.icon size={13} />{tpl.name}</span>
  const navBtns = ({ onNext, label, disabled, testid }: { onNext: () => void; label: string; disabled?: boolean; testid: string }) => (
    <div className="flex justify-between mt-8 gap-3">
      <Button variant="ghost" onClick={back}><ArrowLeft size={18} />Back</Button>
      <Button variant="ink" onClick={onNext} disabled={disabled} data-testid={testid}>{label} <ArrowRight size={18} /></Button>
    </div>
  )

  if (created) return <Success created={created} title={title.trim()} payeeName={payeeName} target={target} />

  return (
    <KoloLayout bare>
      <nav className="flex items-center justify-between h-[72px] border-b border-line">
        <Link to="/"><img src="/assets/brand/kolo-wordmark-a.svg" width={125} height={40} className="h-10 w-[125px] max-w-none" alt="Kolo" /></Link>
        <span className="eyebrow hidden sm:inline">New pot</span><NetworkBadge className="sm:hidden" />
        <Button variant="ghost" size="sm" onClick={() => { void navigate('/') }}><X size={16} />Close</Button>
      </nav>

      {/* mobile progress */}
      <div className="lg:hidden pt-5" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step].label}`}>
        <div className="flex items-center justify-between mb-2"><span className="eyebrow">Step {step + 1} of {STEPS.length}</span><span className="text-[13px] font-medium">{STEPS[step].label}</span></div>
        <div className="flex gap-1.5">{STEPS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-green' : 'bg-line'}`} />)}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_320px] gap-8 pt-6 lg:pt-10 pb-28 lg:pb-16">
        <div className="hidden lg:block">
          <Stepper steps={STEPS} current={step} onSelect={goto} />
        </div>

        <div className="min-w-0 max-w-[640px]">
          {restored && step === 0 && (
            <div className="mb-5 flex items-center justify-between gap-3 border border-line bg-surface rounded-[12px] px-4 py-2.5 text-[13px]">
              <span className="text-ink-2">We kept your last draft on this device.</span>
              <button type="button" className="underline font-medium" onClick={() => { localStorage.removeItem(DRAFT_KEY); pickTemplate(TEMPLATES[0]); setTitle(''); setTarget(''); setMinContrib('1.00'); setRestored(false) }}>Start over</button>
            </div>
          )}

          {step === 0 && (
            <>
              <h1 className="font-display text-[34px] sm:text-[40px] font-medium leading-[1.08] mb-2">What is this money for?</h1>
              <p className="text-ink-2 mb-6">Pick a template. It sets sensible rules for who approves and what happens if the pot falls short. You can adjust everything before sealing.</p>
              <div role="radiogroup" aria-label="Template" className="grid sm:grid-cols-2 gap-3">
                {TEMPLATES.map(t => {
                  const sel = tpl.id === t.id
                  return (
                    <button key={t.id} type="button" role="radio" aria-checked={sel} onClick={() => pickTemplate(t)} data-testid={`template-${t.id}`}
                      className={`text-left rounded-[14px] border p-4 transition-colors bg-surface focus-visible:ring-2 focus-visible:ring-green ${sel ? 'border-green bg-[#F3F9F6]' : 'border-line hover:border-ink-2'}`}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-[10px] bg-paper border border-line grid place-items-center"><t.icon size={18} className="text-ink-2" /></span>
                        <span className="font-semibold text-[16px] flex-1">{t.name}</span>
                        {sel && <span className="w-5 h-5 rounded-full bg-green text-surface grid place-items-center"><Check size={13} strokeWidth={3} /></span>}
                      </div>
                      <p className="text-[13px] text-ink-2 mt-2">{t.blurb}</p>
                      <dl className="mt-3 pt-3 border-t border-line grid grid-cols-[64px_1fr] gap-y-1 text-[12px]">
                        <dt className="text-ink-3">Pays</dt><dd>{t.payee}</dd>
                        <dt className="text-ink-3">Release</dt><dd>{t.rule}</dd>
                        <dt className="text-ink-3">Short</dt><dd>{t.shortfall}</dd>
                      </dl>
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-end mt-6"><Button variant="ink" onClick={() => setStep(1)} data-testid="wizard-next-template">Use “{tpl.name}” <ArrowRight size={18} /></Button></div>
            </>
          )}

          {step === 1 && (
            <>
              {eyebrow}
              <h1 className="font-display text-[34px] sm:text-[40px] font-medium leading-[1.08] mb-2">{tpl.id === 'tuition' ? 'Which school is this for?' : tpl.kind === 2 ? 'Which hospital?' : 'Who will be paid?'}</h1>
              <p className="text-ink-2 mb-5">The payee is sealed in when you create the pot, so contributors know exactly who can ever be paid. Only payees the Kolo registrar has verified can be chosen. Their wallet can’t change without a 48-hour public notice.</p>
              {payeesLoading && <Skeleton rows={3} />}
              {!payeesLoading && payeesError && <EmptyState title="Couldn’t load the registry" body="This browser could not reach Arc or Kolo’s server. Check your connection and try again." action={<Button variant="ghost" onClick={retryPayees}>Try again</Button>} />}
              {!payeesLoading && !payeesError && pickable.length === 0 && (
                <EmptyState title={`No ${tpl.kind === 0 ? 'schools' : tpl.kind === 2 ? 'hospitals' : 'payees'} in the registry yet`} body="Payees must apply and be verified before they can receive a pot’s money." action={<Link to="/payees/apply"><Button variant="ghost">Apply to register one</Button></Link>} />
              )}
              <div className="space-y-2.5" role="radiogroup" aria-label="Payee">
                {pickable.map(p => {
                  const ok = p.status === 2
                  return (
                    <div key={p.id} className={ok ? '' : 'opacity-70'}>
                      <PayeeRow id={p.id} name={payeeLabel(p.id, p.kind, p.nameHash)} kind={p.kind as 0 | 1 | 2} status={p.status} wallet={p.wallet} verifiedAt={p.verifiedAt} selected={payeeId === p.id} onClick={ok ? () => setPayeeId(p.id) : undefined} />
                      {!ok && <p className="text-[12px] text-ink-3 mt-1 px-1">Registered, but not verified yet. The registrar must verify it before it can be chosen.</p>}
                    </div>
                  )
                })}
              </div>
              {verified.length === 0 && pickable.length > 0 && !payeesLoading && <p className="text-[13px] text-warn mt-3">None of these payees is verified yet, so you can’t continue with this template.</p>}
              <div className="mt-6"><PayeeApprovalInfo compact /></div>
              {attempted[1] && errs.payee && <p role="alert" className="text-danger text-[13px] mt-3">{errs.payee}</p>}
              {navBtns({ onNext: next, label: 'Continue', testid: 'wizard-next-payee' })}
            </>
          )}

          {step === 2 && (
            <>
              {eyebrow}
              <h1 className="font-display text-[34px] sm:text-[40px] font-medium leading-[1.08] mb-6">Amount &amp; deadline</h1>
              <div className="space-y-5">
                <Field label="Pot title" id="title" value={title} maxLength={80} autoComplete="off" onChange={e => setTitle(e.target.value)} onBlur={() => touch('title')} placeholder={`e.g. ${tpl.titleHint}`} error={show('title', 2) ? errs.title : undefined} hint="Shown on the public page. Its hash is stored on-chain, so it can’t be swapped later." />
                <MoneyField id="target" label={tpl.type === 1 ? 'Amount due' : 'Target amount'} value={target} onChange={setTarget} onBlur={() => touch('target')} error={show('target', 2) ? errs.target : undefined} hint={`USDC, 2 decimals. For example ${tpl.targetHint}.`} rate={rate} symbol={symbol} />
                <MoneyField id="min" label="Minimum contribution" value={minContrib} onChange={setMinContrib} onBlur={() => touch('min')} error={show('min', 2) ? errs.min : undefined} hint="The smallest amount one person can add." rate={rate} symbol={symbol} />
                <div className="flex items-center gap-2 text-[13px] text-ink-2 -mt-2">
                  <label htmlFor="ccy">Show local estimate in</label>
                  <select id="ccy" value={ccy} onChange={e => { setCcy(e.target.value); localStorage.setItem('kolo:currency', e.target.value) }} className="h-8 rounded-[8px] border border-line bg-surface px-2 font-mono text-[12px]">
                    {['USD', 'NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'XOF', 'EUR', 'GBP', 'INR', 'BRL', 'CAD', 'AUD'].map(c => <option key={c} value={c}>{c === 'USD' ? 'USD (no estimate)' : c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="deadline" className="eyebrow block mb-1.5">{tpl.type === 1 ? 'Due date' : 'Deadline'}</label>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {DEADLINE_PRESETS.map(p => <button key={p.d} type="button" onClick={() => { setDeadline(inDays(p.d)); touch('deadline') }} className={`h-8 px-3.5 rounded-full text-[13px] font-medium border transition-colors ${deadline === inDays(p.d) ? 'bg-ink text-surface border-ink' : 'border-line hover:border-ink-2'}`}>{p.l}</button>)}
                  </div>
                  <div className={`flex items-center h-[52px] px-3.5 rounded-[12px] border bg-surface ${show('deadline', 2) && errs.deadline ? 'border-danger' : 'border-line focus-within:border-ink'}`}>
                    <input id="deadline" type="date" min={inDays(0)} value={deadline} onChange={e => setDeadline(e.target.value)} onBlur={() => touch('deadline')} className="flex-1 bg-transparent outline-none text-ink text-[15px]" aria-invalid={!!errs.deadline} />
                  </div>
                  {show('deadline', 2) && errs.deadline
                    ? <p className="text-[13px] text-danger mt-1.5">{errs.deadline}</p>
                    : <p className="text-[13px] text-ink-3 mt-1.5">{deadline && !errs.deadline ? `Ends 23:59 your time on ${fmtDate(deadlineTs(deadline))}. ` : ''}{tpl.type === 1 ? 'The school is paid on this date.' : 'If the target isn’t met and nothing is released by then, contributors can claim refunds.'}</p>}
                </div>
              </div>
              {navBtns({ onNext: next, label: 'Continue', testid: 'wizard-next-amounts' })}
            </>
          )}

          {step === 3 && (
            <>
              {eyebrow}
              <h1 className="font-display text-[34px] sm:text-[40px] font-medium leading-[1.08] mb-2">Who must approve payments?</h1>
              <p className="text-ink-2 mb-6">Co-signers are people you trust to check each invoice before money leaves the pot. You sign too, as the organiser. {tpl.id === 'tuition' ? 'Tuition pots pay on the due date; co-signers are only needed to close a pot early.' : 'Optional, but a second pair of eyes is what makes contributors comfortable.'}</p>
              <div className="space-y-3">
                {cosigners.map((cs, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0"><Field label={i === 0 ? 'Co-signer wallet addresses' : undefined} id={`cosigner-${i}`} value={cs} autoComplete="off" spellCheck={false} placeholder="0x…" className="font-mono" onChange={e => { const n = [...cosigners]; n[i] = e.target.value; setCosigners(n) }} onBlur={() => touch(`cos${i}`)} error={(show(`cos${i}`, 3)) ? errs.cos[i] : undefined} /></div>
                    {cosigners.length > 1 && <button type="button" aria-label={`Remove co-signer ${i + 1}`} onClick={() => setCosigners(cosigners.filter((_, j) => j !== i))} className={`w-11 h-[52px] grid place-items-center rounded-[12px] border border-line text-ink-3 hover:text-ink hover:border-ink-2 ${i === 0 ? 'mt-[23px]' : ''}`}><Trash2 size={16} /></button>}
                  </div>
                ))}
                {cosigners.length < 10 && <button type="button" onClick={() => setCosigners([...cosigners, ''])} className="inline-flex items-center gap-1.5 text-green text-[14px] font-medium"><Plus size={15} />Add another co-signer</button>}
              </div>
              <div className="mt-6 border border-line rounded-[14px] bg-surface p-4">
                <label htmlFor="needed" className="eyebrow block mb-2">Approvals needed per payment</label>
                <div className="flex flex-wrap items-center gap-3">
                  <select id="needed" value={Math.min(Math.max(needed, 1), maxNeeded)} onChange={e => setNeeded(Number(e.target.value))} className="h-11 rounded-[10px] border border-line bg-paper px-3 text-[15px] font-mono">
                    {Array.from({ length: maxNeeded }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} of {maxNeeded}</option>)}
                  </select>
                  <span className="text-[13px] text-ink-2 flex-1 min-w-[200px]">{Math.min(needed, maxNeeded) === 1 ? (validCos.length === 0 ? 'Only you approve. Contributors get no second check.' : 'Any one signer can approve.') : `${Math.min(needed, maxNeeded)} of ${maxNeeded} signers (you count as one) must approve before release.`}</span>
                </div>
                {validCos.length === 0 && tpl.id !== 'tuition' && <p className="text-[12px] text-warn mt-3 flex gap-1.5"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" />Add at least one co-signer so payments need more than your own approval.</p>}
              </div>
              {navBtns({ onNext: next, label: 'Review', testid: 'wizard-next-cosigners' })}
            </>
          )}

          {step === 4 && (
            <>
              {eyebrow}
              <h1 className="font-display text-[34px] sm:text-[40px] font-medium leading-[1.08] mb-2">Review &amp; seal</h1>
              <p className="text-ink-2 mb-6">Check the details. Sealing creates the pot on Arc in one transaction.</p>
              <dl className="border-t-2 border-ink divide-y divide-line text-[15px]" data-testid="review">
                {([
                  ['Title', title.trim(), 2], ['Pays', payeeName ? `${payeeName} · ${payee ? shortAddr(payee.wallet) : ''}` : '—', 1],
                  [tpl.type === 1 ? 'Amount due' : 'Target', `${formatUsdc(safeUsdc(target))} USDC`, 2], ['Minimum contribution', `${formatUsdc(safeUsdc(minContrib))} USDC`, 2],
                  [tpl.type === 1 ? 'Due date' : 'Deadline', `${fmtDate(deadlineTs(deadline))}, 23:59 your time`, 2],
                  ['Approvals', `${Math.min(needed, maxNeeded)} of ${maxNeeded} signers`, 3],
                ] as const).map(([k, v, s]) => (
                  <div key={k} className="grid grid-cols-[130px_1fr_auto] sm:grid-cols-[170px_1fr_auto] gap-x-3 py-3 items-baseline">
                    <dt className="text-ink-3 text-[14px]">{k}</dt><dd className="min-w-0 break-words">{v}</dd>
                    <dd><button type="button" className="text-[13px] underline text-ink-2" onClick={() => setStep(s)} aria-label={`Edit ${k}`}>Edit</button></dd>
                  </div>
                ))}
                {validCos.length > 0 && <div className="py-3"><dt className="text-ink-3 text-[14px] mb-1.5">Co-signers</dt><dd className="font-mono text-[12px] space-y-1">{validCos.map(c => <div key={c} className="break-all">{c}</div>)}</dd></div>}
              </dl>

              <section className="mt-6 border border-line rounded-[14px] bg-surface p-5" aria-labelledby="onchain">
                <h2 id="onchain" className="eyebrow mb-3">What happens on-chain</h2>
                <ol className="space-y-2 text-[14px] text-ink-2 list-decimal pl-5">
                  <li>You approve one transaction in your wallet. It asks Kolo’s factory to create a pot contract for you.</li>
                  <li>The pot records the payee, target, deadline and signers. Your wallet becomes the organiser.</li>
                  <li>No USDC leaves your wallet now. Money moves only when someone contributes, and only to the sealed payee or back to contributors.</li>
                </ol>
                <p className="mt-4 text-[13px] flex gap-2 text-ink-2"><Info size={16} className="flex-shrink-0 mt-0.5 text-ink-3" /><span data-testid="fee-note">Network fee: paid in USDC on Arc, {fee ?? 'a fraction of a cent'}. Kolo adds no fee to creating a pot.</span></p>
              </section>

              <label className="flex items-start gap-3 mt-6 text-[14px] cursor-pointer">
                <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-1 w-4 h-4 accent-[#1F6F5C]" data-testid="seal-ack" />
                <span>I understand the payee and rules are permanent once the pot is sealed.</span>
              </label>

              {error && <div role="alert" className="mt-5 border-l-4 border-danger bg-[#FBEFEC] rounded-r-[12px] px-4 py-3 text-[14px]" data-testid="seal-error"><p className="font-semibold">The pot wasn’t created</p><p className="text-ink-2 mt-0.5">{error}</p></div>}
              {busy && <p className="mt-5 text-[14px] text-ink-2 flex items-center gap-2" role="status" data-testid="seal-progress"><Loader2 size={16} className="animate-spin" />{phase === 'wallet' ? 'Confirm in your wallet…' : phase === 'chain' ? 'Waiting for Arc to confirm…' : 'Saving the title…'}</p>}

              <div className="flex justify-between mt-6 gap-3 items-center">
                <Button variant="ghost" onClick={back} disabled={busy}><ArrowLeft size={18} />Back</Button>
                {address ? (
                  <Button variant="green" onClick={() => { void seal() }} disabled={busy || !ack || !allValid} data-testid="seal-pot">
                    {busy ? 'Sealing…' : error ? 'Try again' : <>Seal this pot <Seal released={false} size={20} /></>}
                  </Button>
                ) : (
                  <ConnectKitButton.Custom>{({ show: open }) => <Button variant="green" onClick={open} data-testid="connect-to-seal">Connect wallet to seal</Button>}</ConnectKitButton.Custom>
                )}
              </div>
              {!address && <p className="text-[13px] text-ink-3 mt-3 text-right">Your draft is saved on this device. Connect the wallet that will organise the pot.</p>}
            </>
          )}

          {/* mobile preview */}
          <details className="lg:hidden mt-10 group">
            <summary className="cursor-pointer list-none flex items-center justify-between border border-line rounded-[12px] bg-surface px-4 h-12 text-[14px] font-medium"><span>Preview your pot</span><span className="text-ink-3 text-[12px] font-mono group-open:hidden">Show</span><span className="text-ink-3 text-[12px] font-mono hidden group-open:inline">Hide</span></summary>
            <div className="mt-3">{preview}</div>
          </details>
        </div>

        <div className="hidden lg:block"><div className="sticky top-6">{preview}</div></div>
      </div>
    </KoloLayout>
  )
}

function Success({ created, title, payeeName, target }: { created: { potId: number; tx: string }; title: string; payeeName?: string; target: string }) {
  const navigate = useNavigate()
  const url = `${window.location.origin}/p/${created.potId}`
  const [qr, setQr] = useState<string>()
  const message = `I’ve started a Kolo pot${title ? ` “${title}”` : ''}. Contribute USDC here, and it can only be paid to ${payeeName ?? 'the payee named on the page'}: ${url}`
  useEffect(() => { QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: '#14172B', light: '#FFFFFF' } }).then(setQr).catch(() => undefined) }, [url])
  const copy = (t: string, ok: string) => { void navigator.clipboard.writeText(t).then(() => toast.success(ok)).catch(() => toast.error('Couldn’t copy. Select the text instead.')) }
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  return (
    <KoloLayout bare>
      <div className="max-w-[760px] mx-auto py-12 sm:py-16 text-center" data-testid="create-success">
        <Seal released={false} size={110} />
        <p className="eyebrow mt-6">Pot #{created.potId} · sealed on Arc</p>
        <h1 className="font-display text-[34px] sm:text-[44px] font-medium leading-[1.05] mt-2">{title || 'Your pot'} is live.</h1>
        <p className="text-ink-2 mt-3">Share the link to start collecting. {target ? `Target ${formatUsdc(safeUsdc(target))} USDC.` : ''}</p>
        <div className="mt-8 grid sm:grid-cols-[1fr_auto] gap-6 text-left border border-line rounded-[14px] bg-surface p-5 items-center">
          <div className="min-w-0">
            <span className="eyebrow">Share link</span>
            <p className="font-mono text-[14px] break-all mt-1.5" data-testid="share-url">{url}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button variant="ink" size="sm" onClick={() => copy(url, 'Link copied')}><Copy size={14} />Copy link</Button>
              <Button variant="ghost" size="sm" onClick={() => copy(message, 'Message copied')}>Copy message</Button>
              {canShare && <Button variant="ghost" size="sm" onClick={() => { void navigator.share({ title, text: message, url }).catch(() => undefined) }}><Share2 size={14} />Share…</Button>}
            </div>
          </div>
          <div className="justify-self-center">{qr ? <img src={qr} width={160} height={160} alt={`QR code for ${url}`} className="rounded-[10px] border border-line" /> : <div className="w-[160px] h-[160px] skeleton-bar rounded-[10px]" />}</div>
        </div>
        <ol className="text-left mt-6 grid sm:grid-cols-3 gap-4 text-[13px] text-ink-2">
          <li className="border border-line rounded-[12px] p-4 bg-surface"><b className="block text-ink text-[14px] mb-1">1 · Share it</b>Send the link or let people scan the QR code.</li>
          <li className="border border-line rounded-[12px] p-4 bg-surface"><b className="block text-ink text-[14px] mb-1">2 · Tell your co-signers</b>They approve each invoice on the pot page. Send them the same link.</li>
          <li className="border border-line rounded-[12px] p-4 bg-surface"><b className="block text-ink text-[14px] mb-1">3 · Release or refund</b>After approval you release to the payee. If the deadline passes, contributors can claim refunds.</li>
        </ol>
        <div className="flex flex-wrap gap-3 justify-center mt-8">
          <Button variant="green" onClick={() => { void navigate(`/p/${created.potId}`) }} data-testid="view-new-pot">View your pot <ArrowRight size={18} /></Button>
          <Button variant="ghost" onClick={() => { void navigate(`/organizer/${created.potId}`) }}>Organiser dashboard</Button>
          <a href={`${BRAND.explorerBase}/tx/${created.tx}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-11 px-3 text-[14px] text-ink-2 hover:text-ink"><ExternalLink size={15} />Transaction</a>
        </div>
      </div>
    </KoloLayout>
  )
}
