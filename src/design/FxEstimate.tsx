interface Props {
  usdc: number
  rate?: number
  symbol?: string
}

export function FxEstimate({ usdc, rate, symbol = '€' }: Props) {
  if (!rate) return null
  const est = (usdc * rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <span className="font-mono text-[13px] text-ink-3">
      ≈ {symbol}{est} (est.)
    </span>
  )
}
