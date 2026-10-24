import { type InputHTMLAttributes, type ReactNode } from 'react'
import { clsx } from 'clsx'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'suffix'> {
  label?: string
  hint?: string
  error?: string
  prefix?: ReactNode
  suffix?: ReactNode
}

export function Field({ label, hint, error, prefix, suffix, className, id, ...props }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="eyebrow">{label}</label>}
      <div className={clsx(
        'flex items-center gap-2.5 h-[52px] px-3.5 rounded-[12px] border bg-surface transition-colors',
        error ? 'border-danger' : 'border-line focus-within:border-ink',
        className,
      )}>
        {prefix}
        <input id={id} className="flex-1 bg-transparent outline-none text-ink placeholder:text-ink-3 text-[15px]" {...props} />
        {suffix}
      </div>
      {hint && !error && <p className="text-[13px] text-ink-3">{hint}</p>}
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  )
}

interface AmountInputProps {
  value: string
  onChange: (v: string) => void
  balance?: string
  error?: string
  label?: string
}

export function AmountInput({ value, onChange, balance, error, label }: AmountInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="eyebrow">{label}</span>}
      <div className={clsx(
        'flex items-center gap-2.5 h-[52px] px-3.5 rounded-[12px] border bg-surface',
        error ? 'border-danger' : 'border-line focus-within:border-ink',
      )}>
        <img src="/assets/logos/usdc-token.svg" width={24} height={24} alt="USDC" />
        <input
          type="number"
          min="0"
          step="0.000001"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0.00"
          className="flex-1 bg-transparent outline-none text-ink text-[20px] num font-medium"
        />
        <span className="font-mono text-[13px] text-ink-3">USDC</span>
      </div>
      {balance && <p className="text-[13px] text-ink-3">Balance: <span className="num">{balance}</span> USDC</p>}
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  )
}
