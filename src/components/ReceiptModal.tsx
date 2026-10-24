import { useRef } from 'react'
import { Download, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { toPng } from 'html-to-image'
import { Modal } from '../design/Modal'
import { Button } from '../design/Button'
import type { ReceiptData } from '../lib/receipt'
import { receiptId, receiptTypeLabel, receiptVerifyUrl, formatReceiptAmount } from '../lib/receipt'

interface Props {
  open: boolean
  onClose: () => void
  data: ReceiptData
}

export function ReceiptModal({ open, onClose, data }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const id = receiptId(data)
  const verifyUrl = receiptVerifyUrl(data)
  const ts = new Date(data.timestamp * 1000).toUTCString()

  async function downloadPng() {
    if (!cardRef.current) return
    try {
      const url = await toPng(cardRef.current, { cacheBust: true })
      const a = document.createElement('a'); a.href = url; a.download = `${id}.png`; a.click()
      toast.success('Receipt saved as PNG')
    } catch { toast.error('PNG export failed') }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-[640px]" title="Receipt confirmed">
      <h2 className="font-display text-[28px] font-medium mb-4">Your receipt is ready</h2>

      {/* The receipt card */}
      <div ref={cardRef} className="bg-surface border border-line p-7 rounded-[14px]">
        <div className="flex items-center justify-between">
          <img src="/assets/brand/kolo-wordmark-a.svg" width={94} height={30} className="h-[30px] w-[94px] max-w-none" alt="Kolo" />
          <span className="eyebrow">Receipt · {receiptTypeLabel(data.kind)}</span>
        </div>

        <div className="flex items-end justify-between mt-5">
          <div>
            <span className="eyebrow">Amount</span>
            <div className="font-display text-[44px] font-medium num mt-1">
              {formatReceiptAmount(data.amount)}
              <span className="font-mono text-[18px] text-ink-3 ml-1.5">USDC</span>
            </div>
          </div>
          <img src="/assets/brand/seal-locked.svg" width={84} height={84} alt="Locked" />
        </div>

        <hr className="border-t border-line my-4" />

        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2.5 text-[14px]">
          <dt className="text-ink-3">Pot</dt>
          <dd className="font-mono text-[13px]">{data.potTitle} · #{data.potAddress.slice(0, 6)}…{data.potAddress.slice(-2)}</dd>
          <dt className="text-ink-3">Locked to</dt>
          <dd className="font-mono text-[13px]">{data.payeeName} · {data.payeeLabel}</dd>
          <dt className="text-ink-3">From</dt>
          <dd className="font-mono text-[13px]">{data.from}{data.originChain ? ` · ${data.originChain} → Arc (CCTP)` : ' · Arc'}</dd>
          <dt className="text-ink-3">Arc tx</dt>
          <dd className="font-mono text-[13px]">{data.txHash.slice(0, 10)}…{data.txHash.slice(-4)} · block {Number(data.blockNumber).toLocaleString()}</dd>
          <dt className="text-ink-3">Time</dt>
          <dd className="font-mono text-[13px]">{ts}</dd>
          <dt className="text-ink-3">Receipt ID</dt>
          <dd className="font-mono text-[13px]">{id}</dd>
        </dl>

        <div className="flex items-end justify-between border-t border-dashed border-line pt-4 mt-4">
          <p className="text-[12px] text-ink-3 max-w-[330px]">
            Scan to verify against Arc on-chain events. If the pot misses its deadline, this amount is refundable.
          </p>
          {/* QR stub — in production use qrcode lib */}
          <div className="w-[84px] h-[84px] bg-paper border border-line rounded flex items-center justify-center text-[10px] text-ink-3 font-mono">QR</div>
        </div>
      </div>

      <div className="flex gap-2.5 mt-5 flex-wrap">
        <Button variant="ink" size="sm" onClick={() => { void downloadPng() }} data-testid="receipt-download-png">
          <Download size={15} />PNG
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(verifyUrl); toast.success('Verify link copied') }} data-testid="copy-verify-link">
          <Copy size={15} />Copy verify link
        </Button>
      </div>
    </Modal>
  )
}
