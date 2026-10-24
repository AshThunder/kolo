/* oxlint-disable typescript/no-explicit-any -- dynamic ABI/log decoding in the indexer/keeper */
import { app, setLastRun } from './app'
import { refreshStats, warmIndex } from './indexer'
import { runKeeper } from './keeper'
import { keeperAccount } from './chain'

const port = Number(process.env.PORT ?? 8787)
const every = Number(process.env.KEEPER_INTERVAL_MS ?? 60_000)
console.log(`kolo server :${port} keeper=${keeperAccount ? 'live ' + keeperAccount.address : 'dry-run (no KEEPER_PRIVATE_KEY)'}`)
async function tick() {
  try { await refreshStats() } catch (e: any) { console.error('stats', e.shortMessage ?? e.message) }
  try { const actions = await runKeeper(); setLastRun({ at: new Date().toISOString(), actions }); if (actions.length) console.log('keeper', JSON.stringify(actions)) }
  catch (e: any) { console.error('keeper', e.shortMessage ?? e.message) }
}
// Keep the log index warm so first page loads don't pay for a cold range scan
const warm = () => warmIndex().catch((e: any) => console.error('warm', e.shortMessage ?? e.message))
warm(); setInterval(warm, 30_000)
if (process.env.KEEPER_DISABLED !== '1') { tick(); setInterval(tick, every) }
export default { port, fetch: app.fetch, idleTimeout: 120 } // cold log scans can take a while on the public RPC
