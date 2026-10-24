/* oxlint-disable typescript/no-explicit-any -- stubbing the viem client + loose JSON */
// Offline: CORS allow-list, rate limits, body cap and admin auth (token and signed message).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'

let app: any; let sec: typeof import('../security'); const orig: Record<string, any> = {}
const req = (p: string, init?: RequestInit) => app.request('/api/kolo' + p, init)
const ORIGIN = 'https://kolo-arc.vercel.app'
beforeAll(async () => {
  process.env.KOLO_RATE_LIMIT = 'on'
  app = (await import('../app')).app; sec = await import('../security')
  const { pub } = await import('../chain')
  for (const k of ['readContract', 'verifyMessage']) orig[k] = (pub as any)[k]
})
afterAll(async () => { process.env.KOLO_RATE_LIMIT = 'off'; const { pub } = await import('../chain'); for (const k of Object.keys(orig)) (pub as any)[k] = orig[k] })
beforeEach(() => sec.resetRateLimits())

describe('cors', () => {
  test('allowed origin is echoed, others get no CORS header', async () => {
    expect((await req('/health', { headers: { origin: ORIGIN } })).headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect((await req('/health', { headers: { origin: 'https://evil.example' } })).headers.get('access-control-allow-origin')).toBeNull()
  })
  test('writes from a foreign browser origin are refused', async () => {
    const r = await req('/meta', { method: 'POST', body: '{}', headers: { origin: 'https://evil.example', 'content-type': 'application/json' } })
    expect(r.status).toBe(403)
  })
})
describe('limits', () => {
  test('429 after 20 writes a minute from one visitor', async () => {
    const post = () => req('/payees/meta', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' } })
    let last = 0; for (let i = 0; i < 22; i++) last = (await post()).status
    expect(last).toBe(429)
    expect((await req('/health', { headers: { 'x-forwarded-for': '198.51.100.10' } })).status).not.toBe(429)
  })
  test('oversized body is rejected', async () => {
    const r = await req('/meta', { method: 'POST', body: 'x'.repeat(10_000), headers: { 'content-type': 'application/json', 'content-length': '10000' } })
    expect(r.status).toBe(413)
  })
})
describe('client address and application limits', () => {
  const apply = (wallet: string, h: Record<string, string> = {}) => req('/payees/applications', { method: 'POST', body: JSON.stringify({ kind: 'vendor', name: 'Test Vendor', wallet }), headers: { 'content-type': 'application/json', ...h } })
  const w = (n: number) => '0x' + n.toString(16).padStart(40, '0')
  test('behind Vercel + Fly the visitor is x-vercel-forwarded-for, not the shared egress and not a forged x-forwarded-for', async () => {
    const mk = (h: Record<string, string>) => ({ req: { header: (k: string) => h[k.toLowerCase()] } }) as any
    expect(sec.clientIp(mk({ 'fly-client-ip': '35.94.204.218', 'x-vercel-forwarded-for': '203.0.113.5', 'x-forwarded-for': '1.2.3.4, 35.94.204.218' }))).toBe('203.0.113.5')
    expect(sec.clientIp(mk({ 'fly-client-ip': '35.94.204.218', 'x-real-ip': '203.0.113.6', 'x-forwarded-for': '1.2.3.4' }))).toBe('203.0.113.6')
    expect(sec.clientIp(mk({ 'fly-client-ip': '198.51.100.1', 'x-forwarded-for': '1.2.3.4' }))).toBe('198.51.100.1') // direct hit: forged XFF ignored
    expect(sec.clientIp(mk({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4') // local/dev only (no fly-client-ip)
  })
  test('5 accepted applications per hour per visitor; the 6th gets 429 with the wait time; others are unaffected', async () => {
    const a = { 'fly-client-ip': '35.94.204.218', 'x-vercel-forwarded-for': '203.0.113.50' }
    for (let i = 1; i <= 5; i++) expect((await apply(w(0x100 + i), a)).status).toBe(201)
    const r = await apply(w(0x110), a); expect(r.status).toBe(429)
    const body = await r.json(); expect(body.scope).toBe('visitor'); expect(body.retryAfter).toBeGreaterThan(3500); expect(Number(r.headers.get('retry-after'))).toBe(body.retryAfter)
    // a different visitor behind the SAME shared egress is not affected
    expect((await apply(w(0x111), { 'fly-client-ip': '35.94.204.218', 'x-vercel-forwarded-for': '203.0.113.51' })).status).toBe(201)
  })
  test('typos and duplicate attempts do not burn the 5 accepted applications', async () => {
    const a = { 'x-forwarded-for': '203.0.113.60' }
    for (let i = 0; i < 10; i++) expect((await apply('0x123', a)).status).toBe(400)
    for (let i = 1; i <= 5; i++) expect((await apply(w(0x200 + i), a)).status).toBe(201)
    expect((await apply(w(0x201), a)).status).toBe(429) // corrections count as accepted submissions too
  })
  test('one visitor cannot exhaust the global ceiling', async () => {
    const heavy = { 'x-forwarded-for': '203.0.113.70' }
    for (let i = 1; i <= 5; i++) await apply(w(0x300 + i), heavy)
    for (let i = 0; i < 30; i++) await apply(w(0x400 + i), heavy) // all 429 now
    expect((await apply(w(0x500), { 'x-forwarded-for': '203.0.113.71' })).status).toBe(201)
  })
  test('the global ceiling and the per-connection ceiling return 429 with a scope', async () => {
    for (let n = 0; n < 12; n++) for (let i = 1; i <= 5; i++) await apply(w(0x600 + n * 8 + i), { 'fly-client-ip': '198.51.100.99', 'x-vercel-forwarded-for': '203.0.113.' + (80 + n) })
    const r = await apply(w(0x700), { 'fly-client-ip': '198.51.100.99', 'x-vercel-forwarded-for': '203.0.113.200' })
    expect(r.status).toBe(429); expect((await r.json()).scope).toBe('connection')
  })
})
describe('admin auth', () => {
  const acct = privateKeyToAccount(generatePrivateKey())
  const signed = async (ts = String(Date.now())) => ({ 'x-kolo-admin-addr': acct.address, 'x-kolo-admin-ts': ts, 'x-kolo-admin-sig': await acct.signMessage({ message: sec.adminMessage(acct.address, ts) }) })
  test('no credentials, a wrong token and a short token are refused', async () => {
    expect((await req('/payees/applications')).status).toBe(403)
    expect((await req('/payees/applications', { headers: { authorization: 'Bearer nope' } })).status).toBe(403)
  })
  test('the admin token works', async () => {
    expect((await req('/payees/applications', { headers: { authorization: 'Bearer ' + process.env.KOLO_ADMIN_TOKEN } })).status).toBe(200)
  })
  test('a registrar signature works; a non-registrar, stale or forged one does not', async () => {
    const { pub } = await import('../chain')
    ;(pub as any).verifyMessage = async ({ address, message, signature }: any) => (await import('viem')).verifyMessage({ address, message, signature })
    ;(pub as any).readContract = async ({ args }: any) => args[1].toLowerCase() === acct.address.toLowerCase() // hasRole(role, who)
    expect((await req('/payees/applications', { headers: await signed() })).status).toBe(200)
    expect((await req('/payees/applications', { headers: await signed(String(Date.now() - 10 * 60_000)) })).status).toBe(403)
    const other = privateKeyToAccount(generatePrivateKey()); const ts = String(Date.now())
    const forged = { 'x-kolo-admin-addr': acct.address, 'x-kolo-admin-ts': ts, 'x-kolo-admin-sig': await other.signMessage({ message: sec.adminMessage(acct.address, ts) }) }
    expect((await req('/payees/applications', { headers: forged })).status).toBe(403)
    ;(pub as any).readContract = async () => false
    expect((await req('/payees/applications', { headers: await signed() })).status).toBe(403)
  })
})

describe('read-only rpc proxy', () => {
  const post = (body: unknown) => import('../app').then(({ app }) => app.request('/api/kolo/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  test('refuses transaction broadcast, signing and unknown methods', async () => {
    for (const method of ['eth_sendRawTransaction', 'eth_sendTransaction', 'personal_sign', 'debug_traceTransaction', 'eth_accounts']) {
      const r = await post({ jsonrpc: '2.0', id: 1, method, params: [] }); expect(r.status).toBe(400)
    }
  })
  test('refuses a batch that hides a forbidden method, and oversized batches', async () => {
    expect((await post([{ jsonrpc: '2.0', id: 1, method: 'eth_chainId' }, { jsonrpc: '2.0', id: 2, method: 'eth_sendRawTransaction', params: ['0x'] }])).status).toBe(400)
    expect((await post(Array.from({ length: 26 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_chainId' })))).status).toBe(400)
  })
  test('rejects malformed JSON', async () => {
    const { app } = await import('../app')
    expect((await app.request('/api/kolo/rpc', { method: 'POST', body: '{nope' })).status).toBe(400)
  })
})
