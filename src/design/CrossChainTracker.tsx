type StepStatus = 'done' | 'active' | 'pending'

interface TrackerStep {
  label: string
  sub?: string
  status: StepStatus
}

interface Props { steps: TrackerStep[] }

export function CrossChainTracker({ steps }: Props) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 border-2 flex items-center justify-center ${
            s.status === 'done' ? 'bg-green border-green' :
            s.status === 'active' ? 'border-green bg-surface animate-pulse' :
            'border-line bg-surface'
          }`}>
            {s.status === 'done' && <span className="text-surface text-[10px] font-bold">✓</span>}
          </div>
          <div>
            <p className={`text-[14px] ${s.status === 'pending' ? 'text-ink-3' : 'text-ink'}`}>{s.label}</p>
            {s.sub && <p className="text-[12px] font-mono text-ink-3 mt-0.5">{s.sub}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
