/**
 * Receipt generation — PDF (pdf-lib) + PNG (html-to-image)
 * Types only; actual render is in ReceiptModal component.
 */
import { formatUsdcExact } from './money'
import { buildReceiptId, buildVerifyUrl } from '../hooks/useCsvExport'

export type ReceiptKind = 'C' | 'R' | 'F' | 'T'

export interface ReceiptData {
  kind: ReceiptKind
  amount: bigint
  potTitle: string
  potAddress: string
  payeeName: string
  payeeLabel: string
  from: string
  originChain?: string
  txHash: string
  blockNumber: bigint
  timestamp: number   // unix
  logIndex: number
}

export function receiptId(r: ReceiptData) {
  return buildReceiptId(r.kind, r.txHash, r.logIndex)
}

export function receiptVerifyUrl(r: ReceiptData) {
  return buildVerifyUrl(r.txHash, r.logIndex)
}

export function receiptTypeLabel(kind: ReceiptKind) {
  return { C: 'Contribution', R: 'Release', F: 'Refund', T: 'Term Payment' }[kind]
}

export function formatReceiptAmount(amount: bigint) {
  return formatUsdcExact(amount)
}
