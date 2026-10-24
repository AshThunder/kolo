import { useEffect, useState } from 'react'
import { useReadContracts } from 'wagmi'
import { KOLO_TUITION_POT_ABI } from '../abi/KoloTuitionPot'
import { api, API_BASE } from '../lib/api'
import type { LedgerRow } from '../design/LedgerTable'
import { ARC_CHAIN_ID } from '../addresses'

export interface ServerLedgerRow { ts: number; event: string; party: string; amount: string; ref: string; tx: string; logIndex: number; verify: string; origin?: 'arc' | 'base' | 'solana' | 'cctp' }

/** Contribution ledger from the Kolo indexer (Arc event logs). Every row links to /verify. */
export function usePotLedger(potId: number | undefined) {
  const [all, setAll] = useState<ServerLedgerRow[] | undefined>()
  useEffect(() => { if (potId) api<ServerLedgerRow[]>(`/pots/${potId}/ledger`).then(setAll).catch(() => setAll([])) }, [potId])
  const money = (all ?? []).filter(r => r.event === 'Contributed' || r.event === 'Pulled')
  const rows: LedgerRow[] = money.slice().reverse().map(r => ({ contributor: r.party, chain: r.origin ?? 'arc', amount: BigInt(Math.round(Number(r.amount) * 1e6)), txHash: r.tx, logIndex: r.logIndex }))
  const contributors = new Set(money.map(r => r.party.toLowerCase())).size
  return { rows, contributors, events: all, loading: all === undefined, csvUrl: potId ? `${API_BASE}/pots/${potId}/csv` : undefined }
}

const fmtDate = (s: number) => new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
/** Tuition term schedule read straight from the pot. */
export function useTuitionTerms(address: `0x${string}` | undefined, termCount: bigint | number | undefined, balance?: bigint) {
  const n = Number(termCount ?? 0)
  const { data } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({ address: address!, abi: KOLO_TUITION_POT_ABI, chainId: ARC_CHAIN_ID, functionName: 'terms', args: [BigInt(i)] } as const)),
    query: { enabled: !!address && n > 0 },
  })
  const [now] = useState(() => Date.now() / 1000)
  return (data ?? []).map((d, i) => {
    const t = d.result as readonly [number | bigint, bigint, number, string] | undefined
    const due = Number(t?.[0] ?? 0), amount = BigInt(t?.[1] ?? 0), paid = Number(t?.[2] ?? 0) === 1
    const status: 'Pending' | 'Paid' | 'Due' | 'Short' = paid ? 'Paid' : due <= now ? (balance !== undefined && balance < amount ? 'Short' : 'Due') : 'Pending'
    return { label: `Term ${i + 1}`, dueDate: due ? fmtDate(due) : '—', amount, status, shortfall: status === 'Short' && balance !== undefined ? amount - balance : undefined }
  })
}
