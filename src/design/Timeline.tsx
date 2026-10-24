interface TimelineNode {
  label: string
  sub?: string
  done?: boolean
  warn?: boolean
}

interface Props { nodes: TimelineNode[] }

export function Timeline({ nodes }: Props) {
  return (
    <ol className="relative mt-3 space-y-0">
      {nodes.map((n, i) => (
        <li key={i} className="relative flex items-start gap-3 pb-5 last:pb-0">
          {/* line */}
          {i < nodes.length - 1 && (
            <div className="absolute left-[7px] top-[18px] bottom-0 w-px bg-line" />
          )}
          {/* dot */}
          <div className={`mt-1 w-[15px] h-[15px] rounded-full flex-shrink-0 border-[1.5px] ${
            n.done ? 'bg-green border-green' :
            n.warn ? 'bg-warn-soft border-warn' :
            'bg-surface border-ink-3'
          }`} />
          <div>
            <p className="text-[14px] text-ink leading-snug">{n.label}</p>
            {n.sub && <p className="text-[12px] text-ink-3 font-mono mt-0.5">{n.sub}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
