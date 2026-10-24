// Circle Modular Wallets passkey sign-in. Enabled only when VITE_CIRCLE_CLIENT_KEY and
// VITE_CIRCLE_CLIENT_URL are set (public client key, safe for the browser). Otherwise the UI
// shows "needs configuration" and ConnectKit stays the sign-in path.
import { createPublicClient } from 'viem'
import { NET } from '../network'

const CLIENT_KEY = import.meta.env.VITE_CIRCLE_CLIENT_KEY as string | undefined
const CLIENT_URL = import.meta.env.VITE_CIRCLE_CLIENT_URL as string | undefined
export const passkeyConfigured = Boolean(CLIENT_KEY && CLIENT_URL)
const STORE = 'kolo:passkey'

export type PasskeySession = { address: `0x${string}`; credentialId: string; username: string }

export function loadPasskeySession(): PasskeySession | null {
  try { const v = localStorage.getItem(STORE); return v ? (JSON.parse(v) as PasskeySession) : null } catch { return null }
}
export function clearPasskeySession() { localStorage.removeItem(STORE) }

export async function passkeySignIn(username: string, register: boolean): Promise<PasskeySession> {
  if (!passkeyConfigured) throw new Error('Passkey sign-in needs configuration (VITE_CIRCLE_CLIENT_KEY / VITE_CIRCLE_CLIENT_URL)')
  const mw = await import('@circle-fin/modular-wallets-core')
  const { toWebAuthnAccount } = await import('viem/account-abstraction')
  const credential = await mw.toWebAuthnCredential({
    transport: mw.toPasskeyTransport(CLIENT_URL!, CLIENT_KEY!),
    mode: register ? mw.WebAuthnMode.Register : mw.WebAuthnMode.Login,
    username: register ? username : undefined,
  })
  const client = createPublicClient({ chain: NET.chain, transport: mw.toModularTransport(`${CLIENT_URL}/${NET.modularSlug}`, CLIENT_KEY!) })
  const account = await mw.toCircleSmartAccount({ client, owner: toWebAuthnAccount({ credential }) })
  const session = { address: account.address, credentialId: credential.id, username }
  localStorage.setItem(STORE, JSON.stringify(session))
  return session
}
