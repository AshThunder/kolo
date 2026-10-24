import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export { formatUsdc } from './money'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function parseOnchainError(error: unknown): string {
  const e = error as { message?: string; code?: number } | null
  if (!e) return 'Something went wrong.'
  const msg = e.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || e.code === 4001) return 'Transaction cancelled.'
  if (msg.includes('alreadypurchased')) return 'You have already unlocked this item.'
  if (msg.includes('itemnotactive')) return 'This item is no longer available.'
  if (msg.includes('pricetoolow') || msg.includes('pricetoo')) return 'Price changed — refresh and try again.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance'))
    return 'Insufficient USDC balance.'
  if (msg.includes('reverted')) {
    const m = msg.match(/reason="([^"]+)"/)
    return m ? `Transaction failed: ${m[1]}` : 'Transaction failed — check your USDC balance.'
  }
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error — please retry.'
  return 'Something went wrong. Please try again.'
}
