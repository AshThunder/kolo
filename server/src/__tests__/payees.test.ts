/* oxlint-disable typescript/no-explicit-any -- stubbing the viem client + loose JSON */
// Offline: payee names (hash-gated), applications queue, and the HTTP routes. The registry read is stubbed.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { keccak256, toBytes } from 'viem'


const hashOf = (s: string) => keccak256(toBytes(s))
const WALLET = '0x2222222222222222222222222222222222222222'
let app: any
const orig: Record<string, any> = {}
const j = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const req = (p: string, init?: RequestInit) => app.request('/api/kolo' + p, init)

beforeAll(async () => {
  const { pub } = await import('../chain')
  for (const k of ['readContract', 'multicall', 'getBlockNumber']) orig[k] = (pub as any)[k]
  // payeeCount = 2; payeeInfo tuples: [kind, status, wallet, nameHash, docHash, verifier, verifiedAt, registeredAt]
  ;(pub as any).readContract = async () => 2n
  ;(pub as any).getBlockNumber = async () => 1n // log scans are no-ops offline
  ;(pub as any).multicall = async () => [
    [0, 2, WALLET, hashOf('Northfield Academy'), hashOf('docs'), WALLET, 1n, 1n],
    [1, 1, WALLET, hashOf('Acme Venues Ltd'), '0x' + '0'.repeat(64), WALLET, 0n, 1n],
  ]
  app = (await import('../app')).app
})

afterAll(async () => { Object.assign((await import('../chain')).pub as any, orig) })

describe('payee names', () => {
  test('accepts a name only when keccak256(name) is a registry nameHash', async () => {
    const ok = await req('/payees/meta', j({ name: 'Northfield Academy' })); expect(ok.status).toBe(200)
    expect((await ok.json()).nameHash).toBe(hashOf('Northfield Academy'))
    const forged = await req('/payees/meta', j({ name: 'Northfield Academy ' + 'x' })); expect(forged.status).toBe(400)
    expect((await forged.json()).error).toContain('nameHash')
  })
  test('trims, and rejects empty or oversize names', async () => {
    expect((await req('/payees/meta', j({ name: '  Acme Venues Ltd  ' }))).status).toBe(200)
    expect((await req('/payees/meta', j({ name: '   ' }))).status).toBe(400)
    expect((await req('/payees/meta', j({ name: 'a'.repeat(121) }))).status).toBe(400)
    expect((await req('/payees/meta', j({}))).status).toBe(400)
  })
  test('published names are served keyed by hash', async () => {
    const m = await (await req('/payees')).json()
    expect(m[hashOf('Northfield Academy')]).toBe('Northfield Academy'); expect(m[hashOf('Acme Venues Ltd')]).toBe('Acme Venues Ltd')
  })
})

describe('applications queue', () => {
  const good = { kind: 'school', name: 'Lakeside School', wallet: WALLET, country: 'Kenya', regNo: 'SECRET-123' }
  test('stores an application and exposes the registration number only to the registrar', async () => {
    const r = await req('/payees/applications', j(good)); expect(r.status).toBe(201)
    const body = await r.json(); expect(body.application.status).toBe('pending'); expect(JSON.stringify(body)).not.toContain('SECRET-123')
    expect((await req('/payees/applications')).status).toBe(403) // admin-only
    const list = await (await req('/payees/applications', { headers: { authorization: 'Bearer ' + process.env.KOLO_ADMIN_TOKEN } })).json()
    const mine = list.find((x: any) => x.wallet === WALLET); expect(mine.name).toBe('Lakeside School'); expect(mine.regNo).toBe('SECRET-123') // registrar-only: needed to hash the registration number on-chain
  })
  test('rejects a bad kind, name or wallet', async () => {
    const post = (b: any) => req('/payees/applications', { ...j(b), headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.' + Math.floor(Math.random() * 250) } })
    expect((await post({ ...good, kind: 'bank' })).status).toBe(400)
    expect((await post({ ...good, name: '' })).status).toBe(400)
    expect((await post({ ...good, wallet: '0x123' })).status).toBe(400)
  })
  test('re-submitting a pending wallet corrects the application in place and keeps its reference', async () => {
    const r = await req('/payees/applications', j({ ...good, kind: 'vendor', name: 'Lakeside Supplies', regNo: undefined }))
    expect(r.status).toBe(200)
    const b = await r.json(); expect(b.updated).toBe(true); expect(b.application.reference).toMatch(/^KOLO-APP-\d+-[A-Z0-9]{6}$/); expect(b.application.kind).toBe('vendor')
    const list = await (await req('/payees/applications', { headers: { authorization: 'Bearer ' + process.env.KOLO_ADMIN_TOKEN } })).json()
    expect(list.filter((x: any) => x.wallet === WALLET).length).toBe(1); expect(list.find((x: any) => x.wallet === WALLET).name).toBe('Lakeside Supplies')
  })
  test('a new wallet gets the next reference', async () => {
    const b = await (await req('/payees/applications', j({ ...good, wallet: '0x3333333333333333333333333333333333333333' }))).json()
    expect(b.application.reference).toMatch(/^KOLO-APP-\d+-[A-Z0-9]{6}$/); expect(b.updated).toBe(false)
  })
})

describe('payee activity route', () => {
  test('rejects a bad id', async () => { expect((await req('/payees/abc/activity')).status).toBe(400) })
})

describe('public application status', () => {
  const ADMIN = { authorization: 'Bearer ' + process.env.KOLO_ADMIN_TOKEN, 'content-type': 'application/json' }
  const W = (n: number) => '0x' + n.toString(16).padStart(40, '0')
  const apply = async (wallet: string, extra: any = {}) => (await (await req('/payees/applications', j({ kind: 'vendor', name: 'Status Test ' + wallet.slice(-3), wallet, country: 'Ghana', regNo: 'REG-PRIVATE-9', ...extra }))).json()).application
  const status = async (q: string) => { const r = await req('/payees/status?' + q); return { r, b: await r.json() } }
  let setRows: (rows: any[]) => Promise<void>
  beforeAll(async () => {
    const { pub } = await import('../chain'); const { resetRegistryCache } = await import('../payees')
    setRows = async rows => { (pub as any).readContract = async () => BigInt(rows.length); (pub as any).multicall = async () => rows; resetRegistryCache() }
  })
  test('looks up by reference or wallet and returns only non-sensitive fields', async () => {
    await setRows([])
    const a = await apply(W(0xa01))
    for (const q of ['ref=' + a.reference, 'ref=' + a.reference.toLowerCase(), 'wallet=' + W(0xa01), 'wallet=' + W(0xa01).toUpperCase().replace('0X', '0x')]) {
      const { r, b } = await status(q); expect(r.status).toBe(200); expect(b.found).toBe(true)
      expect(b.reference).toBe(a.reference); expect(b.stage).toBe('review'); expect(b.name).toBe(a.name); expect(b.kind).toBe('vendor')
      expect(b.steps.map((s: any) => s.label)).toEqual(['Received', 'Under review', 'Registered on-chain', 'Verified'])
      expect(b.steps.map((s: any) => s.state)).toEqual(['done', 'current', 'pending', 'pending'])
      expect(b.contact.telegram).toBe('@chrisgolde')
      const txt = JSON.stringify(b); expect(txt).not.toContain('REG-PRIVATE-9'); expect(txt).not.toContain('Ghana'); expect(txt).not.toContain('regNo'); expect(txt).not.toContain('country')
    }
  })
  test('unknown, malformed, wrong-code and bare-number lookups all give the identical answer', async () => {
    const a = await apply(W(0xa02)); const n = a.reference.split('-')[2]
    const miss = JSON.stringify({ found: false })
    for (const q of ['ref=KOLO-APP-' + n, 'ref=KOLO-APP-' + n + '-AAAAAA', 'ref=nonsense', 'ref=KOLO-APP-99999-ZZZZZZ', 'wallet=' + W(0xdead), 'wallet=0x12']) {
      const { r, b } = await status(q); expect(r.status).toBe(200); expect(JSON.stringify(b)).toBe(miss)
    }
    expect((await req('/payees/status')).status).toBe(400)
  })
  test('follows the on-chain registry by wallet: registered, verified, revoked', async () => {
    const a = await apply(W(0xa03)); const row = (status: number) => [1, status, W(0xa03), hashOf('x'), hashOf('d'), W(1), status === 2 ? 1_790_000_000n : 0n, 1_789_000_000n]
    await setRows([row(1)]); let s = (await status('wallet=' + a.wallet)).b
    expect(s.stage).toBe('registered'); expect(s.steps.map((x: any) => x.state)).toEqual(['done', 'done', 'done', 'pending']); expect(s.payeeId).toBe(1)
    await setRows([row(2)]); s = (await status('ref=' + a.reference)).b
    expect(s.stage).toBe('verified'); expect(s.steps.at(-1).label).toBe('Verified'); expect(s.steps.at(-1).state).toBe('done'); expect(s.steps.at(-1).at).toBe(new Date(1_790_000_000_000).toISOString())
    await setRows([row(3)]); s = (await status('wallet=' + a.wallet)).b
    expect(s.stage).toBe('revoked'); expect(s.steps.at(-1).label).toBe('Revoked'); expect(s.steps.at(-1).state).toBe('failed')
    await setRows([])
  })
  test('on-chain only wallets are found without leaking an unpublished name', async () => {
    await setRows([[0, 1, W(0xa04), hashOf('Some Unverified Co'), '0x' + '0'.repeat(64), W(1), 0n, 1_789_000_000n]])
    const { b } = await status('wallet=' + W(0xa04)); expect(b.found).toBe(true); expect(b.name).toBeNull(); expect(b.reference).toBeNull(); expect(b.stage).toBe('registered')
    await setRows([])
  })
  test('registrar can reject with a reason; only they can; the applicant sees it; they can reapply', async () => {
    const a = await apply(W(0xa05)); const id = Number(a.reference.split('-')[2])
    expect((await req(`/payees/applications/${id}/reject`, j({ reason: 'x' }))).status).toBe(403)
    expect((await req(`/payees/applications/abc/reject`, { method: 'POST', headers: ADMIN, body: '{}' })).status).toBe(400)
    expect((await req(`/payees/applications/999999/reject`, { method: 'POST', headers: ADMIN, body: '{}' })).status).toBe(404)
    expect((await req(`/payees/applications/${id}/reject`, { method: 'POST', headers: ADMIN, body: JSON.stringify({ reason: '  Documents unreadable  ' }) })).status).toBe(200)
    const s = (await status('wallet=' + a.wallet)).b
    expect(s.stage).toBe('rejected'); expect(s.steps.map((x: any) => x.label)).toEqual(['Received', 'Under review', 'Rejected'])
    expect(s.steps[2].state).toBe('failed'); expect(s.steps[2].note).toBe('Documents unreadable')
    expect((await req(`/payees/applications/${id}/reject`, { method: 'POST', headers: ADMIN, body: '{}' })).status).toBe(409)
    const again = await apply(a.wallet); expect(again.reference).not.toBe(a.reference)
    expect((await status('wallet=' + a.wallet)).b.stage).toBe('review')
  })
  test('lookups are rate limited and the 429 carries the wait', async () => {
    const sec = await import('../security'); sec.resetRateLimits(); process.env.KOLO_RATE_LIMIT = 'on'
    const h = { 'fly-client-ip': '198.51.100.7', 'x-vercel-forwarded-for': '203.0.113.77' }
    let last: Response | undefined
    for (let i = 0; i < 31; i++) last = await req('/payees/status?wallet=' + W(0xfff), { headers: h })
    expect(last!.status).toBe(429); expect((await last!.json()).retryAfter).toBeGreaterThan(0)
    expect((await req('/payees/status?wallet=' + W(0xfff), { headers: { ...h, 'x-vercel-forwarded-for': '203.0.113.78' } })).status).toBe(200)
    sec.resetRateLimits(); process.env.KOLO_RATE_LIMIT = 'off'
  })
})

describe('privacy gate: applications endpoint', () => {
  // Ensure the token is set for this describe block (test-setup sets it but module-load timing can vary)
  const TOKEN = 'kolo-privacy-gate-test-token-4321'
  let savedToken: string | undefined
  beforeAll(() => { savedToken = process.env.KOLO_ADMIN_TOKEN; process.env.KOLO_ADMIN_TOKEN = TOKEN })
  afterAll(() => { process.env.KOLO_ADMIN_TOKEN = savedToken })
  const adminAuth = () => ({ authorization: 'Bearer ' + TOKEN })
  test('unauthenticated GET /payees/applications returns 403', async () => {
    expect((await req('/payees/applications')).status).toBe(403)
  })
  test('wrong Bearer token returns 403', async () => {
    expect((await req('/payees/applications', { headers: { authorization: 'Bearer wrong-token' } })).status).toBe(403)
  })
  test('short token (< 16 chars) is refused', async () => {
    expect((await req('/payees/applications', { headers: { authorization: 'Bearer short' } })).status).toBe(403)
  })
  test('valid admin Bearer token returns 200 and the queue', async () => {
    const r = await req('/payees/applications', { headers: adminAuth() })
    expect(r.status).toBe(200); expect(Array.isArray(await r.json())).toBe(true)
  })
  test('unauthenticated POST to reject returns 403', async () => {
    expect((await req('/payees/applications/1/reject', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(403)
  })
  test('admin can reject a pending application', async () => {
    // submit a fresh application first
    const W2 = '0x' + 'a'.repeat(40)
    const sub = await (await req('/payees/applications', { method: 'POST', body: JSON.stringify({ kind: 'school', name: 'Gate Test School', wallet: W2 }), headers: { 'content-type': 'application/json' } })).json()
    const id = Number(sub.application.reference.split('-')[2])
    const r = await req(`/payees/applications/${id}/reject`, { method: 'POST', headers: { ...adminAuth(), 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Insufficient documents' }) })
    expect(r.status).toBe(200)
    // idempotent reject returns 409
    const r2 = await req(`/payees/applications/${id}/reject`, { method: 'POST', headers: { ...adminAuth(), 'content-type': 'application/json' }, body: '{}' })
    expect(r2.status).toBe(409)
  })
})

describe('privacy gate: public registry excludes unverified', () => {
  const W = (n: number) => '0x' + n.toString(16).padStart(40, '0')
  const REGISTRY_TOKEN = 'kolo-registry-gate-test-token-9876'
  let setRows: (rows: any[]) => Promise<void>
  let savedToken: string | undefined
  beforeAll(async () => {
    savedToken = process.env.KOLO_ADMIN_TOKEN; process.env.KOLO_ADMIN_TOKEN = REGISTRY_TOKEN
    const { pub } = await import('../chain'); const { resetRegistryCache } = await import('../payees')
    setRows = async rows => { (pub as any).readContract = async () => BigInt(rows.length); (pub as any).multicall = async () => rows; resetRegistryCache() }
  })
  afterAll(() => { process.env.KOLO_ADMIN_TOKEN = savedToken })
  test('/payees/registry returns only verified payees (status=2) without admin credentials', async () => {
    await setRows([
      [0, 1, W(0xb01), hashOf('Registered School'), '0x' + '0'.repeat(64), W(1), 0n, 1_789_000_000n],  // registered, not verified
      [1, 2, W(0xb02), hashOf('Verified Vendor'), hashOf('docs'), W(1), 1_790_000_000n, 1_789_000_000n],  // verified
      [2, 3, W(0xb03), hashOf('Revoked Hospital'), '0x' + '0'.repeat(64), W(1), 0n, 1_789_000_000n],  // revoked
    ])
    const rows = await (await req('/payees/registry?fresh=1')).json()
    expect(rows.length).toBe(1)
    expect(rows[0].wallet.toLowerCase()).toBe(W(0xb02))
    await setRows([])
  })
  test('/payees/registry?all=1 without admin credentials still returns only verified', async () => {
    await setRows([
      [0, 1, W(0xb04), hashOf('Pending One'), '0x' + '0'.repeat(64), W(1), 0n, 1_789_000_000n],
      [1, 2, W(0xb05), hashOf('Verified One'), hashOf('docs'), W(1), 1_790_000_000n, 1_789_000_000n],
    ])
    const rows = await (await req('/payees/registry?all=1&fresh=1')).json()
    expect(rows.length).toBe(1)
    expect(rows[0].wallet.toLowerCase()).toBe(W(0xb05))
    await setRows([])
  })
  test('/payees/registry?all=1 with admin Bearer returns all statuses', async () => {
    await setRows([
      [0, 1, W(0xb06), hashOf('Registered Only'), '0x' + '0'.repeat(64), W(1), 0n, 1_789_000_000n],
      [1, 2, W(0xb07), hashOf('Verified Also'), hashOf('docs'), W(1), 1_790_000_000n, 1_789_000_000n],
    ])
    const rows = await (await req('/payees/registry?all=1&fresh=1', { headers: { authorization: 'Bearer ' + REGISTRY_TOKEN } })).json()
    expect(rows.length).toBe(2)
    await setRows([])
  })
})

describe('status privacy: applicant data isolation', () => {
  const W = (n: number) => '0x' + n.toString(16).padStart(40, '0')
  test('status by reference exposes only non-sensitive fields: no regNo, no country', async () => {
    const sub = await (await req('/payees/applications', { method: 'POST', body: JSON.stringify({ kind: 'hospital', name: 'St Privacy Hospital', wallet: W(0xc01), country: 'Nigeria', regNo: 'PRIVATE-REG-999' }), headers: { 'content-type': 'application/json' } })).json()
    const ref = sub.application.reference
    const r = await req('/payees/status?ref=' + encodeURIComponent(ref))
    expect(r.status).toBe(200)
    const b = await r.json()
    expect(b.found).toBe(true); expect(b.stage).toBe('review')
    const txt = JSON.stringify(b)
    expect(txt).not.toContain('PRIVATE-REG-999'); expect(txt).not.toContain('Nigeria'); expect(txt).not.toContain('regNo'); expect(txt).not.toContain('country')
  })
  test('status by wrong wallet returns not found (never leaks other applicants)', async () => {
    const r = await req('/payees/status?wallet=' + W(0xdead01))
    expect(r.status).toBe(200); expect((await r.json()).found).toBe(false)
  })
  test('status endpoint requires ref or wallet param', async () => {
    expect((await req('/payees/status')).status).toBe(400)
  })
})
