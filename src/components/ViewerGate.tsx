import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { Button } from '../design/Button'
import { PasskeySignIn } from './PasskeySignIn'
import { useViewer } from '../hooks/useViewer'

/** Shown when a personal page has no wallet, passkey or saved address. Says why, and offers three ways back in. */
export function ViewerGate({ what }: { what: string }) {
  const { setLookup } = useViewer()
  const [v, setV] = useState('')
  const ok = /^0x[0-9a-fA-F]{40}$/.test(v.trim())
  return (
    <div className="max-w-[560px] mx-auto py-14" data-testid="viewer-gate">
      <span className="eyebrow">Only you see this</span>
      <h1 className="font-display text-[32px] font-medium leading-tight mt-2">We don’t know whose {what} to show.</h1>
      <p className="text-ink-2 mt-3">{what[0].toUpperCase() + what.slice(1)} belong to a wallet. A browser only knows your wallet if you connect it here, or signed in with a passkey on this same device. Passkeys never leave the device that made them, so a phone and a laptop each need their own sign-in. Everything public (pots, receipts, verified payees) is visible without signing in.</p>
      <div className="mt-6 space-y-4">
        <div className="border border-line bg-surface rounded-[14px] p-4 flex items-center justify-between gap-3">
          <div><p className="font-semibold text-[14px]">Connect a wallet</p><p className="text-[13px] text-ink-3">The same wallet shows the same data on every device.</p></div>
          <ConnectKitButton.Custom>{({ show }) => <Button variant="green" size="sm" onClick={show} data-testid="signin-mypots">Connect</Button>}</ConnectKitButton.Custom>
        </div>
        <PasskeySignIn />
        <form className="border border-line bg-surface rounded-[14px] p-4" onSubmit={e => { e.preventDefault(); if (ok) setLookup(v.trim()) }}>
          <label htmlFor="lookup" className="font-semibold text-[14px]">Look up an address</label>
          <p className="text-[13px] text-ink-3">View-only. Paste the 0x address you used.</p>
          <div className="flex gap-2 mt-2">
            <input id="lookup" value={v} onChange={e => setV(e.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" className="flex-1 min-w-0 h-11 rounded-[10px] border border-line bg-paper px-3 font-mono text-[13px]" aria-invalid={!!v && !ok} />
            <Button variant="ink" size="sm" disabled={!ok} type="submit">Show</Button>
          </div>
          {v && !ok && <p className="text-[12px] text-danger mt-1.5">That doesn’t look like a 0x address (42 characters).</p>}
        </form>
      </div>
    </div>
  )
}
