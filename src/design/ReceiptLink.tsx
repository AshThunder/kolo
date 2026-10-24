import { ExternalLink } from 'lucide-react'
import { BRAND } from '../brand'

interface Props {
  txHash: string
  logIndex?: number
}

function short(h: string) {
  return h.length > 10 ? `${h.slice(0, 6)}…${h.slice(-2)}` : h
}

export function ReceiptLink({ txHash, logIndex }: Props) {
  const url = `${BRAND.explorerBase}/tx/${txHash}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[13px] text-ink-3 hover:text-green transition-colors"
    >
      {short(txHash)}{logIndex !== undefined ? `-${logIndex}` : ''}
      <ExternalLink size={14} strokeWidth={2} />
    </a>
  )
}
