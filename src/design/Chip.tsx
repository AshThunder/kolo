import { type ReactNode } from 'react'
import { clsx } from 'clsx'

type ChipVariant = 'green' | 'ink' | 'warn' | 'neutral'

interface Props {
  variant?: ChipVariant
  children: ReactNode
  className?: string
}

export function Chip({ variant = 'green', children, className }: Props) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full font-mono text-[12px] tracking-[0.04em]',
      variant === 'green'   && 'bg-green-soft text-green-deep',
      variant === 'ink'     && 'bg-[#ECEAF0] text-ink',
      variant === 'warn'    && 'bg-warn-soft text-warn',
      variant === 'neutral' && 'bg-line text-ink-2',
      className,
    )}>
      {children}
    </span>
  )
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, ChipVariant> = {
    Active: 'green', Verified: 'green', Paid: 'green', Released: 'green', Approved: 'green',
    Pending: 'warn', Disputed: 'warn', Refunding: 'warn', Revoked: 'warn', PendingApproval: 'warn',
    Cancelled: 'neutral', Registered: 'neutral', Closed: 'neutral',
  }
  return <Chip variant={map[status] ?? 'neutral'}>{status}</Chip>
}
