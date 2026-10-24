/* oxlint-disable typescript/no-explicit-any */
import { describe, expect, test, afterAll } from 'bun:test'
import { submitBurn, listBurns, fetchAttested, relayPending, ARC_DOMAIN } from '../cctp'
import { KOLO_ADDRESSES } from '../../../src/addresses'

const realFetch = globalThis.fetch
afterAll(() => { globalThis.fetch = realFetch })
const word = (a: string) => a.replace('0x', '').toLowerCase().padStart(64, '0')
const TX = '0x' + 'ab'.repeat(32)
// CCTP V2 header: version(4) src(4) dst(4) nonce(32) sender(32) recipient(32) destinationCaller(32) finality(4+4), then body
function msg(dst: number, caller: string) {
  const h = (n: number) => n.toString(16).padStart(8, '0')
  return '0x' + h(1) + h(6) + h(dst) + '00'.repeat(32) + word('0x1') + word(KOLO_ADDRESSES.cctpReceiver) + word(caller) + h(2000) + h(2000) + 'ff'.repeat(300)
}
const iris = (body: any, status = 200) => { globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as any }

describe('cctp relayer', () => {
  test('validates submissions and dedupes', () => {
    expect(submitBurn(6, '0x123').ok).toBe(false)
    expect(submitBurn(-1, TX).ok).toBe(false)
    expect(submitBurn(6, TX).ok).toBe(true); expect(submitBurn(6, TX).ok).toBe(true)
    expect(listBurns().filter(b => b.tx === TX).length).toBe(1)
  })
  test('pending until iris says complete (404 and pending_confirmations)', async () => {
    iris({}, 404); expect(await fetchAttested({ sourceDomain: 6, tx: TX })).toBe('pending')
    iris({ messages: [{ status: 'pending_confirmations', message: '0x', attestation: 'PENDING' }] }); expect(await fetchAttested({ sourceDomain: 6, tx: TX })).toBe('pending')
  })
  test('rejects messages not addressed to our receiver on Arc', async () => {
    iris({ messages: [{ status: 'complete', message: msg(ARC_DOMAIN, '0x' + '11'.repeat(20)), attestation: '0xaa' }] })
    expect(await fetchAttested({ sourceDomain: 6, tx: TX })).toBe('wrong-destination')
    iris({ messages: [{ status: 'complete', message: msg(7, KOLO_ADDRESSES.cctpReceiver), attestation: '0xaa' }] })
    expect(await fetchAttested({ sourceDomain: 6, tx: TX })).toBe('wrong-destination')
  })
  test('accepts a complete message addressed to the receiver; dry-run reports ready without a key', async () => {
    const m = msg(ARC_DOMAIN, KOLO_ADDRESSES.cctpReceiver)
    iris({ messages: [{ status: 'complete', message: m, attestation: '0xaa' }] })
    expect(await fetchAttested({ sourceDomain: 6, tx: TX })).toEqual({ message: m, attestation: '0xaa' })
    const orig = (await import('../chain')).pub.readContract; ;(await import('../chain')).pub.readContract = (async () => false) as any
    try { expect((await relayPending()).find(r => r.tx === TX)?.status).toBe('ready') } finally { (await import('../chain')).pub.readContract = orig }
  })
})
