import { clsx } from 'clsx'

interface Props { className?: string; rows?: number }

export function SkeletonBar({ className }: { className?: string }) {
  return <div className={clsx('skeleton-bar h-4 w-full rounded', className)} />
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-line">
      <div className="skeleton-bar w-7 h-7 rounded-full flex-shrink-0" />
      <div className="flex-1 flex flex-col gap-1.5">
        <SkeletonBar className="w-1/3" />
        <SkeletonBar className="w-1/5 h-3" />
      </div>
      <SkeletonBar className="w-16 h-4" />
    </div>
  )
}

export function Skeleton({ rows = 3 }: Props) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
  )
}
