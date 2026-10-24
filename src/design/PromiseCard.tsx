import { BadgeCheck } from 'lucide-react'

interface Props {
  payeeName: string
  payeeLabel: string
  wallet: string
  released?: boolean
}

export function PromiseCard({ payeeName, payeeLabel, wallet, released = false }: Props) {
  return (
    <div className="relative bg-surface border border-ink rounded-lg p-5 sm:p-6 grid grid-cols-[1fr_auto] gap-4 items-center mt-6">
      <div>
        <span className="eyebrow">This money can only go to</span>
        <div className="mt-1.5 flex items-center gap-2 font-display text-[22px] font-medium">
          {payeeName}
          <BadgeCheck size={20} className="text-green flex-shrink-0" />
        </div>
        <div className="font-mono text-[13px] text-ink-3 mt-1">
          {payeeLabel} · {wallet} · locked at creation
        </div>
      </div>
      <img
        src={released ? '/assets/brand/seal-released.svg' : '/assets/brand/seal-locked.svg'}
        width={96}
        height={96}
        alt={released ? 'Paid as promised' : 'Locked'}
        className={released ? 'seal-stamp' : ''}
      />
    </div>
  )
}
