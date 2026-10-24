/**
 * Pot resolution — works in any browser.
 * A pot link is /pot/<potId> or /pot/<potAddress>. Address + type come from the factory on-chain;
 * the title comes from the Kolo server, which only stores titles matching the on-chain titleHash.
 */
import { useEffect, useState } from 'react'
import { useReadContract } from 'wagmi'
import { isAddress } from 'viem'
import { KOLO_FACTORY_ABI } from '../abi/KoloFactory'
import { KOLO_GROUP_POT_ABI } from '../abi/KoloGroupPot'
import { KOLO_ADDRESSES, ARC_CHAIN_ID } from '../addresses'
import { api } from '../lib/api'

export interface PotMeta {
  potId: number
  address: string
  title: string
  slug: string      // canonical link segment = potId
  potType: 0 | 1    // 0=GroupPot 1=TuitionPot
  createdAt: number
}
export interface ServerPot { id: number; address: string; type: 'group' | 'tuition'; title: string | null; organizer: string; deadline: number; state: number; totalContributed: string }

const titleCache = new Map<number, string | null>()
export function usePotTitle(potId: number | undefined) {
  const [title, setTitle] = useState<string | null | undefined>(potId ? titleCache.get(potId) : undefined)
  useEffect(() => {
    if (!potId || titleCache.has(potId)) { if (potId) setTitle(titleCache.get(potId)); return }
    let alive = true
    api<ServerPot>(`/pots/${potId}`).then(p => { titleCache.set(potId, p.title); if (alive) setTitle(p.title) }).catch(() => { if (alive) setTitle(null) })
    return () => { alive = false }
  }, [potId])
  return title
}

/** ref = numeric potId or pot contract address. */
export function usePotRef(ref: string | undefined): PotMeta | undefined {
  const byAddr = !!ref && isAddress(ref)
  const numeric = ref && /^\d+$/.test(ref) ? Number(ref) : undefined
  const { data: idFromAddr } = useReadContract({
    address: byAddr ? (ref) : undefined, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'potId', query: { enabled: byAddr },
  })
  const potId = numeric ?? (idFromAddr !== undefined ? Number(idFromAddr) : undefined)
  const enabled = !!potId
  const { data: address } = useReadContract({ address: KOLO_ADDRESSES.factory, abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID, functionName: 'potAddress', args: [BigInt(potId ?? 0)], query: { enabled } })
  const { data: potType } = useReadContract({ address: KOLO_ADDRESSES.factory, abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID, functionName: 'potType', args: [BigInt(potId ?? 0)], query: { enabled } })
  const title = usePotTitle(potId)
  if (!potId || !address || address === '0x0000000000000000000000000000000000000000' || potType === undefined) return undefined
  return { potId, address, title: title ?? `Pot #${potId}`, slug: String(potId), potType: Number(potType) === 1 ? 1 : 0, createdAt: 0 }
}
/** Back-compat alias used by pages. */
export const usePotBySlug = (slug: string) => usePotRef(slug)

/** All pots (from the server indexer). */
export function useAllPots() {
  const [pots, setPots] = useState<ServerPot[] | undefined>()
  useEffect(() => { api<ServerPot[]>('/pots').then(setPots).catch(() => setPots([])) }, [])
  return pots
}

export async function registerTitle(potId: number, title: string) {
  titleCache.set(potId, title)
  return api<{ ok: boolean; error?: string }>('/meta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ potId, title }) })
}
