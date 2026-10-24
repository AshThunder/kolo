/** Wallet/contract failure → one plain sentence. */
export function txError(e: unknown): string {
  const x = e as { shortMessage?: string; message?: string; code?: number } | null
  const m = `${x?.shortMessage ?? ''} ${x?.message ?? ''}`.toLowerCase()
  if (!x) return 'Something went wrong.'
  if (m.includes('user rejected') || m.includes('user denied') || x.code === 4001) return 'Cancelled in your wallet. Nothing was sent.'
  if (m.includes('accesscontrol') || m.includes('missing role')) return 'This wallet is not the Kolo registrar, so the registry refused it.'
  if (m.includes('walletalreadyused')) return 'That wallet is already in the registry.'
  if (m.includes('alreadyverified')) return 'Already verified.'
  if (m.includes('alreadyrevoked')) return 'Already revoked.'
  if (m.includes('timelocknotelapsed')) return 'The 48-hour notice has not finished yet.'
  if (m.includes('insufficient funds') || m.includes('exceeds the balance')) return 'Not enough USDC in this wallet to pay the network fee.'
  if (m.includes('chain') && m.includes('mismatch')) return 'Switch your wallet to Arc (chain 5042) and try again.'
  if (m.includes('timeout') || m.includes('network') || m.includes('fetch')) return 'Network problem. Please retry.'
  return x.shortMessage ?? 'The transaction failed. Please try again.'
}
