import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export const PAYEE_KINDS = ['School', 'Vendor', 'Hospital'] as const

/** Off-chain display names, keyed by on-chain nameHash. The server only stores a name when keccak256(name) matches the registry. */
export function usePayeeNames() {
  const { data } = useQuery({ queryKey: ['payee-names'], queryFn: () => api<Record<string, string>>('/payees'), staleTime: 60_000, retry: 1 })
  const names = data ?? {}
  /** Real name if the registry hash has a published preimage, otherwise "School #002". */
  const payeeLabel = (id: number, kind: number, nameHash?: string) =>
    (nameHash && names[nameHash.toLowerCase()]) || (nameHash && names[nameHash]) || `${PAYEE_KINDS[kind] ?? 'Payee'} #${String(id).padStart(3, '0')}`
  return { names, payeeLabel }
}
