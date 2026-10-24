/* oxlint-disable typescript/no-explicit-any -- registry tuples are positional */
// Off-chain payee names, trust-minimised like pot titles: a name is accepted only if keccak256(name) equals
// the nameHash stored in the on-chain PayeeRegistry. Plus a public queue of payee applications for the registrar.
import { keccak256, toBytes, isAddress, type Address } from 'viem'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { pub, scanLogs } from './chain'
import { KOLO_ADDRESSES } from '../../src/addresses'
import { PAYEE_REGISTRY_ABI } from '../../src/abi/PayeeRegistry'

const dir = new URL('../data/', import.meta.url).pathname
const NAMES_FILE = process.env.KOLO_PAYEES_FILE ?? dir + 'payees.json'
const APPS_FILE = process.env.KOLO_APPLICATIONS_FILE ?? dir + 'applications.json'
const load = <T,>(f: string, d: T): T => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return d } }
const save = (f: string, v: unknown) => { mkdirSync(f.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 1)) }

let names: Record<string, { name: string; at: string }> = load(NAMES_FILE, {})
export const payeeNames = () => Object.fromEntries(Object.entries(names).map(([h, v]) => [h, v.name]))

export async function setPayeeName(name: string) {
  name = name.trim()
  if (!name || name.length > 120) return { ok: false as const, error: 'name must be 1-120 chars' }
  const hash = keccak256(toBytes(name))
  const count = Number(await pub.readContract({ address: KOLO_ADDRESSES.payeeRegistry as Address, abi: PAYEE_REGISTRY_ABI, functionName: 'payeeCount' }))
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1))
  const infos = count ? await pub.multicall({ allowFailure: false, contracts: ids.map(id => ({ address: KOLO_ADDRESSES.payeeRegistry as Address, abi: PAYEE_REGISTRY_ABI, functionName: 'payeeInfo', args: [id] }) as const) }) as any[] : []
  if (!infos.some(i => String(i[3]).toLowerCase() === hash.toLowerCase())) return { ok: false as const, error: 'name does not match any on-chain registry nameHash' }
  names[hash] = { name, at: new Date().toISOString() }; save(NAMES_FILE, names)
  return { ok: true as const, nameHash: hash }
}

export type Application = { id: number; kind: 'school' | 'vendor' | 'hospital'; name: string; wallet: string; country?: string; submittedAt: string; status: 'pending' | 'registered' | 'rejected'; reference?: string; updatedAt?: string; code?: string; rejectedAt?: string; rejectReason?: string }
let apps: (Application & { regNo?: string })[] = load(APPS_FILE, [])
/** Registrar view: includes the registration number, which stays out of the public listing. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from(randomBytes(6), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
/** Unguessable suffix so references (KOLO-APP-<n>-<code>) can't be enumerated by counting. Older applications get one on first use. */
function codeOf(a: Application) { if (!a.code) { a.code = newCode(); save(APPS_FILE, apps) } return a.code }
export const referenceOf = (a: Application) => `KOLO-APP-${a.id}-${codeOf(a)}`
export const listApplicationsAdmin = () => apps.map(a => ({ ...a, reference: referenceOf(a) }))
/** Registrar rejects a still-pending application, with an optional reason that the applicant sees on the status page. */
export function rejectApplication(id: number, reason?: string) {
  const a = apps.find(x => x.id === id)
  if (!a) return { ok: false as const, error: 'not found' }
  if (a.status !== 'pending') return { ok: false as const, error: `application is already ${a.status}` }
  a.status = 'rejected'; a.rejectedAt = new Date().toISOString()
  const r = String(reason ?? '').trim().slice(0, 300); if (r) a.rejectReason = r; else delete a.rejectReason
  save(APPS_FILE, apps); return { ok: true as const }
}
export function addApplication(b: any) {
  const kind = b?.kind, name = String(b?.name ?? '').trim(), wallet = String(b?.wallet ?? '')
  if (!['school', 'vendor', 'hospital'].includes(kind)) return { ok: false as const, error: 'kind must be school, vendor or hospital' }
  if (!name || name.length > 120) return { ok: false as const, error: 'name must be 1-120 chars' }
  if (!isAddress(wallet, { strict: false })) return { ok: false as const, error: 'wallet must be a valid address' }
  const country = b?.country ? String(b.country).slice(0, 60) : undefined, regNo = b?.regNo ? String(b.regNo).slice(0, 60) : undefined
  const ref = (a: Application) => referenceOf(a)
  // Re-submitting a still-pending wallet corrects that application in place (wrong kind, typo in the name) instead of being refused.
  // Nothing is trusted from it: the registrar still checks wallet control (a signed message) and documents before registering.
  const open = apps.find(a => a.wallet.toLowerCase() === wallet.toLowerCase() && a.status === 'pending')
  if (open) {
    Object.assign(open, { kind, name, country, regNo, updatedAt: new Date().toISOString() }); save(APPS_FILE, apps)
    const { regNo: _r, code: _c, ...p } = open; return { ok: true as const, updated: true as const, application: { ...p, reference: ref(open) } }
  }
  const a = { id: apps.reduce((m, x) => Math.max(m, x.id), 0) + 1, kind, name, wallet, country, regNo, code: newCode(), submittedAt: new Date().toISOString(), status: 'pending' as const }
  apps.push(a); save(APPS_FILE, apps)
  const { regNo: _r, code: _c, ...pub_ } = a; return { ok: true as const, updated: false as const, application: { ...pub_, reference: ref(a) } }
}

let regCache: { at: number; rows: any[] } | undefined
/** Test hook. */
export const resetRegistryCache = () => { regCache = undefined }
/** Every registry entry (id, kind, status, wallet, nameHash, docHash, verifier, timestamps), cached 20 s. Same data the browser reads from the contract. */
export async function payeeRegistry(fresh = false) {
  if (!fresh && regCache && Date.now() - regCache.at < 20_000) return regCache.rows
  const count = Number(await pub.readContract({ address: KOLO_ADDRESSES.payeeRegistry as Address, abi: PAYEE_REGISTRY_ABI, functionName: 'payeeCount' }))
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1))
  const infos = count ? await pub.multicall({ allowFailure: false, contracts: ids.map(id => ({ address: KOLO_ADDRESSES.payeeRegistry as Address, abi: PAYEE_REGISTRY_ABI, functionName: 'payeeInfo', args: [id] }) as const) }) as any[] : []
  const rows = infos.map((r, i) => ({ id: i + 1, kind: Number(r[0]), status: Number(r[1]), wallet: r[2], nameHash: r[3], docHash: r[4], verifier: r[5], verifiedAt: Number(r[6]), registeredAt: Number(r[7]) }))
  regCache = { at: Date.now(), rows }; return rows
}

const EVENTS = [
  'event PayeeRegistered(uint256 indexed id, uint8 kind, address wallet, bytes32 nameHash)',
  'event Verified(uint256 indexed id, address indexed registrar, bytes32 docHash, uint256 timestamp)',
  'event Revoked(uint256 indexed id, address indexed registrar)',
]
async function txFor(id: number, name: 'PayeeRegistered' | 'Verified' | 'Revoked'): Promise<string | undefined> {
  try {
    const logs = await scanLogs(KOLO_ADDRESSES.payeeRegistry as Address, EVENTS)
    return logs.filter((l: any) => l.eventName === name && Number(l.args?.id) === id).pop()?.transactionHash
  } catch { return undefined }
}
const REF_RE = /^KOLO-APP-(\d{1,7})-([A-Z0-9]{6})$/
export type StatusStep = { key: 'received' | 'review' | 'registered' | 'final'; label: string; state: 'done' | 'current' | 'pending' | 'failed'; at?: string; tx?: string; note?: string }
/** Public, non-sensitive application status. Looked up by the full reference (with its unguessable code) or by wallet. Never returns the
 *  registration number, country, contact data or any other applicant. Unknown and not-found are the same answer. */
export async function lookupStatus(q: { ref?: string; wallet?: string }) {
  let app: Application | undefined
  const ref = q.ref?.trim().toUpperCase(), wallet = q.wallet?.trim()
  if (ref) { const m = REF_RE.exec(ref); const a = m && apps.find(x => x.id === Number(m[1])); if (a && m && codeOf(a) === m[2]) app = a }
  else if (wallet && isAddress(wallet, { strict: false })) app = [...apps].reverse().find(a => a.wallet.toLowerCase() === wallet.toLowerCase())
  const w = (app?.wallet ?? (wallet && isAddress(wallet, { strict: false }) ? wallet : '')).toLowerCase()
  const row = w ? (await payeeRegistry().catch(() => [] as any[])).find((r: any) => String(r.wallet).toLowerCase() === w) : undefined
  if (!app && !row) return { found: false as const }
  const ts = (n: number) => (n > 0 ? new Date(n * 1000).toISOString() : undefined)
  const chainStage = row ? (row.status === 2 ? 'verified' : row.status === 3 ? 'revoked' : 'registered') : undefined
  const stage = chainStage ?? (app?.status === 'rejected' ? 'rejected' : 'review')
  const kind = app?.kind ?? (['school', 'vendor', 'hospital'][row?.kind] as Application['kind'])
  const name = app?.name ?? (row?.status === 2 ? payeeNames()[String(row.nameHash)] : undefined) ?? null
  const steps: StatusStep[] = [{ key: 'received', label: 'Received', state: 'done', at: app?.submittedAt }]
  const reviewed = stage === 'registered' || stage === 'verified' || stage === 'revoked'
  steps.push({ key: 'review', label: 'Under review', state: reviewed || stage === 'rejected' ? 'done' : 'current', note: stage === 'review' ? 'The registrar checks your documents and wallet, usually within 1 to 3 days.' : undefined })
  if (stage === 'rejected') {
    steps.push({ key: 'final', label: 'Rejected', state: 'failed', at: app?.rejectedAt, note: app?.rejectReason || 'The registrar did not approve this application.' })
  } else {
    steps.push({ key: 'registered', label: 'Registered on-chain', state: reviewed ? 'done' : 'pending', at: reviewed ? ts(row.registeredAt) : undefined, tx: reviewed ? await txFor(row.id, 'PayeeRegistered') : undefined })
    if (stage === 'revoked') steps.push({ key: 'final', label: 'Revoked', state: 'failed', note: 'The registrar withdrew approval. Pots that point to this payee are frozen.' })
    else steps.push({ key: 'final', label: 'Verified', state: stage === 'verified' ? 'done' : 'pending', at: stage === 'verified' ? ts(row.verifiedAt) : undefined, tx: stage === 'verified' ? await txFor(row.id, 'Verified') : undefined })
  }
  return { found: true as const, reference: app ? referenceOf(app) : null, name, kind, wallet: app?.wallet ?? row?.wallet, submittedAt: app?.submittedAt ?? null, stage, steps, payeeId: row?.id ?? null, contact: { telegram: '@chrisgolde', url: 'https://t.me/chrisgolde' } }
}
