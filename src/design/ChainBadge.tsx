type Chain = 'arc' | 'base' | 'solana' | 'cctp'

const CHAIN_META: Record<Chain, { src: string; label: string }> = {
  arc:    { src: '/assets/logos/arc-icon-navy.svg',  label: 'Arc' },
  base:   { src: '/assets/logos/base-square.svg',    label: 'Base' },
  solana: { src: '/assets/logos/solana-mark.svg',    label: 'Solana' },
  cctp:   { src: '/assets/logos/usdc-token.svg',     label: 'CCTP' },
}

interface Props { chain: Chain; size?: number }

export function ChainBadge({ chain, size = 16 }: Props) {
  const { src, label } = CHAIN_META[chain] ?? CHAIN_META.arc
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      <img src={src} width={size} height={size} alt={label} />
      {label}
    </span>
  )
}
