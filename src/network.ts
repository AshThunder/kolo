// Single source of truth for which Arc network Kolo talks to. Mainnet is the default; testnet stays selectable
// (VITE_KOLO_NETWORK=testnet for the web build, KOLO_NETWORK=testnet for the server and its tests).
import { arc, arcTestnet, base, baseSepolia, type Chain } from 'viem/chains'

export type NetworkKind = 'mainnet' | 'testnet'
// import.meta.env is replaced by Vite in the browser and provided by Bun on the server; process.env only exists on the server.
const viteEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {}
const procEnv: Record<string, string | undefined> = typeof process !== 'undefined' && process.env ? process.env : {}
const raw = (viteEnv.VITE_KOLO_NETWORK ?? procEnv.KOLO_NETWORK ?? 'mainnet').toLowerCase()
export const NETWORK_KIND: NetworkKind = raw === 'testnet' ? 'testnet' : 'mainnet'
export const IS_MAINNET = NETWORK_KIND === 'mainnet'

export interface KoloAddresses {
  payeeRegistry: `0x${string}`; groupPotImpl: `0x${string}`; tuitionPotImpl: `0x${string}`
  factory: `0x${string}`; cctpReceiver: `0x${string}`; sweeperFactory: `0x${string}`
}
export interface NetworkConfig {
  kind: NetworkKind
  label: string // shown in the UI badge
  chain: Chain
  chainId: number
  rpc: string
  explorer: string
  usdc: `0x${string}` // 6-decimal ERC-20 view of Arc's native USDC (native gas itself is 18-decimal: never mix them)
  startBlock: bigint
  addresses: KoloAddresses
  cctp: {
    domain: number // Arc's CCTP domain
    transmitter: `0x${string}` // MessageTransmitterV2 on Arc
    tokenMessenger: `0x${string}` // TokenMessengerV2 (same CREATE2 address on every CCTP V2 EVM chain of the same network kind)
    iris: string // Circle attestation API
  }
  source: { chain: Chain; chainId: number; name: string; usdc: `0x${string}`; domain: number; blocks: string } // CCTP pay-in source chain (Base)
  modularSlug: string // Circle Modular Wallets transport path segment for Arc
}

const NETWORKS: Record<NetworkKind, NetworkConfig> = {
  mainnet: {
    kind: 'mainnet', label: 'Arc Mainnet', chain: arc, chainId: 5042,
    rpc: 'https://rpc.mainnet.arc.io', explorer: 'https://explorer.arc.io',
    usdc: '0x3600000000000000000000000000000000000000',
    startBlock: 27463900n, // a few blocks before the first Kolo deploy tx (2026-10-23)
    addresses: {
      payeeRegistry: '0xd90008F52a37cA35b92Aa7bF39BF853cE2ff8F20',
      groupPotImpl: '0x460C09572f4cE0FeF37E74A8dAE7C3b7A36A9E0f',
      tuitionPotImpl: '0x597Cd6181046B25895dBe6D4ba9143136eAe8C50',
      factory: '0xf9ab7f396d00955CB96Ef48fd98fA72f44bc262d',
      cctpReceiver: '0x6b937828cE1005Dac2C459A253a46b1152236021',
      sweeperFactory: '0xfa1ac8b10cAdD65Bf6d839e9C4CE825f2d9e6FFb',
    },
    cctp: {
      domain: 26,
      transmitter: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
      tokenMessenger: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
      iris: 'https://iris-api.circle.com',
    },
    source: { chain: base, chainId: 8453, name: 'Base', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', domain: 6, blocks: 'about 15–20 minutes' },
    modularSlug: 'arc',
  },
  testnet: {
    kind: 'testnet', label: 'Arc Testnet', chain: arcTestnet, chainId: 5042002,
    rpc: 'https://rpc.testnet.arc.io', explorer: 'https://explorer.testnet.arc.io',
    usdc: '0x3600000000000000000000000000000000000000',
    startBlock: 68572970n,
    addresses: {
      payeeRegistry: '0xb6F13A2f400A7D870d023c1f9F751EF8f4b15dB7',
      groupPotImpl: '0xBdE7153E7689119C9DcB4176b2fb4926E54C2E22',
      tuitionPotImpl: '0x27F4ae2dAc8c7b6A5081fF4478EcEeE70889fd5A',
      factory: '0x019b846b47a09380CD444ECBA328Bbc54DC33E46',
      cctpReceiver: '0x7E9B1CA6C553E80811D8525c05C10A02833895a2', // v2: hookData offset 376 (v1 0x8d55…40D3 mis-decoded real V2 messages)
      sweeperFactory: '0x6B9a0b6Bd53800faEAb8ebaD1c6C0c01cc4809BC',
    },
    cctp: {
      domain: 26,
      transmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
      tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
      iris: 'https://iris-api-sandbox.circle.com',
    },
    source: { chain: baseSepolia, chainId: 84532, name: 'Base Sepolia', usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', domain: 6, blocks: 'about 15 minutes' },
    modularSlug: 'arcTestnet',
  },
}

export const NET: NetworkConfig = NETWORKS[NETWORK_KIND]
