import { formatUnitsExact, formatUnitsFixed } from '../onchain-money'

const USDC_DECIMALS = 6

const group = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * Display amount: always two decimals, thousands separators, rounded DOWN (never overstates what a pot holds).
 * A non-zero amount below one cent shows as "<0.01". Exact amounts live on receipts and in the CSV.
 */
export function formatUsdc(raw: bigint): string {
  if (raw > 0n && raw < 10_000n) return '<0.01'
  const [whole, frac] = formatUnitsFixed(raw, USDC_DECIMALS, 2).split('.')
  const neg = whole.startsWith('-')
  return `${neg ? '-' : ''}${group(neg ? whole.slice(1) : whole)}.${frac}`
}

/** Receipt/ledger amount: at least two decimals, full precision (up to 6) when the amount needs it. */
export function formatUsdcExact(raw: bigint): string {
  const [whole, frac = ''] = formatUnitsExact(raw, USDC_DECIMALS).split('.')
  const neg = whole.startsWith('-')
  return `${neg ? '-' : ''}${group(neg ? whole.slice(1) : whole)}.${frac.padEnd(2, '0')}`
}

/** Decimal string from the server (e.g. "0.5") → two-decimal display, floored. */
export function formatDecimal(s: string | number): string {
  const [w, f = ''] = String(s).split('.'); const frac = f.padEnd(2, '0').slice(0, 2)
  if (Number(s) > 0 && Number(`${w}.${frac}`) === 0) return '<0.01'
  return `${group(w)}.${frac}`
}

/** Exact decimal string from the server with at least two decimals (CSV / receipts). */
export function formatDecimalExact(s: string | number): string {
  const [w, f = ''] = String(s).split('.'); return `${w}.${f.padEnd(2, '0')}`
}

/** Typed decimal ("12.5") → 6-decimal integer, ignoring malformed or over-precise input. Never goes through floats. */
export function toMicro(s: string): bigint {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s.trim()); if (!m) return 0n
  return BigInt(m[1] || '0') * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0').slice(0, 6) || '0')
}
