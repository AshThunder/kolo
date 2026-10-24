import { type ReactNode } from 'react'

interface Props {
  illustration?: string
  title: string
  body?: string
  action?: ReactNode
}

export function EmptyState({ illustration, title, body, action }: Props) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-4 gap-4">
      {illustration && <img src={illustration} alt="" className="w-32 opacity-80" />}
      <h3 className="font-display text-[22px] font-medium text-ink">{title}</h3>
      {body && <p className="text-ink-2 text-[15px] max-w-sm">{body}</p>}
      {action}
    </div>
  )
}
