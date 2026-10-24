/* oxlint-disable typescript/no-explicit-any -- dynamic ABI/log decoding in the indexer/keeper */
// Off-chain titles, trust-minimised: a title is only accepted if keccak256(title) == pot.titleHash() on-chain.
import { keccak256, toBytes, type Address } from 'viem'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pub, listPots, potAbi } from './chain'
const FILE = process.env.KOLO_META_FILE ?? new URL('../data/meta.json', import.meta.url).pathname
let db: Record<string, { title: string; at: string }> = {}
try { db = JSON.parse(readFileSync(FILE, 'utf8')) } catch { /* empty */ }
const save = () => { mkdirSync(FILE.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(FILE, JSON.stringify(db, null, 1)) }
export const getTitle = (potId: number) => db[String(potId)]?.title
export async function setTitle(potId: number, title: string) {
  if (!title || title.length > 120) return { ok: false, error: 'title must be 1-120 chars' }
  const pot = (await listPots()).find(p => p.id === potId); if (!pot) return { ok: false, error: 'pot not found' }
  const onchain = await pub.readContract({ address: pot.address as Address, abi: potAbi(pot.type) as any, functionName: 'titleHash' })
  if (keccak256(toBytes(title)) !== onchain) return { ok: false, error: 'title does not match on-chain titleHash' }
  db[String(potId)] = { title, at: new Date().toISOString() }; save(); return { ok: true }
}
