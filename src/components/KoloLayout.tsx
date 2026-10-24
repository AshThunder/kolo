import { type ReactNode } from 'react'
import { KoloNav } from './KoloNav'
import { NetworkBadge } from '../design/NetworkBadge'
import { KoloFooter } from './KoloFooter'

interface Props {
  children: ReactNode
  isPublic?: boolean
  onContribute?: () => void
  fullBleed?: boolean
  /** Flows with their own header (create wizard) omit the global nav. */
  bare?: boolean
}

export function KoloLayout({ children, isPublic, onContribute, fullBleed, bare }: Props) {
  return (
    <div className="min-h-screen bg-paper">
      {!bare && (
        <div className="px-5 sm:px-10 max-w-[1160px] mx-auto">
          <KoloNav isPublic={isPublic} onContribute={onContribute} />
        </div>
      )}
      {bare && <div className="fixed top-3 right-3 z-30 hidden sm:block"><NetworkBadge /></div>}
      <main className={fullBleed ? '' : 'px-5 sm:px-10 max-w-[1160px] mx-auto'}>
        {children}
        {!bare && !fullBleed && <KoloFooter />}
      </main>
    </div>
  )
}
