interface Props {
  paidPct: number   // 0-100
  pledgedPct?: number  // additional pledged (0-100)
  label?: string
}

export function PotFill({ paidPct, pledgedPct = 0, label }: Props) {
  const safeP = Math.min(100, Math.max(0, paidPct))
  const safeQ = Math.min(100 - safeP, Math.max(0, pledgedPct))
  return (
    <div className="relative h-[14px] rounded-[7px] bar-ruled overflow-hidden my-4">
      <div
        className="absolute inset-y-0 left-0 bg-green rounded-[7px] pot-fill-animate"
        style={{ right: `${100 - safeP}%` }}
      />
      {safeQ > 0 && (
        <div
          className="absolute inset-y-0 pledge-hatch"
          style={{ left: `${safeP}%`, right: `${100 - safeP - safeQ}%` }}
        />
      )}
      {label && <span className="sr-only">{label}</span>}
    </div>
  )
}
