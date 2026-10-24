import { useReadContracts } from 'wagmi'
import { KOLO_GROUP_POT_ABI } from '../abi/KoloGroupPot'
import { KOLO_TUITION_POT_ABI } from '../abi/KoloTuitionPot'
import { ARC_CHAIN_ID } from '../addresses'

export function useGroupPot(address: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: address ? [
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'organizer' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'target' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'deadline' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'state' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'totalContributed' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'totalReleased' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'totalRefunded' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeCount' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'threshold' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'coSignerCount' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'milestoneCount' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'invoiceCount' },
      { address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'paused' },
    ] : [],
    query: { enabled: !!address },
  })
  return {
    organizer:        data?.[0]?.result as string | undefined,
    target:           data?.[1]?.result,
    deadline:         data?.[2]?.result as bigint | undefined,
    state:            data?.[3]?.result,
    totalContributed: data?.[4]?.result,
    totalReleased:    data?.[5]?.result,
    totalRefunded:    data?.[6]?.result,
    payeeCount:       data?.[7]?.result,
    threshold:        data?.[8]?.result,
    coSignerCount:    data?.[9]?.result,
    milestoneCount:   data?.[10]?.result,
    invoiceCount:     data?.[11]?.result,
    paused:           data?.[12]?.result,
    isLoading,
    refetch,
  }
}

export function useTuitionPot(address: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: address ? [
      { address, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'organizer' },
      { address, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'deadline' },
      { address, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeId' },
      { address, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'state' },
      { address, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'totalContributed' },
      { address, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'totalReleased' },
      { address, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'totalRefunded' },
      { address, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'termCount' },
      { address, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'threshold' },
      { address, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'paused' },
    ] : [],
    query: { enabled: !!address },
  })
  return {
    organizer:        data?.[0]?.result as string | undefined,
    deadline:         data?.[1]?.result as bigint | undefined,
    payeeId:          data?.[2]?.result,
    state:            data?.[3]?.result,
    totalContributed: data?.[4]?.result,
    totalReleased:    data?.[5]?.result,
    totalRefunded:    data?.[6]?.result,
    termCount:        data?.[7]?.result,
    threshold:        data?.[8]?.result,
    paused:           data?.[9]?.result,
    isLoading,
    refetch,
  }
}

const MS_STATUS = ['Open', 'Partial', 'Done'] as const
const label32 = (h: string, i: number) => {
  // bytes32 labels are a left-aligned string when printable, otherwise a hash: fall back to "Milestone N".
  const bytes = h.slice(2).match(/../g)?.map(b => parseInt(b, 16)) ?? []
  const end = bytes.indexOf(0) === -1 ? bytes.length : bytes.indexOf(0)
  const txt = bytes.slice(0, end)
  return end > 0 && bytes.slice(end).every(b => b === 0) && txt.every(b => b >= 32 && b < 127) ? String.fromCharCode(...txt) : `Milestone ${i + 1}`
}
/** On-chain milestones of a GroupPot (label, cap, released, status). */
export function useMilestones(address: `0x${string}` | undefined, count: number) {
  const { data } = useReadContracts({
    contracts: address ? Array.from({ length: count }, (_, i) => ({ address, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'milestones' as const, args: [BigInt(i)] as const })) : [],
    query: { enabled: !!address && count > 0 },
  })
  return (data ?? []).flatMap((r, i) => {
    const m = r.result as readonly [string, number, bigint, bigint, number] | undefined
    return m ? [{ index: i + 1, label: label32(m[0], i), amount: m[2], cap: m[2], status: (MS_STATUS[m[4]] ?? 'Open') }] : []
  })
}
