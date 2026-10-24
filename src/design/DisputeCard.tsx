import { Scale, Hourglass } from 'lucide-react'
import { Button } from './Button'

interface Slot { label: string; voted: boolean; uphold?: boolean }

interface Props {
  milestoneLabel?: string
  flaggedBy: string
  flaggedAt: string
  reason: string
  slots: Slot[]
  deadlineLabel: string
  canVote?: boolean
  onUphold?: () => void
  onReject?: () => void
}

export function DisputeCard({ milestoneLabel, flaggedBy, flaggedAt, reason, slots, deadlineLabel, canVote, onUphold, onReject }: Props) {
  return (
    <div className="border border-warn rounded-[14px] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{milestoneLabel ? `Dispute on ${milestoneLabel}` : 'Dispute'}</span>
        <Scale size={18} strokeWidth={2} className="text-warn" />
      </div>
      <div className="bg-paper rounded-[10px] p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-[14px]">Flagged by {flaggedBy}</span>
          <span className="font-mono text-[12px] text-ink-3">{flaggedAt}</span>
        </div>
        {reason && <p className="text-[14px] text-ink-2 mt-1.5 italic">"{reason}"</p>}
      </div>
      <p className="text-[14px] text-ink-2">Co-signers must re-vote. Earlier approvals were cleared.</p>
      <div className="flex gap-2">
        {slots.map((sl, i) => (
          <div key={i} className={`flex-1 h-9 rounded-[10px] border grid place-items-center font-mono text-[12px] ${
            sl.voted
              ? sl.uphold ? 'border-green bg-green-soft text-green-deep' : 'border-warn bg-warn-soft text-warn'
              : 'border-dashed border-ink-3 text-ink-3'
          }`}>
            {sl.voted ? `${sl.uphold ? 'Uphold' : 'Reject'} · ${sl.label}` : sl.label}
          </div>
        ))}
      </div>
      {canVote && (
        <div className="flex gap-2">
          <Button variant="ink" fullWidth onClick={onUphold} data-testid="uphold-dispute">Uphold invoice</Button>
          <Button variant="ghost" fullWidth onClick={onReject} data-testid="reject-dispute">Reject</Button>
        </div>
      )}
      <div className="flex items-start gap-2.5 bg-warn-soft/40 rounded-[10px] p-3 border border-warn-soft">
        <Hourglass size={18} strokeWidth={2} className="text-warn flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-[14px] text-ink">If unresolved by {deadlineLabel}, refunds open</p>
          <p className="text-[13px] text-ink-2">Unreleased balance returns pro-rata to every contributor.</p>
        </div>
      </div>
    </div>
  )
}
