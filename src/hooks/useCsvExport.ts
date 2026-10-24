/**
 * CSV ledger export — columns per DESIGN.md §9.3
 */

import { BRAND } from '../brand'
import { formatUsdcExact as formatUsdc } from '../lib/money'
import { ARC_CHAIN_ID } from '../addresses'

interface LedgerEntry {
  timestamp_utc: string
  type: string
  contributor_display: string
  contributor_address: string
  origin_chain: string
  amount_usdc: string
  arc_tx: string
  log_index: number
  receipt_id: string
  verify_url: string
}

export function exportCsv(rows: LedgerEntry[], filename: string) {
  const cols: Array<keyof LedgerEntry> = [
    'timestamp_utc', 'type', 'contributor_display', 'contributor_address',
    'origin_chain', 'amount_usdc', 'arc_tx', 'log_index', 'receipt_id', 'verify_url',
  ]
  const header = cols.join(',')
  const lines = rows.map(r =>
    cols.map(c => JSON.stringify(String(r[c] ?? ''))).join(',')
  )
  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function buildReceiptId(type: 'C' | 'R' | 'F' | 'T', txHash: string, logIndex: number) {
  return `KOLO-${type}-${txHash.slice(2, 8)}-${logIndex}`
}

export function buildVerifyUrl(txHash: string, logIndex: number) {
  return `https://${BRAND.domain}/verify/r/${ARC_CHAIN_ID}/${txHash}/${logIndex}`
}

export { formatUsdc }

/** Generic CSV download (header + rows of strings). Amounts passed in must already be exact decimals. */
export function exportRows(header: string[], rows: string[][], filename: string) {
  const csv = [header.join(','), ...rows.map(r => r.map(c => JSON.stringify(String(c ?? ''))).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}
