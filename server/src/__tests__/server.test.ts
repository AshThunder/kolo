/* oxlint-disable typescript/no-explicit-any -- loose JSON fixtures in tests */
// Server tests. Pure units run offline; `live` tests do read-only calls against Arc TESTNET (set KOLO_OFFLINE=1 to skip).
import { describe, expect, test, mock, beforeAll } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { keccak256, toBytes } from 'viem'

process.env.KOLO_META_FILE = mkdtempSync(tmpdir() + '/kolo-meta-') + '/meta.json'
delete process.env.KEEPER_PRIVATE_KEY
const live = process.env.KOLO_OFFLINE === '1' ? test.skip : test
const T = 60_000

describe('csv escaping', () => {
  test('quotes commas/quotes/newlines', async () => {
    const { esc } = await import('../indexer')
    expect(esc('a,b')).toBe('"a,b"'); expect(esc('say "hi"')).toBe('"say ""hi"""'); expect(esc('x\ny')).toBe('"x\ny"')
  })
  test('neutralises formula injection but keeps negative numbers', async () => {
    const { esc } = await import('../indexer')
    expect(esc('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`); expect(esc('@SUM(A1)')).toBe("'@SUM(A1)"); expect(esc('-1.5')).toBe('-1.5')
  })
})

describe('fx', () => {
  test('USD base, filters unsupported, caches', async () => {
    const calls: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = mock(async (u: any) => { calls.push(String(u)); return new Response(JSON.stringify({ rates: { USD: 1, NGN: 1500, KES: 129, XYZ: 9 } })) }) as any
    const { fxRates } = await import('../fx')
    const r = await fxRates(['ngn', 'kes', 'xyz'])
    expect(r.base).toBe('USD'); expect(r.asset).toBe('USDC'); expect(r.rates).toEqual({ NGN: 1500, KES: 129 })
    await fxRates(['NGN']); expect(calls.length).toBe(1)
    expect(calls[0]).toContain('/latest/USD')
    globalThis.fetch = real
  })
})

describe('api (live Arc testnet reads)', () => {
  let app: any
  beforeAll(async () => { app = (await import('../app')).app })
  const get = (p: string, init?: RequestInit) => app.request('/api/kolo' + p, init)

  live('health reports dry-run without a key', async () => {
    const j = await (await get('/health')).json(); expect(j).toEqual({ ok: true, chain: 5042002, network: 'testnet', keeper: 'dry-run' })
  }, T)
  live('lists pots with on-chain fields; resolves by id and address; 404s unknown', async () => {
    const pots = await (await get('/pots')).json()
    expect(pots.length).toBeGreaterThanOrEqual(2)
    const p1 = pots.find((p: any) => p.id === 1); expect(p1.type).toBe('group'); expect(p1.organizer).toMatch(/^0x/)
    const byAddr = await (await get('/pots/' + p1.address)).json(); expect(byAddr.id).toBe(1)
    expect((await get('/pots/99999')).status).toBe(404)
  }, T)
  live('meta accepts only titles matching titleHash', async () => {
    const bad = await get('/meta', { method: 'POST', body: JSON.stringify({ potId: 1, title: 'forged' }), headers: { 'content-type': 'application/json' } })
    expect(bad.status).toBe(400)
    const ok = await get('/meta', { method: 'POST', body: JSON.stringify({ potId: 1, title: 'E2E team trip' }), headers: { 'content-type': 'application/json' } })
    expect(ok.status).toBe(200); expect((await (await get('/pots/1')).json()).title).toBe('E2E team trip')
    expect(keccak256(toBytes('E2E team trip'))).toMatch(/^0x/)
  }, T)
  live('ledger + csv agree', async () => {
    const rows = await (await get('/pots/1/ledger')).json()
    expect(rows.length).toBeGreaterThan(0); expect(rows[0].verify).toMatch(/^\/verify\/r\/5042002\/0x/)
    const res = await get('/pots/1/csv'); expect(res.headers.get('content-type')).toContain('text/csv')
    const lines = (await res.text()).trim().split('\n'); expect(lines[0]).toStartWith('timestamp_utc,event'); expect(lines.length).toBe(rows.length + 1)
  }, T)
  live('stats mirror factory totals', async () => {
    const s = await (await get('/stats?fresh=1')).json()
    expect(s.pots).toBeGreaterThanOrEqual(2); expect(Number(s.locked) + Number(s.released) + Number(s.refunded)).toBeGreaterThan(0)
  }, T)
  live('keeper: due list readable; manual run forbidden without token', async () => {
    const k = await (await get('/keeper')).json(); expect(k.mode).toBe('dry-run'); expect(Array.isArray(k.due)).toBe(true)
    expect((await get('/keeper/run', { method: 'POST' })).status).toBe(403)
  }, T)
})
