import { PotGovernance } from '../../components/PotGovernance'
import { usePotPayee } from '../../hooks/usePotPayee'
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { Users, GraduationCap, Lock } from 'lucide-react'
import { KoloLayout } from '../../components/KoloLayout'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { PromiseCard } from '../../design/PromiseCard'
import { PotFill } from '../../design/PotFill'
import { LedgerTable, type LedgerRow } from '../../design/LedgerTable'
import { Timeline } from '../../design/Timeline'
import { TermSchedule } from '../../design/TermSchedule'
import { usePotLedger, useTuitionTerms } from '../../hooks/usePotLedger'
import { MilestoneTable } from '../../design/MilestoneTable'
import { Skeleton } from '../../design/Skeleton'
import { FxEstimate } from '../../design/FxEstimate'
import { ContributeModal } from '../../components/ContributeModal'
import { KOLO_ADDRESSES } from '../../config'
import { KOLO_FACTORY_ABI } from '../../abi/KoloFactory'
import { KOLO_GROUP_POT_ABI } from '../../abi/KoloGroupPot'
import { KOLO_TUITION_POT_ABI } from '../../abi/KoloTuitionPot'
import { useGroupPot, useTuitionPot, useMilestones } from '../../hooks/usePot'
import { usePotBySlug } from '../../hooks/usePotMeta'
import { formatUsdc } from '../../lib/money'
import { useFxRate } from '../../hooks/useFxRate'
import { usePotTimeline } from '../../hooks/useActivity'
import { timelineNodes } from '../../lib/timeline'
import { fmtDateTime } from '../../lib/format'
import { ARC_CHAIN_ID } from '../../addresses'

const POT_STATES = ['Active', 'Refunding', 'Closed']
const FACTORY_ADDR = KOLO_ADDRESSES.factory

export default function PotPage() {
  const { slug } = useParams<{ slug: string }>()
  const potMeta = usePotBySlug(slug ?? '')
  const { address: userAddress } = useAccount()
  const [showContribute, setShowContribute] = useState(false)
  const { rate, symbol } = useFxRate()
  const { writeContractAsync } = useWriteContract()

  // Resolve potId → contract address
  const { data: potAddress } = useReadContract({
    address: FACTORY_ADDR,
    abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'potAddress',
    args: [BigInt(potMeta?.potId ?? 0)],
    query: { enabled: !!potMeta?.potId },
  })
  const { data: potType } = useReadContract({
    address: FACTORY_ADDR,
    abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'potType',
    args: [BigInt(potMeta?.potId ?? 0)],
    query: { enabled: !!potMeta?.potId },
  })

  const addr = potAddress
  const isGroup = (potMeta?.potType ?? (potType === undefined ? 0 : Number(potType))) === 0
  const payee = usePotPayee(addr, isGroup)

  const group = useGroupPot(isGroup ? addr : undefined)
  const milestones = useMilestones(isGroup ? addr : undefined, Number(group.milestoneCount ?? 0))
  const tuition = useTuitionPot(!isGroup ? addr : undefined)

  const pot = isGroup ? group : tuition
  const isLoading = pot.isLoading

  // Payee info

  const tc = pot.totalContributed ?? 0n
  const ledger = usePotLedger(potMeta?.potId)
  const balance = (pot.totalContributed ?? 0n) - (pot.totalReleased ?? 0n) - (pot.totalRefunded ?? 0n)
  const terms = useTuitionTerms(!isGroup ? addr : undefined, tuition.termCount, balance)
  const tt = isGroup ? group.target ?? 0n : terms.reduce((a, t) => a + t.amount, 0n)
  const pct = tt > 0n ? Number((tc * 100n) / tt) : 0

  const stateLabel = isGroup
    ? (group.state !== undefined ? POT_STATES[group.state] ?? 'Unknown' : '—')
    : (tuition.state !== undefined ? POT_STATES[tuition.state] ?? 'Unknown' : '—')

  const [nowSec] = useState(() => Math.floor(Date.now() / 1000))
  const deadlineTs = Number(pot.deadline ?? 0n)
  const deadlineStr = deadlineTs ? fmtDateTime(deadlineTs) : '—'
  const timeline = usePotTimeline(potMeta?.potId ? Number(potMeta.potId) : undefined)
  const daysLeft = deadlineTs ? Math.max(0, Math.ceil((deadlineTs - nowSec) / 86400)) : 0

  const isOrganizer = userAddress && pot.organizer && userAddress.toLowerCase() === pot.organizer.toLowerCase()

  async function handleClaimRefund() {
    if (!addr) return
    try {
      const hash = await writeContractAsync({
        address: addr,
        abi: isGroup ? KOLO_GROUP_POT_ABI : KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID,
        functionName: 'claimRefund',
        args: [],
      })
      toast.success('Refund claimed', { description: hash.slice(0, 10) + '…' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rejected')) toast.error('Transaction rejected in wallet')
      else toast.error('Refund failed', { description: msg.slice(0, 80) })
    }
  }

  const ledgerRows: LedgerRow[] = ledger.rows

  if (!potMeta) {
    return (
      <KoloLayout>
        <div className="py-20 text-center text-ink-3">Finding pot on Arc… If this persists the pot does not exist. <Link to="/" className="text-green">Go home</Link></div>
      </KoloLayout>
    )
  }

  return (
    <KoloLayout>
      <ContributeModal open={showContribute} onClose={() => setShowContribute(false)} potAddress={addr} potTitle={potMeta.title} />

      {isLoading ? (
        <div className="pt-8"><Skeleton rows={4} /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 pt-8 pb-16">
          {/* Main */}
          <div>
            <div className="flex flex-wrap gap-2">
              <Chip variant="ink">
                {isGroup ? <><Users size={14} className="inline mr-1" />GroupPot</> : <><GraduationCap size={14} className="inline mr-1" />Tuition Pot</>}
              </Chip>
              <Chip variant={stateLabel === 'Active' ? 'green' : stateLabel === 'Refunding' ? 'warn' : 'neutral'}>
                {stateLabel}
              </Chip>
            </div>
            <h1 className="font-display text-[40px] font-medium leading-[1.1] tracking-[-0.02em] mt-2.5 mb-1.5">
              {potMeta.title}
            </h1>
            <p className="text-ink-2">
              Organised by <span className="font-mono text-[13px]">{pot.organizer ? `${pot.organizer.slice(0, 8)}…${pot.organizer.slice(-4)}` : '—'}</span>
              {' · '}closes <span className="font-mono text-[13px]">{deadlineStr}</span>
            </p>

            <PromiseCard payeeName={payee.payeeName} payeeLabel={payee.payeeLabel} wallet={payee.wallet} />

            {/* Progress */}
            <div className="mt-6 bg-surface border border-line rounded-lg p-6">
              <div className="flex justify-between items-end">
                <div>
                  <span className="eyebrow">Raised</span>
                  <div className="font-display text-[44px] font-medium num leading-none mt-1">{formatUsdc(tc)}<span className="font-mono text-[16px] text-ink-3 ml-1.5">USDC</span></div>
                  <FxEstimate usdc={Number(tc) / 1e6} rate={rate} symbol={symbol} />
                </div>
                {tt > 0n && <div className="text-right">
                  <span className="eyebrow">Target</span>
                  <div className="num text-[20px] mt-1">{formatUsdc(tt)}</div>
                </div>}
              </div>
              <PotFill paidPct={pct} />
              <div className="flex justify-between font-mono text-[13px] text-ink-3">
                <span>{pct}% · {ledger.contributors} contributor{ledger.contributors === 1 ? '' : 's'}</span>
                <span>{daysLeft} days left</span>
              </div>
            </div>

            {/* Ledger / Term schedule */}
            {isGroup ? (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-3">
                  <span className="eyebrow">Contributions</span>
                  <span className="font-mono text-[13px] text-ink-3">Ledger · newest first</span>
                </div>
                {ledgerRows.length ? (
                  <LedgerTable rows={ledgerRows} />
                ) : (
                  <p className="text-ink-3 text-[14px] py-4">No contributions yet. Share the link to start filling.</p>
                )}
              </div>
            ) : (
              <div className="mt-8">
                <span className="eyebrow">Term schedule</span>
                <div className="mt-3">
                  <TermSchedule terms={terms} />
                </div>
              </div>
            )}

            {/* Milestones (group only) */}
            {isGroup && Number(group.milestoneCount ?? 0) > 0 && (
              <div className="mt-8">
                <span className="eyebrow">Milestones</span>
                <div className="mt-3"><MilestoneTable milestones={milestones} /></div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Contribute card (only while the pot accepts money) */}
            {stateLabel === 'Active' && <div className="bg-surface border border-line rounded-lg p-5">
              <span className="eyebrow">Contribute</span>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {([['arc', '/assets/logos/arc-icon-navy.svg', 'Arc'], ['base', '/assets/logos/base-square.svg', 'Base'], ['solana', '/assets/logos/solana-mark.svg', 'Solana']] as const).map(([id, src, label]) => (
                  <div key={id} className="border border-line rounded-[12px] p-2.5 text-center text-[13px] cursor-pointer hover:border-ink">
                    <img src={src} alt={label} className="h-5 block mx-auto mb-1.5" />
                    {label}
                  </div>
                ))}
              </div>
              <Button variant="green" fullWidth className="mt-3" onClick={() => setShowContribute(true)} data-testid="contribute-btn">
                <Lock size={16} strokeWidth={2} />Lock USDC into pot
              </Button>
              <p className="text-[13px] text-ink-3 mt-2">Refunded in full if the pot misses its deadline.</p>
            </div>}

            {/* Refund card (if refunding state) */}
            {stateLabel === 'Refunding' && (
              <div className="bg-surface border border-line rounded-lg p-5">
                <span className="eyebrow">Refund available</span>
                <p className="text-[14px] text-ink-2 mt-2">The pot is in refund state. Claim your pro-rata share.</p>
                <Button variant="ink" fullWidth className="mt-3" onClick={() => { void handleClaimRefund() }} data-testid="claim-refund">
                  Claim refund
                </Button>
              </div>
            )}

            {isGroup && addr && potMeta && <PotGovernance pot={addr} potId={Number(potMeta.potId)} />}

            {/* Organizer dashboard link */}
            {isOrganizer && (
              <Link to={`/organizer/${slug}`} className="block">
                <div className="bg-surface border border-line rounded-lg p-5 hover:border-ink-2 transition-colors">
                  <span className="eyebrow">Organiser dashboard</span>
                  <p className="text-[14px] text-ink-2 mt-1.5">Upload invoices, request approvals.</p>
                </div>
              </Link>
            )}

            {/* Timeline */}
            <div className="bg-surface border border-line rounded-lg p-5">
              <span className="eyebrow">Timeline</span>
              {timeline.isLoading
                ? <div className="mt-3"><Skeleton rows={2} /></div>
                : <Timeline nodes={[
                    { label: 'Pot sealed', sub: 'Payee locked at creation', done: true },
                    ...timelineNodes(timeline.data ?? [], id => (id === payee.payeeId ? payee.payeeName : undefined)),
                    ...(stateLabel === 'Active' ? [{ label: 'Deadline · unspent balance refunds', sub: deadlineStr, done: false }] : []),
                  ]} />}
            </div>
          </div>
        </div>
      )}
    </KoloLayout>
  )
}
