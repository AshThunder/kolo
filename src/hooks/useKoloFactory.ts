import { useReadContracts, useBlockNumber } from 'wagmi'
import { KOLO_ADDRESSES } from '../config'
import { KOLO_FACTORY_ABI } from '../abi/KoloFactory'
import { ARC_CHAIN_ID } from '../addresses'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { toMicro } from '../lib/money'

const addr = KOLO_ADDRESSES.factory

export function useGlobalStats() {
  const { data: block } = useBlockNumber({ watch: true, chainId: ARC_CHAIN_ID })
  const { data, isLoading, isError } = useReadContracts({
    contracts: [
      { address: addr, abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID, functionName: 'globalStats' },
      { address: addr, abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID, functionName: 'potCount' },
    ],
  })
  // Same numbers from Kolo's indexer when this browser cannot read the chain, so the figures are never a silent zero.
  const chainOk = !!data?.[0]?.result
  const snap = useQuery({ queryKey: ['stats'], queryFn: () => api<{ locked: string; released: string; refunded: string; pots: number }>('/stats'), enabled: !isLoading && !chainOk, staleTime: 15_000, retry: 1 })

  const statsResult = data?.[0]?.result
  const potCount = data?.[1]?.result
  const fromApi = !chainOk && snap.data
  return {
    locked:    statsResult?.[0] ?? (fromApi ? toMicro(snap.data.locked) : 0n),
    released:  statsResult?.[1] ?? (fromApi ? toMicro(snap.data.released) : 0n),
    refunded:  statsResult?.[2] ?? (fromApi ? toMicro(snap.data.refunded) : 0n),
    potCount:  potCount ?? (fromApi ? BigInt(snap.data.pots) : 0n),
    blockNumber: block,
    isLoading: isLoading || (!chainOk && snap.isPending),
    isError: (isError || !chainOk) && snap.isError,
  }
}
