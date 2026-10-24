import { Download } from 'lucide-react'
import { Chip } from './Chip'
import { Button } from './Button'
import { formatUsdc } from '../lib/money'

interface Term {
  label: string
  dueDate: string
  amount: bigint
  status: 'Pending' | 'Paid' | 'Due' | 'Short'
  shortfall?: bigint
  onPayTerm?: () => void
  onDownloadStatement?: () => void
}

interface Props { terms: Term[] }

export function TermSchedule({ terms }: Props) {
  return (
    <table className="w-full border-collapse text-[14px]">
      <thead>
        <tr>
          <th className="eyebrow text-left pb-2 pr-2 border-b border-line">Term</th>
          <th className="eyebrow text-left pb-2 pr-2 border-b border-line">Due</th>
          <th className="eyebrow text-right pb-2 pr-2 border-b border-line">Amount</th>
          <th className="eyebrow text-left pb-2 pr-2 border-b border-line">Status</th>
          <th className="eyebrow text-right pb-2 border-b border-line">Statement</th>
        </tr>
      </thead>
      <tbody>
        {terms.map((t, i) => (
          <tr key={i} className="border-b border-line">
            <td className="py-3 pr-2 text-ink">{t.label}</td>
            <td className="py-3 pr-2 font-mono text-[13px] text-ink-2">{t.dueDate}</td>
            <td className="py-3 pr-2 text-right num">{formatUsdc(t.amount)}</td>
            <td className="py-3 pr-2">
              {t.status === 'Paid' && <Chip variant="green">Paid</Chip>}
              {t.status === 'Due' && <Button size="sm" variant="green" onClick={t.onPayTerm} data-testid={`pay-term-${i}`}>Pay now</Button>}
              {t.status === 'Pending' && <Chip variant="ink">Scheduled</Chip>}
              {t.status === 'Short' && <Chip variant="warn">{formatUsdc(t.shortfall ?? 0n)} short</Chip>}
            </td>
            <td className="py-3 text-right">
              {t.status === 'Paid' ? (
                <button onClick={t.onDownloadStatement} className="inline-flex items-center gap-1 text-ink-2 hover:text-green">
                  <Download size={16} strokeWidth={2} /> PDF
                </button>
              ) : <span className="text-ink-3 text-[13px]">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
