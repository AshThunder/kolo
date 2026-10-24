import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(20,23,43,0.42)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${maxWidth} bg-surface rounded-lg shadow-card`}
        style={{ padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          data-testid="modal-close"
          className="absolute top-[18px] right-[18px] w-9 h-9 border border-line rounded-[10px] grid place-items-center hover:bg-paper transition-colors"
        >
          <X size={18} strokeWidth={2} />
        </button>
        {title && <p className="eyebrow mb-1">{title}</p>}
        {children}
      </div>
    </div>,
    document.body,
  )
}
