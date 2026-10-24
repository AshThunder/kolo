/* oxlint-disable typescript/no-explicit-any -- dynamic ABI/log decoding in the indexer/keeper */
// FX estimates behind the server: browser never calls a 3rd-party FX API (CORS + key hygiene).
// USDC ≈ USD, so base is always USD; quote currencies are the user's local currency.
const SUPPORTED = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'BRL', 'MXN', 'NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'XOF', 'AED', 'SGD', 'CHF', 'CNY', 'PHP', 'IDR', 'TRY', 'PKR', 'EGP']
let cache: { at: number; rates: Record<string, number>; source: string } | undefined
export async function fxRates(to: string[]) {
  const want = to.map(s => s.toUpperCase()).filter(s => SUPPORTED.includes(s))
  if (!cache || Date.now() - cache.at > 3600_000) {
    const r = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!r.ok) throw new Error('fx upstream ' + r.status)
    const j: any = await r.json()
    cache = { at: Date.now(), rates: j.rates, source: 'exchangerate-api.com (open)' }
  }
  const rates: Record<string, number> = {}
  for (const c of want) if (cache.rates[c]) rates[c] = cache.rates[c]
  return { base: 'USD', asset: 'USDC', note: 'estimate only; USDC treated as 1 USD', fetchedAt: new Date(cache.at).toISOString(), source: cache.source, rates }
}
export { SUPPORTED as FX_SUPPORTED }
