import { BadgeCheck, Landmark, Building2, HeartPulse, ChevronRight } from 'lucide-react'
import { Chip } from './Chip'
import { Link } from 'react-router-dom'

interface Props {
  id: number
  name: string
  kind: 0 | 1 | 2   // 0=School 1=Vendor 2=Hospital
  status: number     // 2=Verified
  wallet: string
  verifiedAt?: number
  selected?: boolean
  onClick?: () => void
  href?: string
}

const KIND_ICONS = [Landmark, Building2, HeartPulse]
const KIND_LABELS = ['School', 'Vendor', 'Hospital']

function shortAddr(a: string) {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

export function PayeeRow({ id, name, kind, status, wallet, verifiedAt, selected, onClick, href }: Props) {
  const KindIcon = KIND_ICONS[kind] ?? Building2
  const isVerified = status === 2

  const chip = isVerified
    ? <Chip variant="green"><BadgeCheck size={14} className="inline" />Verified</Chip>
    : <Chip variant={status === 3 ? 'warn' : 'neutral'}>{status === 1 ? 'Awaiting verification' : status === 3 ? 'Revoked' : 'Unregistered'}</Chip>

  const inner = (
    <div className={`flex items-center gap-3.5 border rounded-[14px] px-4 py-3.5 bg-surface cursor-pointer transition-colors ${
      selected ? 'border-green bg-[#F3F9F6] ring-1 ring-green' : 'border-line hover:border-ink-2'
    }`}>
      <div className="w-10 h-10 rounded-[10px] bg-paper border border-line grid place-items-center flex-shrink-0">
        <KindIcon size={20} strokeWidth={2} className="text-ink-2" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[15px] text-ink truncate">{name}</p>
        <p className="font-mono text-[12px] text-ink-3 mt-0.5 truncate">
          {KIND_LABELS[kind]} #{String(id).padStart(3, '0')}
          {verifiedAt ? ` · verified ${new Date(verifiedAt * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
          {' · '}{shortAddr(wallet)}
        </p>
        <div className="sm:hidden mt-1.5">{chip}</div>
      </div>
      <div className="hidden sm:block">{chip}</div>
      {href && <ChevronRight size={18} strokeWidth={2} className="text-ink-3" />}
    </div>
  )

  if (onClick) return <button type="button" role="radio" aria-checked={!!selected} onClick={onClick} className="block w-full text-left focus-visible:ring-2 focus-visible:ring-green rounded-[14px]">{inner}</button>
  if (href) return <Link to={href} className="block no-underline">{inner}</Link>
  return inner
}
