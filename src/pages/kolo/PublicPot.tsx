import { usePotPayee } from '../../hooks/usePotPayee'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Copy, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { KoloLayout } from '../../components/KoloLayout'
import { Chip } from '../../design/Chip'
import { PromiseCard } from '../../design/PromiseCard'
import { PotFill } from '../../design/PotFill'
import { TermSchedule } from '../../design/TermSchedule'
import { usePotLedger, useTuitionTerms } from '../../hooks/usePotLedger'
import { LedgerTable } from '../../design/LedgerTable'
import { ContributeModal } from '../../components/ContributeModal'
import { usePotBySlug } from '../../hooks/usePotMeta'
import { formatUsdc } from '../../lib/money'
import { BRAND } from '../../brand'
import { useReadContract } from 'wagmi'
import { KOLO_FACTORY_ABI } from '../../abi/KoloFactory'
import { KOLO_ADDRESSES } from '../../config'
import { useTuitionPot, useGroupPot } from '../../hooks/usePot'
import { Users, GraduationCap } from 'lucide-react'
import { ARC_CHAIN_ID } from '../../addresses'

export default function PublicPot() {
  const { slug } = useParams<{ slug: string }>()
  const potMeta = usePotBySlug(slug ?? '')
  const [showContribute, setShowContribute] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>()
  const shareUrl = `${window.location.origin}/p/${slug}`

  // Generate QR on mount
  useState(() => {
    QRCode.toDataURL(shareUrl, { width: 200, margin: 1, color: { dark: '#14172B', light: '#FFFFFF' } })
      .then(setQrDataUrl).catch(() => {})
  })

  const { data: potAddress } = useReadContract({
    address: KOLO_ADDRESSES.factory,
    abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'potAddress',
    args: [BigInt(potMeta?.potId ?? 0)],
    query: { enabled: !!potMeta?.potId },
  })
  const { data: potType } = useReadContract({
    address: KOLO_ADDRESSES.factory,
    abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'potType',
    args: [BigInt(potMeta?.potId ?? 0)],
    query: { enabled: !!potMeta?.potId },
  })

  const addr = potAddress
  const isGroup = (potMeta?.potType ?? (potType === undefined ? 0 : Number(potType))) === 0
  const payee = usePotPayee(addr, isGroup)
  const group = useGroupPot(isGroup ? addr : undefined)
  const tuition = useTuitionPot(!isGroup ? addr : undefined)
  const pot = isGroup ? group : tuition
  const ledger = usePotLedger(potMeta?.potId)
  const balance = (pot.totalContributed ?? 0n) - (pot.totalReleased ?? 0n) - (pot.totalRefunded ?? 0n)
  const terms = useTuitionTerms(!isGroup ? addr : undefined, tuition.termCount, balance)

  if (!potMeta) {
    return (
      <KoloLayout isPublic>
        <div className="py-20 text-center text-ink-3">Finding pot on Arc…</div>
      </KoloLayout>
    )
  }

  const tc = pot.totalContributed ?? 0n
  const tt = isGroup ? group.target ?? 0n : terms.reduce((a, t) => a + t.amount, 0n)
  const pct = tt > 0n ? Number((tc * 100n) / tt) : 0

  return (
    <KoloLayout isPublic onContribute={() => setShowContribute(true)}>
      <ContributeModal open={showContribute} onClose={() => setShowContribute(false)} potAddress={addr} potTitle={potMeta.title} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 pt-8 pb-16">
        <div>
          <div className="flex flex-wrap gap-2">
            <Chip variant="ink">
              {isGroup ? <><Users size={14} className="inline mr-1" />GroupPot</> : <><GraduationCap size={14} className="inline mr-1" />Tuition Pot</>}
            </Chip>
          </div>
          <h1 className="font-display text-[40px] font-medium leading-[1.1] tracking-[-0.02em] mt-2.5 mb-1.5">{potMeta.title}</h1>
          <p className="text-ink-2 text-[14px]">Amounts public on Arc · <a href={`${BRAND.explorerBase}/address/${addr}`} target="_blank" rel="noopener noreferrer" className="text-green">Verify on explorer ↗</a></p>

          <PromiseCard payeeName={payee.payeeName} payeeLabel={payee.payeeLabel} wallet={payee.wallet} />

          {isGroup ? (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <span className="eyebrow">Contributions</span>
                <a href={ledger.csvUrl} download={`kolo-pot-${potMeta.potId}.csv`} data-testid="export-csv" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 border border-line rounded-[10px] px-3 h-9 hover:border-ink">
                  <FileSpreadsheet size={15} />Export ledger CSV
                </a>
              </div>
              <LedgerTable rows={ledger.rows} />
            </div>
          ) : (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <span className="eyebrow">Term schedule</span>
                <a href={ledger.csvUrl} download={`kolo-pot-${potMeta.potId}.csv`} data-testid="export-csv" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 border border-line rounded-[10px] px-3 h-9 hover:border-ink">
                  <FileSpreadsheet size={15} />Export ledger CSV
                </a>
              </div>
              <TermSchedule terms={terms} />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-surface border border-line rounded-lg p-5">
            <span className="eyebrow">Raised</span>
            <div className="font-display text-[40px] font-medium mt-2 num">{formatUsdc(tc)}<span className="font-mono text-[16px] text-ink-3 ml-1.5">USDC</span></div>
            <PotFill paidPct={pct} />
            {tt > 0n && <p className="font-mono text-[13px] text-ink-3">of {formatUsdc(tt)} · {ledger.contributors} contributor{ledger.contributors === 1 ? '' : 's'}</p>}
          </div>

          <div className="bg-surface border border-line rounded-lg p-5">
            <span className="eyebrow">Share</span>
            <div className="mt-3 flex items-start gap-4 border border-dashed border-ink-3 rounded-[14px] p-4">
              {qrDataUrl && <img src={qrDataUrl} alt="QR code" width={110} height={110} className="rounded flex-shrink-0" />}
              <div>
                <p className="font-mono text-[13px] break-all text-ink-2">{shareUrl}</p>
                <button
                  onClick={() => { void navigator.clipboard.writeText(shareUrl); toast.success('Link copied') }}
                  className="mt-2.5 inline-flex items-center gap-1.5 border border-line rounded-[10px] px-3 h-9 text-[13px] hover:border-ink"
                  data-testid="copy-share-link"
                >
                  <Copy size={14} />Copy link
                </button>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-lg p-5">
            <span className="eyebrow">Proof</span>
            <p className="text-[14px] text-ink-2 mt-2">
              Every number on this page is read from Arc.{' '}
              <a href={`${BRAND.explorerBase}/address/${addr}`} target="_blank" rel="noopener noreferrer" className="text-green font-semibold">Verify on explorer ↗</a>
            </p>
          </div>
        </div>
      </div>
    </KoloLayout>
  )
}
