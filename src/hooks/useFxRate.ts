import { useState, useEffect } from 'react'
import { api } from '../lib/api'

interface Rates { [currency: string]: number }
const cache: Record<string, { rate: number; ts: number }> = {}
const TTL_MS = 60 * 60 * 1000 // 1 hour

export function useFxRate(currency?: string): { rate: number | undefined; symbol: string } {
  const target = currency ?? getBrowserCurrency()
  const [rate, setRate] = useState<number | undefined>(undefined)

  useEffect(() => {
    let alive = true
    if (target === 'USD') { setRate(undefined); return }
    const hit = cache[target]
    if (hit && Date.now() - hit.ts < TTL_MS) { setRate(hit.rate); return }
    // Server-side FX (no CORS, cached 1h). Base is USD; USDC is treated as 1 USD. Display-only estimate.
    api<{ rates: Rates }>(`/fx?to=${target}`)
      .then(j => { const r = j.rates[target]; if (r) cache[target] = { rate: r, ts: Date.now() }; if (alive) setRate(r) })
      .catch(() => { /* FX is display-only */ })
    return () => { alive = false }
  }, [target])

  return { rate, symbol: CURRENCY_SYMBOLS[target] ?? target }
}

const EURO = ['DE', 'FR', 'ES', 'IT', 'NL', 'IE', 'PT', 'BE', 'AT', 'FI', 'GR', 'LU', 'SK', 'SI', 'EE', 'LV', 'LT', 'MT', 'CY', 'HR']
const REGION_CCY: Record<string, string> = {
  ...Object.fromEntries(EURO.map(r => [r, 'EUR'])),
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', JP: 'JPY', IN: 'INR', BR: 'BRL', MX: 'MXN', CH: 'CHF', CN: 'CNY', SG: 'SGD', AE: 'AED',
  PH: 'PHP', ID: 'IDR', TR: 'TRY', PK: 'PKR', EG: 'EGP', NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', UG: 'UGX', SN: 'XOF', CI: 'XOF',
}
/** User override (localStorage 'kolo:currency') → browser region → USD. USD means no local-currency estimate is shown. */
export function getBrowserCurrency(): string {
  try {
    const o = localStorage.getItem('kolo:currency'); if (o) return o
    const region = new Intl.Locale(navigator.language || 'en-US').maximize().region
    return (region && REGION_CCY[region]) || 'USD'
  } catch { return 'USD' }
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€', GBP: '£', JPY: '¥', NGN: '₦', KES: 'KSh', GHS: '₵',
  INR: '₹', BRL: 'R$', MXN: 'MX$', ZAR: 'R', CAD: 'CA$', AUD: 'A$', UGX: 'USh', XOF: 'CFA', USD: '$',
}
