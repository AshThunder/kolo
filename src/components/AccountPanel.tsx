import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDisconnect } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, Wallet, Eye, LogOut } from 'lucide-react'
import { Button } from '../design/Button'
import { useViewer } from '../hooks/useViewer'
import { loadPasskeySession } from '../lib/passkey'
import { clearLocalSession } from '../lib/session'

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** Who is signed in on this device, with a confirmed Log out. Used in the header menu and the mobile sheet. */
export function AccountPanel({ onNavigate, onDone }: { onNavigate?: () => void; onDone: () => void }) {
  const { viewer, source } = useViewer()
  const { disconnectAsync } = useDisconnect()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const passkey = loadPasskeySession()
  if (!viewer) return null

  const kind = source === 'wallet' ? 'Wallet connected' : source === 'passkey' ? 'Signed in with a passkey' : 'Viewing an address (read-only)'
  const Icon = source === 'wallet' ? Wallet : source === 'passkey' ? KeyRound : Eye

  const logout = async () => {
    setBusy(true)
    try { await disconnectAsync() } catch { /* nothing connected */ }
    clearLocalSession()
    qc.clear()
    setBusy(false); setConfirm(false); onDone()
  }

  return (
    <div data-testid="account-panel">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-full bg-green-soft text-green-deep shrink-0"><Icon size={16} /></span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.06em] uppercase text-ink-3">{kind}</p>
          {source === 'passkey' && passkey?.username && <p className="font-semibold text-[15px] truncate" data-testid="account-name">{passkey.username}</p>}
          <p className="font-mono text-[13px] text-ink-2 break-all" data-testid="account-address" title={viewer}>{shortAddr(viewer)}</p>
        </div>
      </div>
      <ul className="mt-3 border-t border-line pt-1 text-[14px] font-medium">
        <li><Link to="/my-pots" onClick={onNavigate} className="block py-2 hover:text-green">My pots</Link></li>
        <li><Link to="/wallet" onClick={onNavigate} className="block py-2 hover:text-green">Wallet &amp; balance</Link></li>
      </ul>
      <div className="border-t border-line pt-3">
        {!confirm ? (
          <button type="button" onClick={() => setConfirm(true)} data-testid="logout-btn" className="inline-flex items-center gap-2 h-10 px-3 -ml-3 rounded-[10px] text-[14px] font-semibold text-danger hover:bg-surface">
            <LogOut size={16} />Log out
          </button>
        ) : (
          <div role="alertdialog" aria-label="Confirm log out" data-testid="logout-confirm">
            <p className="text-[13px] text-ink-2 leading-snug">Log out on this device? This disconnects your wallet and removes the passkey session, saved lookups and any unfinished pot draft from this browser. Your pots and funds stay on Arc.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button>
              <Button variant="ink" size="sm" onClick={() => { void logout() }} disabled={busy} data-testid="logout-confirm-btn">{busy ? 'Logging out…' : 'Log out'}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
