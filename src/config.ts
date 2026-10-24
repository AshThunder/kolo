/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { NET } from './network'
import { arcTransport } from './lib/transport'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(NET.chainId, NET.rpc)

// ── Kolo contract addresses (selected network; see ./network.ts) ─────
export { KOLO_ADDRESSES } from './addresses'

export const config = createConfig({
  chains: [NET.chain, NET.source.chain, mainnet], // source.chain = CCTP pay-in source (Base); Ethereum mainnet is needed for ENS resolution
  connectors: [injected()],
  transports: {
    [NET.chain.id]: arcTransport(),
    [NET.source.chain.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
