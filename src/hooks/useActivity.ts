import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ServerLedgerRow } from './usePotLedger'

export interface TimelineRow { ts: number; event: string; tx: string; logIndex: number; invoiceId?: number; payeeIdx?: number; payeeId?: number; actor?: string; amount?: string; uphold?: boolean; reasonHash?: string; reason?: string; termIndex?: number; milestoneId?: number }
export interface PayeeUpcoming { potId: number; termIndex: number; dueDate: number; amount: string }
export interface PayeeActivity {
  payeeId: number
  pots: number[]
  payments: (ServerLedgerRow & { potId: number })[]
  upcoming: PayeeUpcoming[]
  disputes: (TimelineRow & { potId: number })[]
}

/** Every pot event (invoices, approvals, disputes, releases, refunds, milestones), straight from the Arc log index. */
export function usePotTimeline(potId: number | undefined) {
  return useQuery({ queryKey: ['timeline', potId], queryFn: () => api<TimelineRow[]>(`/pots/${potId}/timeline`), enabled: !!potId, staleTime: 15_000, retry: 1 })
}

export function usePayeeActivity(payeeId: number | undefined) {
  return useQuery({ queryKey: ['payee-activity', payeeId], queryFn: () => api<PayeeActivity>(`/payees/${payeeId}/activity`), enabled: !!payeeId, staleTime: 30_000, retry: 1 })
}

export interface Application { id: number; kind: 'school' | 'vendor' | 'hospital'; name: string; wallet: string; country?: string; regNo?: string; submittedAt: string; status: 'pending' | 'registered' | 'rejected'; reference?: string; rejectReason?: string }
/** The queue is admin-only: the registrar signs a short-lived message and the server checks the signer holds a registry role. */
export const adminMessage = (addr: string, ts: string, action = 'view payee applications') => `Kolo admin: ${action}\naddress: ${addr.toLowerCase()}\ntimestamp: ${ts}`
export function useApplications(addr: string | undefined, signMessageAsync: (a: { message: string }) => Promise<string>) {
  return useMutation({
    mutationFn: async () => {
      const ts = String(Date.now()); const sig = await signMessageAsync({ message: adminMessage(addr!, ts) })
      return api<Application[]>('/payees/applications', { headers: { 'x-kolo-admin-addr': addr!, 'x-kolo-admin-ts': ts, 'x-kolo-admin-sig': sig } })
    },
  })
}

/** Reject one pending application with an optional reason (shown to the applicant). Signed per action so a captured "view" signature cannot reject. */
export function useRejectApplication(addr: string | undefined, signMessageAsync: (a: { message: string }) => Promise<string>) {
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const ts = String(Date.now()); const sig = await signMessageAsync({ message: adminMessage(addr!, ts, `reject application ${id}`) })
      return api<{ ok: boolean }>(`/payees/applications/${id}/reject`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kolo-admin-addr': addr!, 'x-kolo-admin-ts': ts, 'x-kolo-admin-sig': sig }, body: JSON.stringify({ reason: reason?.trim() || undefined }) })
    },
  })
}

export interface StatusStep { key: string; label: string; state: 'done' | 'current' | 'pending' | 'failed'; at?: string; tx?: string; note?: string }
export type ApplicationStatus = { found: false } | { found: true; reference: string | null; name: string | null; kind: 'school' | 'vendor' | 'hospital'; wallet: string; submittedAt: string | null; stage: 'review' | 'registered' | 'verified' | 'revoked' | 'rejected'; steps: StatusStep[]; payeeId: number | null; contact: { telegram: string; url: string } }
