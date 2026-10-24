import { clsx } from 'clsx'
import { FxEstimate } from './FxEstimate'

/** Keep digits and at most one dot with two decimals: what a USDC amount looks like to a person. */
export const cleanMoney = (v: string) => {
  const s = v.replace(/[^\d.]/g, ''); const [w, ...rest] = s.split('.')
  return rest.length ? `${w}.${rest.join('').slice(0, 2)}` : w
}
export const padMoney = (v: string) => { if (!v || v === '.') return ''; const [w, f = ''] = v.split('.'); return `${w || '0'}.${f.padEnd(2, '0')}` }

interface Props {
  id: string; label: string; value: string; onChange: (v: string) => void; onBlur?: () => void
  error?: string; hint?: string; rate?: number; symbol?: string; placeholder?: string
}

/** USDC amount input: 2 decimals, decimal keypad on mobile, optional local-currency estimate. */
export function MoneyField({ id, label, value, onChange, onBlur, error, hint, rate, symbol, placeholder = '0.00' }: Props) {
  const n = Number(value)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="eyebrow">{label}</label>
      <div className={clsx('flex items-center gap-2.5 h-[52px] px-3.5 rounded-[12px] border bg-surface transition-colors', error ? 'border-danger' : 'border-line focus-within:border-ink')}>
        <img src="/assets/logos/usdc-token.svg" width={24} height={24} alt="" />
        <input id={id} inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder} aria-invalid={!!error} aria-describedby={`${id}-note`}
          onChange={e => onChange(cleanMoney(e.target.value))} onBlur={() => { onChange(padMoney(value)); onBlur?.() }}
          className="flex-1 min-w-0 bg-transparent outline-none text-ink text-[20px] num font-medium" />
        <span className="font-mono text-[13px] text-ink-3">USDC</span>
      </div>
      <div id={`${id}-note`} className="min-h-[20px] text-[13px] flex flex-wrap gap-x-3">
        {error ? <p className="text-danger">{error}</p> : hint ? <p className="text-ink-3">{hint}</p> : null}
        {!error && n > 0 && <FxEstimate usdc={n} rate={rate} symbol={symbol} />}
      </div>
    </div>
  )
}
