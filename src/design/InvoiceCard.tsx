import { Receipt, Stamp } from 'lucide-react'
import { Chip } from './Chip'
import { Button } from './Button'

interface SignatureSlot {
  label: string
  approved: boolean
}

interface Props {
  invoiceId: number
  description: string
  amount: string
  sha256Short: string
  uploadedAt?: string
  status: string
  slots: SignatureSlot[]
  canApprove?: boolean
  onApprove?: () => void
  canRelease?: boolean
  onRelease?: () => void
  canFlag?: boolean
  onFlag?: () => void
}

export function InvoiceCard({ invoiceId, description, amount, sha256Short, uploadedAt, status, slots, canApprove, onApprove, canRelease, onRelease, canFlag, onFlag }: Props) {
  return (
    <div className="rounded-[14px] border border-line bg-paper p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Invoice #{invoiceId}</span>
        <Chip variant={status === 'Approved' ? 'green' : status === 'Disputed' ? 'warn' : status === 'Released' ? 'green' : 'neutral'}>
          {status}
        </Chip>
      </div>
      <div className="flex items-start gap-3 rounded-[12px] border border-line bg-surface p-3.5">
        <Receipt size={18} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14px] text-ink">{description}</span>
            <span className="font-mono text-[15px] font-medium">{amount}</span>
          </div>
          <div className="font-mono text-[12px] text-ink-3 mt-1">sha256 {sha256Short}{uploadedAt ? ` · uploaded ${uploadedAt}` : ''}</div>
        </div>
      </div>
      {/* Signature slots */}
      <div className="flex gap-2">
        {slots.map((sl, i) => (
          <div key={i} className={`flex-1 h-9 rounded-[10px] border grid place-items-center font-mono text-[12px] ${
            sl.approved ? 'border-green bg-green-soft text-green-deep' : 'border-dashed border-ink-3 text-ink-3'
          }`}>
            {sl.approved ? `✓ ${sl.label}` : sl.label}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {canApprove && (
          <Button variant="ink" fullWidth onClick={onApprove} data-testid="approve-invoice">
            <Stamp size={16} />Approve
          </Button>
        )}
        {canRelease && (
          <Button variant="green" fullWidth onClick={onRelease} data-testid="release-invoice">
            Release funds
          </Button>
        )}
        {canFlag && (
          <Button variant="ghost" size="sm" onClick={onFlag} data-testid="flag-invoice">
            Flag dispute
          </Button>
        )}
      </div>
    </div>
  )
}
