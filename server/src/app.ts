/* oxlint-disable typescript/no-explicit-any -- dynamic ABI/log decoding in the indexer/keeper */
import { Hono } from 'hono'
import { fxRates } from './fx'
import { getStats, refreshStats, resolvePot, potCsv, potsFor, potLedger, potTimeline, payeeActivity } from './indexer'
import { listPots, keeperAccount, rpcForward } from './chain'
import { getTitle, setTitle } from './meta'
import { payeeRegistry } from './payees'
import { payeeNames, setPayeeName, listApplicationsAdmin, addApplication, lookupStatus, rejectApplication } from './payees'
import { pub, potAbi } from './chain'
import { findDue, runKeeper, type KeeperAction } from './keeper'
import { submitBurn, listBurns } from './cctp'
import { NET } from '../../src/network'
import { corsGuard, rateLimit, bodyCap, isAdmin, bearerOk, applyGate, burnGate, lookupGate } from './security'

export const app = new Hono().basePath('/api/kolo')
app.use('*', corsGuard, rateLimit, bodyCap())
let lastRun: { at: string; actions: KeeperAction[] } | undefined
export const setLastRun = (v: typeof lastRun) => { lastRun = v }

app.get('/health', c => c.json({ ok: true, chain: NET.chainId, network: NET.kind, keeper: keeperAccount ? 'live' : 'dry-run' }))
app.get('/fx', async c => {
  const to = (c.req.query('to') ?? 'USD').split(',')
  try { return c.json(await fxRates(to)) } catch (e: any) { return c.json({ error: e.message }, 502) }
})
app.get('/stats', async c => c.json(c.req.query('fresh') ? await refreshStats() : await getStats()))
const enrichCache = new Map<number, { at: number; v: any }>()
async function enrich(p: Awaited<ReturnType<typeof listPots>>[number]) {
  const hit = enrichCache.get(p.id); if (hit && Date.now() - hit.at < 8_000) return { ...hit.v, title: getTitle(p.id) ?? null }
  const v = await enrichFresh(p); enrichCache.set(p.id, { at: Date.now(), v }); return v
}
async function enrichFresh(p: Awaited<ReturnType<typeof listPots>>[number]) {
  const abi = potAbi(p.type) as any
  const [organizer, deadline, state, totalContributed] = await pub.multicall({ allowFailure: false, contracts: ['organizer', 'deadline', 'state', 'totalContributed'].map(functionName => ({ address: p.address, abi, functionName })) }) as any[]
  return { ...p, title: getTitle(p.id) ?? null, organizer, deadline: Number(deadline), state: Number(state), totalContributed: String(totalContributed) }
}
app.get('/pots', async c => c.json(await Promise.all((await listPots()).map(enrich))))
app.get('/pots/by/:addr', async c => c.json(await potsFor(c.req.param('addr'))))
app.get('/pots/:ref/ledger', async c => { const p = await resolvePot(c.req.param('ref')); return p ? c.json(await potLedger(p)) : c.json({ error: 'not found' }, 404) })
app.get('/pots/:ref/timeline', async c => { const p = await resolvePot(c.req.param('ref')); return p ? c.json(await potTimeline(p)) : c.json({ error: 'not found' }, 404) })
// Payee display names, keyed by on-chain nameHash (accepted only when keccak256(name) matches the registry)
app.get('/payees', c => c.json(payeeNames()))
app.post('/payees/meta', async c => { const b = await c.req.json().catch(() => ({})); const r = await setPayeeName(String(b.name ?? '')); return c.json(r, r.ok ? 200 : 400) })
app.get('/payees/:id/activity', async c => { const id = Number(c.req.param('id')); return Number.isInteger(id) && id > 0 ? c.json(await payeeActivity(id)) : c.json({ error: 'bad id' }, 400) })
// The application queue is admin-only: Bearer KOLO_ADMIN_TOKEN, or a fresh signature from a registry admin/registrar (see security.ts).
app.get('/payees/applications', async c => {
  if (!(await isAdmin(c))) return c.json({ error: 'forbidden' }, 403)
  // an application is "registered" as soon as its wallet is in the on-chain registry
  const reg = await payeeRegistry().catch(() => [] as any[])
  const onChain = new Set(reg.map((r: any) => String(r.wallet).toLowerCase()))
  return c.json(listApplicationsAdmin().map(a => onChain.has(a.wallet.toLowerCase()) ? { ...a, status: 'registered' as const } : a))
})
// Public, rate-limited, non-sensitive status for an applicant: by full reference (with its code) or by wallet. Unknown = not found.
app.get('/payees/status', async c => {
  const wait = lookupGate(c); if (wait) { c.header('retry-after', String(wait)); return c.json({ error: 'too many lookups, try again later', retryAfter: wait }, 429) }
  const ref = c.req.query('ref'), wallet = c.req.query('wallet')
  if (!ref && !wallet) return c.json({ error: 'give a reference or a wallet' }, 400)
  c.header('cache-control', 'no-store')
  return c.json(await lookupStatus({ ref: ref?.slice(0, 40), wallet: wallet?.slice(0, 60) }))
})
app.post('/payees/applications/:id/reject', async c => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'bad id' }, 400)
  if (!(await isAdmin(c, `reject application ${id}`))) return c.json({ error: 'forbidden' }, 403)
  const b = await c.req.json().catch(() => ({})); const r = rejectApplication(id, b?.reason)
  return c.json(r, r.ok ? 200 : r.error === 'not found' ? 404 : 409)
})
app.post('/payees/applications', async c => {
  const gate = applyGate(c)
  if (!gate.ok) { c.header('retry-after', String(gate.retryAfter)); console.log(`apply rate-limited scope=${gate.scope} retryAfter=${gate.retryAfter}s`); return c.json({ error: 'too many applications', scope: gate.scope, retryAfter: gate.retryAfter }, 429) }
  const r = addApplication(await c.req.json().catch(() => ({})))
  if (r.ok) gate.commit()
  return c.json(r, r.ok ? (r.updated ? 200 : 201) : 400)
})
app.post('/meta', async c => { const b = await c.req.json().catch(() => ({})); const r = await setTitle(Number(b.potId), String(b.title ?? '')); return c.json(r, r.ok ? 200 : 400) })
app.get('/pots/:ref', async c => { const p = await resolvePot(c.req.param('ref')); return p ? c.json(await enrich(p)) : c.json({ error: 'not found' }, 404) })
app.get('/pots/:ref/csv', async c => {
  const p = await resolvePot(c.req.param('ref')); if (!p) return c.json({ error: 'not found' }, 404)
  return c.body(await potCsv(p), 200, { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="kolo-pot-${p.id}.csv"` })
})
// Cross-chain pay-in: submit the source-chain burn tx; the keeper relays it once Circle attests (see cctp.ts).
app.post('/cctp/burns', async c => {
  const wait = burnGate(c); if (wait) { c.header('retry-after', String(wait)); return c.json({ error: 'too many requests, try again later', retryAfter: wait }, 429) }
  const b = await c.req.json().catch(() => ({})); const r = submitBurn(Number(b.sourceDomain), String(b.tx ?? '')); return c.json(r, r.ok ? 202 : 400)
})
app.get('/cctp/burns', c => c.json(listBurns()))
app.get('/keeper', async c => c.json({ mode: keeperAccount ? 'live' : 'dry-run', due: await findDue(), lastRun }))
// Manual keeper trigger: requires KEEPER_RUN_TOKEN (Bearer). Disabled when unset, so the public can't burn keeper gas.
app.post('/keeper/run', async c => {
  if (!bearerOk(c, process.env.KEEPER_RUN_TOKEN)) return c.json({ error: 'forbidden' }, 403)
  const actions = await runKeeper(); lastRun = { at: new Date().toISOString(), actions }; return c.json(lastRun) })

// Public registry snapshot (verified payees only — status=2). Pass ?all=1 with admin credentials to include all statuses (used by the registrar console).
app.get('/payees/registry', async c => {
  const all = c.req.query('all') === '1'
  const admin = all && await isAdmin(c)
  const rows = await payeeRegistry(!!c.req.query('fresh'))
  return c.json(admin ? rows : rows.filter((r: any) => Number(r.status) === 2))
})

// Read-only JSON-RPC pass-through for browsers that cannot reach rpc.mainnet.arc.io directly (Cloudflare challenge, extension, ISP).
// Allow-list of read methods only: no transaction broadcast, no signing, no admin namespaces.
const RPC_READ = new Set(['eth_chainId', 'net_version', 'eth_blockNumber', 'eth_call', 'eth_getBalance', 'eth_getCode', 'eth_getStorageAt', 'eth_getLogs',
  'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getTransactionCount', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_gasPrice',
  'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_estimateGas'])
app.post('/rpc', async c => {
  const raw = await c.req.text()
  let j: any; try { j = JSON.parse(raw) } catch { return c.json({ error: 'bad json' }, 400) }
  const calls = Array.isArray(j) ? j : [j]
  if (calls.length === 0 || calls.length > 25 || calls.some((x: any) => !x || typeof x.method !== 'string' || !RPC_READ.has(x.method)))
    return c.json({ jsonrpc: '2.0', id: null, error: { code: -32601, message: 'method not allowed on the read proxy' } }, 400)
  try { const r = await rpcForward(raw); return new Response(r.text, { status: r.status, headers: { 'content-type': 'application/json' } }) }
  catch { return c.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'upstream unavailable' } }, 502) }
})
