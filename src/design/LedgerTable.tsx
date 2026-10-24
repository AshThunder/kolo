import { ReceiptLink } from './ReceiptLink'
import { ChainBadge } from './ChainBadge'
import { formatUsdc } from '../lib/money'

export interface LedgerRow {
  contributor: string
  displayName?: string
  chain: 'arc' | 'base' | 'solana' | 'cctp'
  amount: bigint
  txHash: string
  logIndex?: number
}

interface Props {
  rows: LedgerRow[]
  hideNames?: boolean
}

function initials(name: string) {
  if (/^0x/i.test(name)) return name.slice(2, 4).toUpperCase() // address: first two hex digits
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export function LedgerTable({ rows, hideNames }: Props) {
  if (!rows.length) return null
  return (
    <table className="w-full border-collapse text-[14px]">
      <thead>
        <tr>
          <th className="eyebrow text-left pb-2 pr-3 border-b border-line">Contributor</th>
          <th className="eyebrow text-left pb-2 pr-3 border-b border-line">From</th>
          <th className="eyebrow text-right pb-2 pr-3 border-b border-line">Amount</th>
          <th className="eyebrow text-right pb-2 border-b border-line">Receipt</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const name = hideNames ? 'Contributor' : (r.displayName || `${r.contributor.slice(0, 6)}…${r.contributor.slice(-4)}`)
          return (
            <tr key={i} className="border-b border-line">
              <td className="py-3 pr-3">
                <span className="inline-flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-paper border border-line grid place-items-center font-semibold text-[12px]">
                    {initials(name)}
                  </span>
                  {name}
                </span>
              </td>
              <td className="py-3 pr-3"><ChainBadge chain={r.chain} /></td>
              <td className="py-3 pr-3 text-right num font-medium">{formatUsdc(r.amount)}</td>
              <td className="py-3 text-right"><ReceiptLink txHash={r.txHash} logIndex={r.logIndex} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
