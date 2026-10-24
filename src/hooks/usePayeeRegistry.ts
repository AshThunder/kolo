import { useReadContract, useReadContracts } from 'wagmi'
import { KOLO_ADDRESSES } from '../config'
import { PAYEE_REGISTRY_ABI } from '../abi/PayeeRegistry'
import { NET } from '../network'
import { createPublicClient } from 'viem'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { arcTransport } from '../lib/transport'
import { ARC_CHAIN_ID } from '../addresses'

const addr = KOLO_ADDRESSES.payeeRegistry

export function usePayeeCount() {
  const { data } = useReadContract({ address: addr, abi: PAYEE_REGISTRY_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeCount' })
  return data
}

export function usePayeeInfo(id: number | bigint) {
  const { data, isLoading } = useReadContract({
    address: addr,
    abi: PAYEE_REGISTRY_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'payeeInfo',
    args: [BigInt(id)],
    query: { enabled: id > 0 },
  })
  return { data, isLoading }
}

export function usePendingWalletChange(id: number | bigint) {
  const { data } = useReadContract({
    address: addr,
    abi: PAYEE_REGISTRY_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'pendingWalletChange',
    args: [BigInt(id)],
    query: { enabled: id > 0 },
  })
  return data as readonly [string, bigint] | undefined
}

export interface RegistryPayee { id: number; kind: number; status: number; wallet: string; nameHash: string; docHash: string; verifier: string; verifiedAt: number; registeredAt: number }

/**
 * The public payee registry: identical for every visitor, no wallet needed.
 * Source 1 is Kolo's API snapshot of the registry contract; if that is unreachable the browser reads the contract itself
 * (public RPC, then the same-origin read proxy). Only when both fail does it report an error, so an empty list always means "no payees".
 */
let wantFresh = false
/** After a registrar transaction: bypass the server's 20 s snapshot cache once and refresh every registry view. */
export function useRefreshRegistry() {
  const qc = useQueryClient()
  return async () => { wantFresh = true; try { await qc.invalidateQueries({ queryKey: ['payee-registry'] }); await qc.invalidateQueries({ queryKey: ['readContract'] }); await qc.invalidateQueries({ queryKey: ['readContracts'] }) } finally { wantFresh = false } }
}

/** Public payee registry: returns verified payees only (status=2). For the registrar console, use useAdminPayeeList instead. */
export function usePayeeList() {
  const snap = useQuery({ queryKey: ['payee-registry'], queryFn: () => api<RegistryPayee[]>('/payees/registry' + (wantFresh ? '?fresh=1' : '')), staleTime: 20_000, retry: 1, refetchInterval: 30_000 })
  const count = useReadContract({ address: addr, abi: PAYEE_REGISTRY_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeCount', query: { enabled: snap.isError } })
  const n = Number(count.data ?? 0n)
  const ids = Array.from({ length: n }, (_, i) => i + 1)
  const chain = useReadContracts({
    contracts: ids.map(id => ({ address: addr, abi: PAYEE_REGISTRY_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeInfo' as const, args: [BigInt(id)] as const })),
    query: { enabled: snap.isError && n > 0 },
  })
  let payees: RegistryPayee[] = []
  if (snap.data) payees = snap.data
  else if (snap.isError) payees = ids.flatMap((id, i) => {
    const r = chain.data?.[i]?.result as readonly [number, number, string, string, string, string, bigint, bigint] | undefined
    return r ? [{ id, kind: Number(r[0]), status: Number(r[1]), wallet: r[2], nameHash: r[3], docHash: r[4], verifier: r[5], verifiedAt: Number(r[6]), registeredAt: Number(r[7]) }] : []
  })
  payees = payees.filter(p => p.status !== 0)
  const chainFailed = snap.isError && (count.isError || chain.isError)
  const isLoading = snap.isPending || (snap.isError && (count.isPending || (n > 0 && chain.isPending)))
  const refetch = () => { void snap.refetch(); void count.refetch(); void chain.refetch() }
  return { payees, isLoading, isError: chainFailed, refetch, source: snap.data ? ('api' as const) : ('chain' as const) }
}

/** Admin-only registry read: reads all payees (all statuses) directly from the chain via wagmi,
 *  bypassing the server's verified-only filter. Only useful inside the registrar-gated /admin page. */
export function useAdminPayeeList() {
  const count = useReadContract({ address: addr, abi: PAYEE_REGISTRY_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeCount' })
  const n = Number(count.data ?? 0n)
  const ids = Array.from({ length: n }, (_, i) => i + 1)
  const chain = useReadContracts({
    contracts: ids.map(id => ({ address: addr, abi: PAYEE_REGISTRY_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeInfo' as const, args: [BigInt(id)] as const })),
    query: { enabled: n > 0 },
  })
  const payees: RegistryPayee[] = ids.flatMap((id, i) => {
    const r = chain.data?.[i]?.result as readonly [number, number, string, string, string, string, bigint, bigint] | undefined
    return r && Number(r[1]) !== 0 ? [{ id, kind: Number(r[0]), status: Number(r[1]), wallet: r[2], nameHash: r[3], docHash: r[4], verifier: r[5], verifiedAt: Number(r[6]), registeredAt: Number(r[7]) }] : []
  })
  const isLoading = count.isPending || (n > 0 && chain.isPending)
  const isError = count.isError || chain.isError
  const refetch = () => { void count.refetch(); void chain.refetch() }
  return { payees, isLoading, isError, refetch }
}

// A public client for reading payee Release events (off wagmi, for payee proof page)
export const koloPublicClient = createPublicClient({
  chain: NET.chain,
  transport: arcTransport(),
})
