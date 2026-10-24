/* oxlint-disable typescript/no-explicit-any -- hono context */
// Hardening for the public API: CORS allow-list, per-client rate limits, body-size cap and admin auth.
import { timingSafeEqual } from 'node:crypto'
import { cors } from 'hono/cors'
import type { Context, MiddlewareHandler } from 'hono'
import { keccak256, toBytes, type Address, type Hex } from 'viem'
import { pub } from './chain'
import { KOLO_ADDRESSES } from '../../src/addresses'
import { PAYEE_REGISTRY_ABI } from '../../src/abi/PayeeRegistry'

export const allowedOrigins = () => (process.env.KOLO_CORS_ORIGINS ?? 'https://kolo-arc.vercel.app').split(',').map(s => s.trim()).filter(Boolean)

/** CORS allow-list. A browser Origin that is not allowed is refused outright on writes; reads just get no CORS headers. */
export const corsGuard: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('origin')
  if (origin && c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS' && !allowedOrigins().includes(origin)) return c.json({ error: 'origin not allowed' }, 403)
  return cors({ origin: o => (allowedOrigins().includes(o) ? o : null), allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['content-type', 'authorization', 'x-kolo-admin-addr', 'x-kolo-admin-ts', 'x-kolo-admin-sig'], maxAge: 600 })(c, next)
}

// ── Rate limiting (fixed window, in memory; one Fly machine) ─────────────────────────────────────
type Win = { n: number; reset: number }
const wins = new Map<string, Win>()
function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now(); const w = wins.get(key)
  if (!w || w.reset <= now) { wins.set(key, { n: 1, reset: now + windowMs }); return true }
  w.n++; return w.n <= max
}
setInterval(() => { const now = Date.now(); for (const [k, w] of wins) if (w.reset <= now) wins.delete(k) }, 60_000).unref?.()
/** Test hook. */
export const resetRateLimits = () => { wins.clear(); stamps.clear() }
const IP_RE = /^[0-9a-fA-F:.]{3,45}$/
/** The real visitor address, trusting only headers the hosting layers set themselves.
 *  Production path: browser → Vercel rewrite → Fly proxy → this server.
 *   - fly-client-ip   : the address Fly's proxy saw connect (Vercel's egress; shared and unstable, never a visitor key by itself).
 *   - x-vercel-forwarded-for / x-real-ip : the visitor address Vercel resolved. Vercel overwrites these, so a visitor cannot forge them through the rewrite.
 *   - x-forwarded-for : client-controlled at its first hop ("<whatever the client sent>, <vercel egress>, <fly>"), so it is NOT used when a platform header exists.
 *  Hitting kolo-arc-api.fly.dev directly bypasses Vercel and can send any x-vercel-* header; that case is bounded by the per-connection
 *  and global ceilings in rateLimit/applyGate. Outside Fly (tests, local dev) there is no fly-client-ip and x-forwarded-for's first hop is used. */
export function clientIp(c: Context): string {
  const conn = c.req.header('fly-client-ip')
  const plat = c.req.header('x-vercel-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip')?.trim()
  if (conn) return plat && IP_RE.test(plat) ? plat : conn
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}
const connIp = (c: Context) => c.req.header('fly-client-ip') ?? 'local'

/** Two keys per request: the connecting address (Vercel's shared egress, so a high ceiling) and the real visitor (see clientIp). */
export const rateLimit: MiddlewareHandler = async (c, next) => {
  if (process.env.KOLO_RATE_LIMIT === 'off') return next()
  const conn = connIp(c), visitor = clientIp(c)
  const rpc = c.req.path.endsWith('/rpc') // read-only JSON-RPC proxy: its own, larger bucket so page loads never trip the write limit
  const write = c.req.method === 'POST' && !rpc
  const ok = rpc
    ? hit('rc:' + conn, 12_000, 60_000) && hit('rv:' + visitor, 900, 60_000)
    : hit('c:' + conn, write ? 120 : 6000, 60_000) && hit('v:' + visitor, write ? 20 : 240, 60_000)
  if (!ok) { c.header('retry-after', '60'); return c.json({ error: 'rate limited', retryAfter: 60 }, 429) }
  return next()
}

// ── Sliding-window gates for the public write endpoints (payee applications, CCTP burn notices) ───
const stamps = new Map<string, number[]>()
/** Returns 0 if the call is allowed (and records it), otherwise the seconds until the oldest hit in the window expires. */
function slide(key: string, max: number, windowMs: number, record = true): number {
  const now = Date.now(); const h = (stamps.get(key) ?? []).filter(t => now - t < windowMs)
  if (h.length >= max) { stamps.set(key, h); return Math.max(1, Math.ceil((h[0]! + windowMs - now) / 1000)) }
  if (record) { h.push(now); stamps.set(key, h) } else stamps.set(key, h)
  return 0
}
setInterval(() => { const now = Date.now(); for (const [k, h] of stamps) { const f = h.filter(t => now - t < 3600_000); if (f.length) stamps.set(k, f); else stamps.delete(k) } }, 60_000).unref?.()
export const APPLY_LIMITS = { perVisitor: 5, attemptsPerVisitor: 30, perConnection: 60, global: 100, windowMs: 3600_000 }
/** Gate for POST /payees/applications. Only *accepted* applications count toward the 5/hour visitor limit (typos and duplicate
 *  attempts do not burn it); a looser attempts cap stops hammering; a per-connection cap bounds forged-header abuse on direct hits;
 *  a global ceiling bounds the queue. One visitor can never use up more than their own 5. Call commit() when the application was accepted. */
export function applyGate(c: Context): { ok: true; commit: () => void } | { ok: false; retryAfter: number; scope: 'visitor' | 'connection' | 'global' } {
  if (process.env.KOLO_RATE_LIMIT === 'off') return { ok: true, commit: () => {} }
  const v = clientIp(c), conn = connIp(c), L = APPLY_LIMITS
  const a = slide('att:' + v, L.attemptsPerVisitor, L.windowMs); if (a) return { ok: false, retryAfter: a, scope: 'visitor' }
  const vr = slide('app:' + v, L.perVisitor, L.windowMs, false); if (vr) return { ok: false, retryAfter: vr, scope: 'visitor' }
  const cr = slide('appc:' + conn, L.perConnection, L.windowMs, false); if (cr) return { ok: false, retryAfter: cr, scope: 'connection' }
  const g = slide('appg', L.global, L.windowMs, false); if (g) return { ok: false, retryAfter: g, scope: 'global' }
  return { ok: true, commit: () => { slide('app:' + v, L.perVisitor, L.windowMs); slide('appc:' + conn, L.perConnection, L.windowMs); slide('appg', L.global, L.windowMs) } }
}
/** Lookups of application status: 30/hour per visitor and 600/hour overall, hits and misses alike (slows guessing of references). */
export function lookupGate(c: Context): number {
  if (process.env.KOLO_RATE_LIMIT === 'off') return 0
  return slide('look:' + clientIp(c), 30, 3600_000) || slide('lookg', 600, 3600_000)
}
/** Separate, small gate for CCTP burn notices (previously shared a bucket with applications). 20/hour per visitor. */
export function burnGate(c: Context): number { return process.env.KOLO_RATE_LIMIT === 'off' ? 0 : slide('burn:' + clientIp(c), 20, 3600_000) }

/** Reject oversized request bodies before they are parsed. */
export const bodyCap = (maxBytes = 8_192): MiddlewareHandler => async (c, next) => {
  if (c.req.method === 'POST') {
    const len = Number(c.req.header('content-length') ?? 0)
    if (len > (c.req.path.endsWith('/rpc') ? 65_536 : maxBytes)) return c.json({ error: 'body too large' }, 413)
  }
  return next()
}

// ── Admin auth ───────────────────────────────────────────────────────────────────────────────────
const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
export const bearerOk = (c: Context, tok: string | undefined) => !!tok && tok.length >= 16 && eq(c.req.header('authorization') ?? '', `Bearer ${tok}`)
export const adminMessage = (addr: string, ts: string, action = 'view payee applications') => `Kolo admin: ${action}\naddress: ${addr.toLowerCase()}\ntimestamp: ${ts}`
const ADMIN_ROLE = ('0x' + '0'.repeat(64)) as Hex
const REGISTRAR = keccak256(toBytes('REGISTRAR_ROLE'))

/** Admin = (a) the secret KOLO_ADMIN_TOKEN as a Bearer token, or (b) a fresh (<5 min) personal_sign over adminMessage by an
 *  address that holds DEFAULT_ADMIN_ROLE or REGISTRAR_ROLE on the PayeeRegistry. Everything else is refused. */
export async function isAdmin(c: Context, action?: string): Promise<boolean> {
  if (bearerOk(c, process.env.KOLO_ADMIN_TOKEN)) return true
  const addr = c.req.header('x-kolo-admin-addr'), ts = c.req.header('x-kolo-admin-ts'), sig = c.req.header('x-kolo-admin-sig')
  if (!addr || !ts || !sig || !/^0x[0-9a-fA-F]{40}$/.test(addr) || !/^0x[0-9a-fA-F]+$/.test(sig) || sig.length > 400) return false
  const age = Math.abs(Date.now() - Number(ts)); if (!Number.isFinite(age) || age > 5 * 60_000) return false
  try {
    const okSig = await pub.verifyMessage({ address: addr as Address, message: adminMessage(addr, ts, action), signature: sig as Hex })
    if (!okSig) return false
    const roles = await Promise.all([ADMIN_ROLE, REGISTRAR].map(role => pub.readContract({ address: KOLO_ADDRESSES.payeeRegistry as Address, abi: PAYEE_REGISTRY_ABI, functionName: 'hasRole', args: [role, addr as Address] })))
    return roles.some(Boolean)
  } catch { return false }
}
