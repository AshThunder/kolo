import { useReadContract, useReadContracts } from 'wagmi'
import { KOLO_GROUP_POT_ABI } from '../abi/KoloGroupPot'
import { KOLO_TUITION_POT_ABI } from '../abi/KoloTuitionPot'
import { PAYEE_REGISTRY_ABI } from '../abi/PayeeRegistry'
import { KOLO_ADDRESSES } from '../addresses'
import { usePayeeNames } from './usePayeeNames'
import { ARC_CHAIN_ID } from '../addresses'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** The sealed payee of a pot: registry payee (kind + status) or a raw address locked at creation. */
export function usePotPayee(pot: `0x${string}` | undefined, isGroup: boolean) {
  const { data } = useReadContracts({
    contracts: pot ? (isGroup
      ? [{ address: pot, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeIds', args: [0n] },
         { address: pot, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeAddresses', args: [0n] }]
      : [{ address: pot, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeId' }]) : [],
    query: { enabled: !!pot },
  })
  const payeeId = Number((data?.[0]?.result) ?? 0)
  const rawAddr = data?.[1]?.result as string | undefined
  const { data: info } = useReadContract({ address: KOLO_ADDRESSES.payeeRegistry, abi: PAYEE_REGISTRY_ABI, chainId: ARC_CHAIN_ID, functionName: 'payeeInfo', args: [BigInt(payeeId)], query: { enabled: payeeId > 0 } })
  const { payeeLabel: nameFor } = usePayeeNames()
  const pi = info as readonly [number, number, string, string, string, string, bigint, bigint] | undefined
  if (!data) return { payeeId, payeeName: '—', payeeLabel: 'Reading Arc…', wallet: '—', verified: false }
  if (payeeId === 0) return { payeeId, payeeName: 'Direct address', payeeLabel: 'Fixed wallet', wallet: rawAddr ? short(rawAddr) : '—', fullWallet: rawAddr, verified: false }
  const verified = pi?.[1] === 2
  return { payeeId, payeeName: nameFor(payeeId, pi?.[0] ?? 1, pi?.[3]), payeeLabel: `${verified ? 'Verified' : 'Registered'} payee · registry #${payeeId}`,
    wallet: pi ? short(pi[2]) : '—', fullWallet: pi?.[2], verified }
}
