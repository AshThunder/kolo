/* oxlint-disable typescript/no-explicit-any -- stubbing the viem client */
// Offline: eth_getLogs behaviour against the public Arc RPC limits, with the client stubbed.
import { afterAll, describe, expect, test } from 'bun:test'

const ev = (n: number) => Array.from({ length: n }, (_, i) => `event E${i}(uint256 indexed potId, uint256 amount)`)
const ADDR = (n: number) => ('0x' + n.toString(16).padStart(40, '0')) as `0x${string}`

const orig: Record<string, any> = {}
async function setup(headBlock: bigint, getLogs: (a: any) => Promise<any[]>) {
  const chain = await import('../chain'); chain.resetScanState()
  for (const k of ['getBlockNumber', 'getLogs']) orig[k] ??= (chain.pub as any)[k]
  ;(chain.pub as any).getBlockNumber = async () => headBlock
  ;(chain.pub as any).getLogs = getLogs
  return chain
}

afterAll(async () => { const { pub, resetScanState } = await import('../chain'); Object.assign(pub as any, orig); resetScanState() }) // don't leak stubs into live tests

describe('scanLogs', () => {
  test('never ORs more than 10 event topics in one request, and merges chunks in block order', async () => {
    const seen: number[] = []
    const { scanLogs, START_BLOCK } = await setup(68_572_970n + 100n, async a => { seen.push(a.events.length); return [{ blockNumber: START_BLOCK + BigInt(a.events.length), logIndex: a.events.length, eventName: a.events[0].name }] })
    const out = await scanLogs(ADDR(1), ev(14))
    expect(Math.max(...seen)).toBe(10); expect(seen.sort((a, b) => a - b)).toEqual([4, 10])
    expect(out.map(l => l.logIndex)).toEqual([4, 10])
  })

  test('halves the block window when the RPC says the range is too large, then completes', async () => {
    const spans: bigint[] = []
    const { scanLogs, START_BLOCK } = await setup(68_572_970n + 20_000n, async a => {
      const span = a.toBlock - a.fromBlock + 1n; spans.push(span)
      if (span > 3_000n) throw Object.assign(new Error('x'), { details: 'requested range too large' })
      return [{ blockNumber: a.fromBlock, logIndex: 0 }]
    })
    const out = await scanLogs(ADDR(2), ev(2))
    expect(spans[0]).toBe(9_000n)                       // first try uses the default window
    expect(spans.some(s => s <= 3_000n)).toBe(true)      // then adapts
    expect(out[0].blockNumber).toBe(START_BLOCK)
    // every block from START to head covered exactly once by successful calls
    const ok = spans.filter(s => s <= 3_000n).reduce((n, s) => n + s, 0n)
    expect(ok).toBe(20_001n)
  })

  test('is incremental: a repeat scan only asks for blocks after the last one seen', async () => {
    const calls: [bigint, bigint][] = []
    let head = 68_572_970n + 50n
    const chain = await setup(head, async a => { calls.push([a.fromBlock, a.toBlock]); return [] })
    await chain.scanLogs(ADDR(3), ev(1))
    expect(calls).toEqual([[68_572_970n, head]])
    head += 5_000n; (chain.pub as any).getBlockNumber = async () => head
    chain.resetScanState(true)
    await chain.scanLogs(ADDR(3), ev(1))
    expect(calls[1]).toEqual([68_572_970n + 51n, head])
  })

  test('concurrent identical scans share one request', async () => {
    let n = 0
    const { scanLogs } = await setup(68_572_970n + 10n, async () => { n++; await new Promise(r => setTimeout(r, 30)); return [] })
    await Promise.all([scanLogs(ADDR(4), ev(1)), scanLogs(ADDR(4), ev(1)), scanLogs(ADDR(4), ev(1))])
    expect(n).toBe(1)
  })
})
