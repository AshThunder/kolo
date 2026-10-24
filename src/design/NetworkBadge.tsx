import { NET } from '../network'

/** Small always-visible network indicator: live Arc mainnet (green dot) or Arc testnet (amber). */
export function NetworkBadge({ className = '' }: { className?: string }) {
  const live = NET.kind === 'mainnet'
  return (
    <a href={`${NET.explorer}/address/${NET.addresses.factory}`} target="_blank" rel="noopener noreferrer" data-testid="network-badge"
      title={`${NET.label} · chain ${NET.chainId} · KoloFactory ${NET.addresses.factory}`}
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full font-mono text-[11px] tracking-[0.04em] whitespace-nowrap ${live ? 'bg-green-soft text-green-deep' : 'bg-warn-soft text-warn'} ${className}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${live ? 'bg-green' : 'bg-warn'}`} aria-hidden />
      {NET.label}
    </a>
  )
}
