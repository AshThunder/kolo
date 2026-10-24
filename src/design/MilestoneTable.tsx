import { Chip } from './Chip'
import { formatUsdc } from '../lib/money'

interface Milestone {
  index: number
  label: string
  amount: bigint
  cap: bigint
  status: 'Open' | 'Partial' | 'Done' | 'Disputed' | 'NotSubmitted'
}

interface Props { milestones: Milestone[] }

const STATUS_LABELS: Record<string, string> = {
  Open: 'Not submitted', Partial: 'Partial', Done: 'Released',
  Disputed: 'Disputed', NotSubmitted: 'Not submitted',
}
const STATUS_VARIANTS: Record<string, 'green' | 'warn' | 'neutral' | 'ink'> = {
  Done: 'green', Disputed: 'warn', Open: 'ink', Partial: 'neutral', NotSubmitted: 'ink',
}

export function MilestoneTable({ milestones }: Props) {
  return (
    <table className="w-full border-collapse text-[14px]">
      <thead>
        <tr>
          <th className="eyebrow text-left pb-2 pr-3 border-b border-line w-8">#</th>
          <th className="eyebrow text-left pb-2 pr-3 border-b border-line">Milestone</th>
          <th className="eyebrow text-right pb-2 pr-3 border-b border-line">Amount</th>
          <th className="eyebrow text-left pb-2 border-b border-line">Status</th>
        </tr>
      </thead>
      <tbody>
        {milestones.map(m => (
          <tr key={m.index} className="border-b border-line">
            <td className="py-3 pr-3 font-mono text-[13px] text-ink-2">{m.index}</td>
            <td className="py-3 pr-3 text-ink">{m.label}</td>
            <td className="py-3 pr-3 text-right num">{formatUsdc(m.amount)}</td>
            <td className="py-3">
              <Chip variant={STATUS_VARIANTS[m.status] ?? 'neutral'}>{STATUS_LABELS[m.status] ?? m.status}</Chip>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
