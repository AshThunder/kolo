import { formatUsdc, formatDecimal, toMicro } from '../../lib/money'
import { usePotPayee } from '../../hooks/usePotPayee'
import { useParams, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Copy, Download, Printer, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { KoloLayout } from '../../components/KoloLayout'
import { Button } from '../../design/Button'
import { AmountInput } from '../../design/Field'
import { PromiseCard } from '../../design/PromiseCard'
import { FxEstimate } from '../../design/FxEstimate'
import { usePotBySlug } from '../../hooks/usePotMeta'
import { useFxRate } from '../../hooks/useFxRate'
import { ContributeModal } from '../../components/ContributeModal'
import { useReadContract } from 'wagmi'
import { KOLO_FACTORY_ABI } from '../../abi/KoloFactory'
import { KOLO_ADDRESSES } from '../../config'
import { ARC_CHAIN_ID } from '../../addresses'

export default function PayLink() {
  const { slug } = useParams<{ slug: string }>()
  const [params] = useSearchParams()
  const amtParam = params.get('amt') ?? ''
  const every = params.get('every') ?? ''
  const isMonthly = every === 'month'
  const potMeta = usePotBySlug(slug ?? '')
  const [tab, setTab] = useState<'once' | 'monthly'>(isMonthly ? 'monthly' : 'once')
  const [amount, setAmount] = useState(amtParam)
  const [showContribute, setShowContribute] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>()
  const { rate, symbol } = useFxRate()

  const shareUrl = `${window.location.origin}/pay/${slug}?amt=${amount}&every=${tab === 'monthly' ? 'month' : ''}`

  const { data: potAddress } = useReadContract({
    address: KOLO_ADDRESSES.factory,
    abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'potAddress',
    args: [BigInt(potMeta?.potId ?? 0)],
    query: { enabled: !!potMeta?.potId },
  })
  const addr = potAddress
  const payee = usePotPayee(addr, potMeta?.potType !== 1)

  useEffect(() => {
    if (!shareUrl) return
    QRCode.toDataURL(shareUrl, { width: 200, margin: 1, color: { dark: '#14172B', light: '#FFFFFF' } })
      .then(setQrDataUrl).catch(() => {})
  }, [shareUrl])

  if (!potMeta) return (
    <KoloLayout><div className="py-20 text-center text-ink-3">Finding pot on Arc…</div></KoloLayout>
  )

  return (
    <KoloLayout>
      <ContributeModal open={showContribute} onClose={() => setShowContribute(false)} potAddress={addr} potTitle={potMeta.title} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 py-10">
        {/* Left: pay request */}
        <div>
          <p className="eyebrow mb-1">Payment request</p>
          <h1 className="font-display text-[40px] font-medium leading-[1.1] mb-2">{potMeta.title}</h1>
          <PromiseCard payeeName={payee.payeeName} payeeLabel={payee.payeeLabel} wallet={payee.wallet} />

          <div className="mt-5 bg-surface border border-line rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="eyebrow">Requested</span>
              <div className="flex border border-line rounded-[10px] overflow-hidden text-[13px]">
                {(['once', 'monthly'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 capitalize ${tab === t ? 'bg-ink text-surface font-semibold' : 'text-ink-3'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <AmountInput value={amount} onChange={setAmount} label={tab === 'monthly' ? 'Amount per month' : 'Amount'} />
            {amount && Number(amount) > 0 && (
              <p className="text-[13px] mt-1">
                <FxEstimate usdc={Number(amount)} rate={rate} symbol={symbol} />
                {tab === 'monthly' && <span className="text-ink-3"> / month</span>}
              </p>
            )}

            {tab === 'monthly' && (
              <div className="mt-4 text-[14px] border-t border-line pt-4 space-y-1.5">
                <div className="flex justify-between"><span className="text-ink-3">Approve once</span><span className="num font-medium">{formatUsdc(toMicro(amount) * 3n)} USDC allowance</span></div>
                <div className="flex justify-between"><span className="text-ink-3">Pulls</span><span className="font-mono text-[13px]">monthly, on schedule</span></div>
                <div className="flex justify-between"><span className="text-ink-3">Stop anytime</span><span>revoke in Wallet</span></div>
              </div>
            )}

            <Button variant="green" fullWidth className="mt-4" onClick={() => setShowContribute(true)} data-testid="pay-request-contribute">
              <Repeat size={16} />
              {tab === 'monthly' ? `Approve ${formatDecimal(amount || '0')} USDC monthly` : `Contribute ${formatDecimal(amount || '0')} USDC`}
            </Button>
          </div>
        </div>

        {/* Right: organiser share */}
        <div>
          <div className="bg-surface border border-line rounded-lg p-8 text-center">
            <span className="eyebrow block mb-4">Organiser view · share this request</span>
            {qrDataUrl && <img src={qrDataUrl} alt="QR" width={200} height={200} className="mx-auto block rounded" />}
            <p className="font-mono text-[13px] mt-4 break-all text-ink-2">{shareUrl}</p>
            <div className="flex gap-2 justify-center mt-4 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(shareUrl); toast.success('Link copied') }} data-testid="copy-paylink">
                <Copy size={14} />Copy link
              </Button>
              {qrDataUrl && (
                <Button variant="ghost" size="sm" onClick={() => {
                  const a = document.createElement('a'); a.href = qrDataUrl; a.download = `kolo-qr-${slug}.png`; a.click()
                }}>
                  <Download size={14} />QR PNG
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => window.print()}>
                <Printer size={14} />Print poster
              </Button>
            </div>
          </div>
          <p className="text-[13px] text-ink-3 mt-3">Anyone can trigger a due pull; Kolo's keeper does it automatically. Pulls never exceed the approved amount.</p>
        </div>
      </div>
    </KoloLayout>
  )
}
