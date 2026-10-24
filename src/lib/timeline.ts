import type { TimelineRow } from '../hooks/useActivity'
import { formatDecimal } from './money'
import { fmtDateTime, shortAddr } from './format'

export interface TimelineNode { label: string; sub?: string; done?: boolean; warn?: boolean }

/** Plain-language label for one on-chain pot event. Amounts always show two decimals. */
export function describeEvent(r: TimelineRow, payeeName?: (id: number) => string | undefined): TimelineNode {
  const inv = r.invoiceId !== undefined ? `Invoice #${r.invoiceId}` : 'Invoice'
  const sub = fmtDateTime(r.ts)
  switch (r.event) {
    case 'InvoiceSubmitted': return { label: `${inv} submitted · ${formatDecimal(r.amount ?? '0')} USDC`, sub, done: true }
    case 'InvoiceApproved': return { label: `${inv} approved${r.actor ? ` by ${shortAddr(r.actor)}` : ''}`, sub, done: true }
    case 'InvoiceFlagged': return { label: `${inv} flagged for dispute${r.actor ? ` by ${shortAddr(r.actor)}` : ''}`, sub, warn: true }
    case 'InvoiceCancelled': return { label: `${inv} cancelled`, sub, warn: true }
    case 'DisputeResolved': return { label: `Dispute on ${inv.toLowerCase()} resolved: ${r.uphold ? 'upheld, invoice voided' : 'dismissed, invoice stands'}`, sub, done: true }
    case 'Released': return { label: `${r.invoiceId !== undefined ? `${inv} released` : 'Funds released'} to ${payeeName?.(r.payeeId ?? 0) ?? (r.payeeId ? `payee #${String(r.payeeId).padStart(3, '0')}` : 'the sealed payee')} · ${formatDecimal(r.amount ?? '0')} USDC`, sub, done: true }
    case 'TermPaid': return { label: `Term ${(r.termIndex ?? 0) + 1} paid to school · ${formatDecimal(r.amount ?? '0')} USDC`, sub, done: true }
    case 'MilestoneCompleted': return { label: `Milestone ${(r.milestoneId ?? 0) + 1} completed`, sub, done: true }
    case 'Refunding': return { label: 'Refunds opened: unspent balance returns to contributors', sub, warn: true }
    case 'Closed': return { label: 'Pot closed', sub, done: true }
    case 'Paused': return { label: 'Pot paused by co-signers', sub, warn: true }
    case 'Unpaused': return { label: 'Pot resumed', sub, done: true }
    default: return { label: r.event, sub }
  }
}

/** Chronological, with identical (tx, event) pairs collapsed. */
export function timelineNodes(rows: TimelineRow[], payeeName?: (id: number) => string | undefined): TimelineNode[] {
  const seen = new Set<string>()
  return rows.slice().sort((a, b) => a.ts - b.ts || a.logIndex - b.logIndex)
    .filter(r => { const k = `${r.tx}:${r.logIndex}`; if (seen.has(k)) return false; seen.add(k); return true })
    .map(r => describeEvent(r, payeeName))
}
