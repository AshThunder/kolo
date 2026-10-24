import { useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { ViewerGate } from '../../components/ViewerGate'
import { useViewer } from '../../hooks/useViewer'
import { ARC_CHAIN_ID } from '../../addresses'
import { Copy, ArrowDownToLine, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { erc20Abi } from 'viem'
import { KoloLayout } from '../../components/KoloLayout'
import { Button } from '../../design/Button'
import { AmountInput } from '../../design/Field'
import { CrossChainTracker } from '../../design/CrossChainTracker'
import { Chip } from '../../design/Chip'
import { formatUsdc, formatDecimal } from '../../lib/money'
import { NET } from '../../network'

const USDC_ADDR = '0x3600000000000000000000000000000000000000' as const
const TABS = ['Receive', 'Top up from another chain', 'Send', 'Activity']
type Chain = 'base' | 'solana' | 'circle'

export default function WalletPage() {
  const { viewer: address } = useViewer()
  const [tab, setTab] = useState(0)
  const [topUpChain, setTopUpChain] = useState<Chain>('base')
  const [topUpAmount, setTopUpAmount] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string>()

  const { data: balance } = useReadContract({
    address: USDC_ADDR,
    abi: erc20Abi,
    functionName: 'balanceOf', chainId: ARC_CHAIN_ID,
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  })

  useEffect(() => {
    if (!address) return
    QRCode.toDataURL(address, { width: 200, margin: 1, color: { dark: '#14172B', light: '#FFFFFF' } })
      .then(setQrDataUrl).catch(() => {})
  }, [address])

  if (!address) return <KoloLayout><ViewerGate what="wallet" /></KoloLayout>

  return (
    <KoloLayout>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 py-10">
        {/* Left */}
        <div>
          <p className="eyebrow">Kolo wallet · connected</p>
          <div className="flex items-end gap-3 mt-2 mb-4 flex-wrap">
            <div className="font-display text-[52px] sm:text-[64px] font-medium num leading-none">
              {balance !== undefined ? formatUsdc(balance) : '—'}
              <span className="font-mono text-[20px] text-ink-3 ml-2">USDC</span>
            </div>
            <Chip variant="neutral">
              <img src="/assets/logos/arc-icon-navy.svg" width={14} height={14} className="inline mr-1" />{NET.label}
            </Chip>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-line mb-6">
            {TABS.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${tab === i ? 'text-ink border-b-2 border-ink' : 'text-ink-3 hover:text-ink-2'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 0 && (
            <div>
              <div className="border border-dashed border-ink-3 rounded-[14px] p-5 flex items-start gap-5">
                {qrDataUrl && <img src={qrDataUrl} width={120} height={120} alt="QR" className="rounded flex-shrink-0" />}
                <div>
                  <span className="eyebrow">Your Arc address</span>
                  <p className="font-mono text-[13px] mt-2 mb-3 break-all leading-relaxed">
                    {address.slice(0, 6)} {address.slice(6, 10)} {address.slice(10, 14)} {address.slice(14, 18)} {address.slice(18, 22)} {address.slice(22, 26)} {address.slice(26, 30)} {address.slice(30, 34)} {address.slice(34, 38)} {address.slice(38)}
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(address); toast.success('Address copied') }} data-testid="copy-address">
                    <Copy size={14} />Copy
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-2.5 bg-warn-soft/40 border border-warn-soft rounded-[12px] p-3.5">
                <TriangleAlert size={16} strokeWidth={2} className="text-warn flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[14px]">Send only USDC on Arc to this address</p>
                  <p className="text-[13px] text-ink-2">From Base or Solana, use "Top up from another chain" so funds arrive via CCTP.</p>
                </div>
              </div>
            </div>
          )}

          {tab === 1 && (
            <div>
              <p className="text-ink-2 text-[14px] mb-4">Bridge USDC from another chain via CCTP Forwarding — no Arc gas needed.</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {([['base', '/assets/logos/base-square.svg', 'Base'], ['solana', '/assets/logos/solana-mark.svg', 'Solana'], ['circle', '/assets/logos/circle-icon.svg', 'Circle account']] as [Chain, string, string][]).map(([id, src, label]) => (
                  <button key={id} onClick={() => setTopUpChain(id)} className={`border rounded-[12px] p-2.5 text-center text-[13px] ${topUpChain === id ? 'border-[1.5px] border-ink bg-paper' : 'border-line'}`}>
                    <img src={src} alt={label} className="h-5 block mx-auto mb-1.5" />
                    {label}
                  </button>
                ))}
              </div>
              <AmountInput value={topUpAmount} onChange={setTopUpAmount} label="Amount" />
              <CrossChainTracker steps={[
                { label: `Burned on ${topUpChain === 'base' ? 'Base' : 'Solana'}`, status: 'pending' },
                { label: 'Attested by Circle (CCTP)', sub: topUpChain === 'base' ? '~20s' : '~15 min', status: 'pending' },
                { label: 'Minted on Arc to your wallet', sub: 'Forwarding Service · no Arc gas needed', status: 'pending' },
              ]} />
              <Button variant="green" fullWidth className="mt-4" onClick={() => toast.info('Cross-chain top-up coming soon')} data-testid="topup-btn">
                <ArrowDownToLine size={16} />Top up {formatDecimal(topUpAmount || '0')} USDC
              </Button>
            </div>
          )}

          {tab === 2 && (
            <p className="text-ink-3 text-[14px]">Send coming soon. Use the Contribute flow to lock funds into a pot.</p>
          )}

          {tab === 3 && (
            <p className="text-ink-3 text-[14px]">Activity feed coming soon.</p>
          )}
        </div>

        {/* Right */}
        <div className="hidden lg:block" />
      </div>
    </KoloLayout>
  )
}
