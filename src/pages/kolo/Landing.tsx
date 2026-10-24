import { formatUsdc } from '../../lib/money'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Users, GraduationCap, FileText, UserCheck, Undo2, BadgeCheck, CalendarClock, RefreshCcw } from 'lucide-react'
import { KoloLayout } from '../../components/KoloLayout'
import { Button } from '../../design/Button'
import { useGlobalStats } from '../../hooks/useKoloFactory'
import { usePayeeList } from '../../hooks/usePayeeRegistry'
import { NET } from '../../network'
import { KOLO_ADDRESSES } from '../../addresses'
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-3)}`

function LiveStat({ label, value, isMoney, sub }: { label: string; value: string; isMoney?: boolean; sub?: string }) {
  return (
    <div className="py-[18px] pr-5 border-r border-line last:border-0">
      <span className="eyebrow">{label}</span>
      <div className="font-display text-[28px] font-medium mt-2 num">{isMoney ? `$${value}` : value}</div>
      {sub && <div className="text-[12px] text-ink-3 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const { locked, released, refunded, blockNumber, isLoading, isError } = useGlobalStats()
  const { payees } = usePayeeList()
  const payeeCount = payees.filter(p => p.status === 2).length

  const fmt = formatUsdc

  return (
    <KoloLayout>
      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_.85fr] gap-12 items-center pt-16 pb-10">
        <div>
          <p className="eyebrow mb-4">Purpose-locked group money · USDC on Arc</p>
          <h1 className="font-display text-[52px] sm:text-[64px] font-medium leading-[1.02] tracking-[-0.025em]">
            Group money that can only go{' '}
            <em className="italic text-green not-italic" style={{ fontStyle: 'italic' }}>where it was promised.</em>
          </h1>
          <p className="text-[19px] text-ink-2 max-w-[520px] mt-5 mb-7">
            Pool USDC with friends, family or a team. The payee is sealed in at creation. Funds release against an invoice your co-signers approve, or, if the deadline passes, every contributor can claim their money back.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Button variant="green" onClick={() => { void navigate('/create') }} data-testid="start-pot">
              Start a pot <ArrowRight size={18} strokeWidth={2} />
            </Button>
            <Button variant="ghost" onClick={() => { void navigate('/payees') }}>
              See verified payees
            </Button>
          </div>

          {/* Live stats */}
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-green inline-block" />
              <span className="eyebrow">
                {isError ? 'Live data unavailable. Check your connection and reload' : <>Live from Arc{blockNumber ? ` · block ${Number(blockNumber).toLocaleString()}` : ''}</>}
              </span>
            </div>
            <div className="grid grid-cols-4 border-t-2 border-ink border-b border-line">
              {isLoading ? (
                <div className="col-span-4 py-4 text-ink-3 text-[13px] font-mono">Loading…</div>
              ) : (
                <>
                  <LiveStat label="USDC locked" value={fmt(locked)} isMoney />
                  <LiveStat label="Released" value={fmt(released)} isMoney />
                  <LiveStat label="Refunded" value={fmt(refunded)} isMoney />
                  <LiveStat label="Verified payees" value={payeeCount ? String(payeeCount) : '—'} />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <img src="/assets/illustrations/hero-sealed-pot.svg" alt="Sealed pot illustration" className="w-full max-w-[420px] mx-auto" />
        </div>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-10">
        {/* GroupPot */}
        <div className="bg-surface border border-line rounded-lg p-7">
          <span className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full bg-[#ECEAF0] text-ink font-mono text-[12px] tracking-[0.04em]">
            <Users size={14} strokeWidth={2} />GroupPot
          </span>
          <h3 className="font-display text-[26px] font-medium mt-3.5 mb-2">For gifts, events and trips</h3>
          <p className="text-ink-2">One organiser, many contributors, a payee nobody can swap.</p>
          <ul className="mt-4 border-t border-dashed border-line">
            <li className="flex gap-2.5 items-start py-2.5 border-b border-dashed border-line text-ink-2">
              <FileText size={18} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
              Released only against an uploaded invoice
            </li>
            <li className="flex gap-2.5 items-start py-2.5 border-b border-dashed border-line text-ink-2">
              <UserCheck size={18} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
              Co-signers approve before money moves
            </li>
            <li className="flex gap-2.5 items-start py-2.5 text-ink-2">
              <Undo2 size={18} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
              Deadline missed? Contributors claim their money back
            </li>
          </ul>
        </div>

        {/* TuitionPot */}
        <div className="bg-surface border border-line rounded-lg p-7">
          <span className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full bg-[#ECEAF0] text-ink font-mono text-[12px] tracking-[0.04em]">
            <GraduationCap size={14} strokeWidth={2} />Tuition Pot
          </span>
          <h3 className="font-display text-[26px] font-medium mt-3.5 mb-2">For school fees, term by term</h3>
          <p className="text-ink-2">Family and sponsors fund a student; only the school can be paid.</p>
          <ul className="mt-4 border-t border-dashed border-line">
            <li className="flex gap-2.5 items-start py-2.5 border-b border-dashed border-line text-ink-2">
              <BadgeCheck size={18} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
              Pays a verified school wallet, nothing else
            </li>
            <li className="flex gap-2.5 items-start py-2.5 border-b border-dashed border-line text-ink-2">
              <CalendarClock size={18} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
              Each term paid on its due date
            </li>
            <li className="flex gap-2.5 items-start py-2.5 text-ink-2">
              <RefreshCcw size={18} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
              Leftovers returned pro-rata to every sponsor
            </li>
          </ul>
        </div>
      </div>

      {/* How it works strip */}
      <div id="how-it-works" className="mt-16 mb-10 border-t-2 border-ink pt-8">
        <p className="eyebrow mb-6">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-line">
          {[
            { n: '01', t: 'Seal', b: 'Create a pot, choose the payee and deadline. The payee is locked forever — no swap, no redirect.' },
            { n: '02', t: 'Fill', b: 'Contributors add USDC from Arc, Base, or Solana. Every contribution is on-chain and downloadable as a receipt.' },
            { n: '03', t: 'Release or Refund', b: 'Organiser uploads an invoice, co-signers approve, funds release to the payee. Deadline missed → anyone opens refunds, each contributor claims their share.' },
          ].map(step => (
            <div key={step.n} className="py-6 sm:pr-8 sm:pl-8 first:pl-0 last:pr-0">
              <span className="eyebrow text-green">{step.n}</span>
              <h4 className="font-display text-[22px] font-medium mt-2 mb-2">{step.t}</h4>
              <p className="text-ink-2 text-[14px]">{step.b}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Rails strip */}
      <div className="flex items-center gap-5 py-6 border-t border-line text-ink-3 text-[13px] flex-wrap">
        <span className="eyebrow">Settles in</span>
        <img src="/assets/logos/usdc-lockup.svg" alt="USDC" className="h-[22px] w-auto shrink-0" />
        <span>on</span>
        <img src="/assets/logos/arc-logo-navy.svg" alt="Arc" className="h-[22px] w-auto shrink-0" />
        <span className="ml-auto">Pay in from</span>
        <img src="/assets/logos/base-square.svg" alt="Base" className="h-[20px] w-auto shrink-0" />
        <img src="/assets/logos/solana-mark.svg" alt="Solana" className="h-[18px] w-auto shrink-0" />
      </div>

      {/* Footer */}
      <footer className="border-t border-line py-8 text-[13px] text-ink-3">
        <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono">
          <span>KoloFactory <a href={`${NET.explorer}/address/${KOLO_ADDRESSES.factory}`} target="_blank" rel="noopener noreferrer" className="hover:text-green">{short(KOLO_ADDRESSES.factory)} ↗</a></span>
          <span>PayeeRegistry <a href={`${NET.explorer}/address/${KOLO_ADDRESSES.payeeRegistry}`} target="_blank" rel="noopener noreferrer" className="hover:text-green">{short(KOLO_ADDRESSES.payeeRegistry)} ↗</a></span>
          <span className="ml-auto">{NET.label} · Chain {NET.chainId}</span>
        </div>
      </footer>
    </KoloLayout>
  )
}
