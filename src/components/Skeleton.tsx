import { cn } from '../lib/utils'

interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton', className)}
      style={style}
      aria-hidden="true"
    />
  )
}

export function ItemCardSkeleton() {
  return (
    <div className="block border-b py-6" style={{ borderColor: 'var(--rule)' }} aria-hidden="true">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full max-w-xs" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex-shrink-0 space-y-1">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-8 ml-auto" />
        </div>
      </div>
    </div>
  )
}
