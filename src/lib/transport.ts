// Arc read transport: the public RPC first (fast, no hop), then Kolo's own read-only proxy on the same origin.
// Some browsers cannot reach rpc.mainnet.arc.io directly (Cloudflare challenge, privacy extension, ISP block, rate limit),
// and before this a failed read showed up as an empty page on that device only.
import { http, fallback, type Transport } from 'viem'
import { NET } from '../network'
import { API_BASE } from './api'

const override = (import.meta.env.VITE_KOLO_RPC as string | undefined) || undefined // dev/test only: point reads at a local node
const proxyUrl = () => (API_BASE.startsWith('http') ? API_BASE : (typeof window !== 'undefined' ? window.location.origin : '') + API_BASE) + '/rpc'

export function arcTransport(): Transport {
  if (override) return http(override)
  return fallback([http(NET.rpc, { timeout: 5_000, retryCount: 1, retryDelay: 300 }), http(proxyUrl(), { timeout: 15_000, retryCount: 1 })], { retryCount: 1 })
}
