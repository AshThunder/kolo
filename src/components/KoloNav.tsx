import { Link } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { Button } from '../design/Button'
import { Wallet, Menu, X, Check, ChevronDown, KeyRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AccountPanel, shortAddr } from './AccountPanel'
import { useViewer } from '../hooks/useViewer'
import { loadPasskeySession } from '../lib/passkey'
import { NetworkBadge } from '../design/NetworkBadge'
import { useIsRegistrar } from '../hooks/useRegistrar'

const LINKS: [string, string][] = [['/how-it-works', 'How it works'], ['/payees', 'Verified payees'], ['/payees/status', 'Application status'], ['/my-pots', 'My pots']]
const REGISTRAR_LINK: [string, string] = ['/admin', 'Registrar']

interface Props { isPublic?: boolean; onContribute?: () => void }

export function KoloNav({ isPublic, onContribute }: Props) {
  const { viewer, source } = useViewer()
  const { isRegistrar } = useIsRegistrar() // the Registrar link is only for the registrar wallet (the /admin URL still works but shows a gate)
  const links = isRegistrar ? [...LINKS, REGISTRAR_LINK] : LINKS
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [menu])
  useEffect(() => { if (!signedOut) return; const t = setTimeout(() => setSignedOut(false), 5000); return () => clearTimeout(t) }, [signedOut])
  const done = () => { setMenu(false); setOpen(false); setSignedOut(true); toast.success('Signed out', { description: 'This browser no longer holds your wallet connection or passkey session.' }) }
  const label = source === 'passkey' ? (loadPasskeySession()?.username || shortAddr(viewer ?? '')) : source === 'address' ? `Viewing ${shortAddr(viewer ?? '')}` : shortAddr(viewer ?? '')

  return (
    <nav className="relative flex items-center justify-between h-[72px] border-b border-line px-0">
      <div className="flex items-center gap-3">
        <Link to="/">
          <img src="/assets/brand/kolo-wordmark-a.svg" width={125} height={40} className="h-8 w-[100px] sm:h-10 sm:w-[125px] max-w-none" alt="Kolo" data-testid="kolo-logo" />
        </Link>
        <NetworkBadge className="hidden sm:inline-flex" />
      </div>

      {isPublic ? (
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-mono bg-[#ECEAF0] text-ink px-3 h-7 rounded-full">
            Public view<span className="hidden sm:inline">&nbsp;· read-only</span>
          </span>
          {onContribute && (
            <Button variant="green" size="sm" onClick={onContribute} data-testid="public-contribute">
              Contribute
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="hidden sm:flex items-center gap-7 text-ink-2 font-medium text-[15px]">
            {links.map(([to, label]) => <Link key={to} to={to} className="hover:text-ink">{label}</Link>)}
          </div>
          <div className="flex items-center gap-2">
            {signedOut && !viewer && (
              <span role="status" data-testid="signed-out" className="hidden sm:inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-green-soft text-green-deep text-[13px] font-medium"><Check size={14} />Signed out</span>
            )}
            {viewer ? (
              <div className="relative" ref={menuRef}>
                <button type="button" onClick={() => setMenu(m => !m)} aria-haspopup="dialog" aria-expanded={menu} data-testid="wallet-btn"
                  className="h-[44px] px-3 sm:px-4 max-w-[170px] border border-line rounded-[12px] font-mono text-[14px] hover:border-ink transition-colors inline-flex items-center gap-2">
                  {source === 'passkey' && <KeyRound size={14} className="shrink-0" />}
                  <span className="truncate">{label}</span><ChevronDown size={14} className="shrink-0 text-ink-3" />
                </button>
                {menu && (
                  <div className="absolute right-0 top-[52px] z-40 w-[min(320px,calc(100vw-40px))] rounded-[16px] border border-line bg-surface p-4 shadow-[0_12px_28px_rgba(20,23,43,0.10)]" data-testid="account-menu">
                    <AccountPanel onNavigate={() => setMenu(false)} onDone={done} />
                  </div>
                )}
              </div>
            ) : (
              <ConnectKitButton.Custom>
                {({ show }) => (
                  <Button variant="ghost" onClick={show} data-testid="signin-btn">
                    <Wallet size={18} strokeWidth={2} />Sign in
                  </Button>
                )}
              </ConnectKitButton.Custom>
            )}
            <button type="button" className="sm:hidden w-11 h-11 grid place-items-center rounded-[12px] border border-line" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(o => !o)} data-testid="nav-menu">
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
          {open && (
            <div className="sm:hidden absolute left-0 right-0 top-[72px] z-30 bg-paper border-b border-line shadow-[0_12px_24px_rgba(20,23,43,0.08)]" data-testid="nav-sheet">
              <ul className="px-5 py-2">
                {links.map(([to, label]) => <li key={to}><Link to={to} onClick={() => setOpen(false)} className="block py-3.5 border-b border-line last:border-0 text-[16px] font-medium">{label}</Link></li>)}
                <li><Link to="/create" onClick={() => setOpen(false)} className="block py-3.5 border-b border-line text-[16px] font-semibold text-green">Start a pot</Link></li>
                {viewer && <li className="py-4 border-b border-line"><AccountPanel onNavigate={() => setOpen(false)} onDone={done} /></li>}
                {signedOut && !viewer && <li role="status" className="py-3 flex items-center gap-1.5 text-[14px] text-green-deep font-medium"><Check size={14} />Signed out on this device</li>}
                <li className="py-3"><NetworkBadge /></li>
              </ul>
            </div>
          )}
        </>
      )}
    </nav>
  )
}
