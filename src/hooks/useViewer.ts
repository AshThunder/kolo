import { useCallback, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { loadPasskeySession } from '../lib/passkey'

const LOOKUP = 'kolo:lookup'
const EVENT = 'kolo:viewer'
export const notifyViewerChanged = () => window.dispatchEvent(new Event(EVENT))
const read = () => { try { const v = localStorage.getItem(LOOKUP); return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined } catch { return undefined } }

/**
 * Whose data are we showing? Connected wallet first, then this device's passkey session,
 * then an address someone pasted in. Everything public never depends on this.
 */
export function useViewer() {
  const { address } = useAccount()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const f = () => setTick(t => t + 1)
    window.addEventListener(EVENT, f); window.addEventListener('storage', f)
    return () => { window.removeEventListener(EVENT, f); window.removeEventListener('storage', f) }
  }, [])
  void tick
  const passkey = loadPasskeySession()?.address
  const lookup = read()
  const setLookup = useCallback((a?: string) => { if (a) localStorage.setItem(LOOKUP, a); else localStorage.removeItem(LOOKUP); notifyViewerChanged() }, [])
  const viewer = address ?? passkey ?? lookup
  const source = address ? 'wallet' : passkey ? 'passkey' : lookup ? 'address' : undefined
  return { viewer, source, setLookup, connected: !!address }
}
