interface Step { label: string }
interface Props {
  steps: Step[]
  current: number  // 0-based
  onSelect?: (i: number) => void
}

export function Stepper({ steps, current, onSelect }: Props) {
  return (
    <ol className="list-none p-0 m-0" style={{ counterReset: 's' }}>
      {steps.map((s, i) => (
        <li
          key={i}
          className={`flex gap-3 py-3 border-b border-line text-[14px] ${
            i < current ? 'text-ink-2' :
            i === current ? 'text-ink font-semibold' :
            'text-ink-3'
          }`}
        >
          <button type="button" disabled={!onSelect || i === current} onClick={() => onSelect?.(i)} className="flex gap-3 text-left bg-transparent p-0 enabled:cursor-pointer disabled:cursor-default" aria-current={i === current ? 'step' : undefined}>
          <span className={`font-mono text-[12px] w-6 pt-0.5 flex-shrink-0 ${i === current ? 'text-green' : ''}`}>
            {String(i + 1).padStart(2, '0')}
          </span>
          {s.label}
          </button>
        </li>
      ))}
    </ol>
  )
}
