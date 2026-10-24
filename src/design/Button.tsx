import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { clsx } from 'clsx'

type Variant = 'ink' | 'green' | 'ghost' | 'warn'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  children: ReactNode
  fullWidth?: boolean
}

export function Button({ variant = 'ink', size = 'md', fullWidth, className, children, ...props }: Props) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-2 font-semibold font-sans transition-opacity disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2',
        size === 'md' ? 'h-11 px-[18px] text-[15px] rounded-[12px]' : 'h-9 px-4 text-[13px] rounded-[10px]',
        variant === 'ink'   && 'bg-ink text-surface border border-ink',
        variant === 'green' && 'bg-green text-surface border border-green',
        variant === 'ghost' && 'bg-transparent text-ink border border-line',
        variant === 'warn'  && 'bg-warn text-surface border border-warn',
        fullWidth && 'w-full justify-center',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
