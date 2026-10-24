import { clearPasskeySession } from './passkey'
import { notifyViewerChanged } from '../hooks/useViewer'

/** Device-local, per-user state. Nothing here is a secret: addresses, a passkey id, a half-filled form. */
const USER_KEYS = ['kolo:lookup', 'kolo:create-draft', 'kolo:application']

/** Remove everything Kolo remembers about the person on this browser (the wallet itself is disconnected by the caller). */
export function clearLocalSession() {
  clearPasskeySession()
  for (const k of USER_KEYS) { try { localStorage.removeItem(k) } catch { /* storage blocked */ } }
  try { sessionStorage.clear() } catch { /* storage blocked */ }
  notifyViewerChanged()
}
