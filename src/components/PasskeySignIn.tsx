import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../design/Button'
import { Chip } from '../design/Chip'
import { notifyViewerChanged } from '../hooks/useViewer'
import { passkeyConfigured, passkeySignIn, loadPasskeySession, clearPasskeySession, type PasskeySession } from '../lib/passkey'

export function PasskeySignIn() {
  const [session, setSession] = useState<PasskeySession | null>(() => loadPasskeySession())
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  if (!passkeyConfigured) {
    return (
      <div className="border border-line rounded-[14px] p-4 flex items-center gap-3" data-testid="passkey-unconfigured">
        <KeyRound size={18} className="text-ink-3" />
        <div className="flex-1">
          <p className="font-semibold text-[14px]">Passkey wallet</p>
          <p className="text-[13px] text-ink-3">Circle Modular Wallets — set VITE_CIRCLE_CLIENT_KEY to enable.</p>
        </div>
        <Chip variant="neutral">needs configuration</Chip>
      </div>
    )
  }
  if (session) {
    return (
      <div className="border border-line rounded-[14px] p-4 flex items-center gap-3">
        <KeyRound size={18} />
        <p className="flex-1 font-mono text-[13px] break-all">{session.username} · {session.address}</p>
        <Button variant="ghost" size="sm" onClick={() => { clearPasskeySession(); setSession(null); notifyViewerChanged() }}>Sign out</Button>
      </div>
    )
  }
  const go = async (register: boolean) => {
    setBusy(true)
    try { setSession(await passkeySignIn(name || 'kolo-user', register)); notifyViewerChanged() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="border border-line rounded-[14px] p-4 flex flex-col gap-2">
      <p className="font-semibold text-[14px] flex items-center gap-2"><KeyRound size={16} />Sign in with a passkey</p>
      <input className="border border-line rounded-[10px] px-3 py-2 text-[14px]" placeholder="Name for your passkey" value={name} onChange={e => setName(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="green" size="sm" disabled={busy} onClick={() => void go(true)}>Create passkey</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void go(false)}>Use existing</Button>
      </div>
    </div>
  )
}
