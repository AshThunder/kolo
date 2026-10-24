import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { createPublicClient, http } from 'viem'
import { NET } from '../../network'
import { BadgeCheck, ExternalLink } from 'lucide-react'
import { KoloLayout } from '../../components/KoloLayout'
import { Seal } from '../../design/Seal'
import { Button } from '../../design/Button'
import { BRAND } from '../../brand'
import { verifyReceipt, type ReceiptResult } from '../../lib/verify'

const client = createPublicClient({ chain: NET.chain, transport: http(NET.rpc) })

export default function VerifyReceipt() {
  const { chain, tx, log } = useParams<{ chain: string; tx: string; log: string }>()
  const logIndex = Number(log ?? 0)
  const [result, setResult] = useState<ReceiptResult>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!tx || !chain) return
    let alive = true
    setResult(undefined); setFailed(false)
    verifyReceipt(client as never, chain, tx, logIndex).then(r => { if (alive) setResult(r) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [tx, logIndex, chain])

  const loading = !result && !failed
  const checks = result?.checks ?? (failed ? [{ label: 'Verification error', detail: 'Could not read from Arc. Try again in a moment.', ok: false }] : [])
  const overall = result ? (result.pass ? 'pass' : 'fail') : failed ? 'fail' : null
  const amount = result?.amount
  const timestamp = result?.timestamp

  const receiptId = tx ? `KOLO-${result?.kind ?? 'C'}-${tx.slice(2, 8)}-${logIndex}` : '—'

  return (
    <KoloLayout>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 py-12">
        <div>
          <p className="eyebrow">Receipt verification</p>
          <h1 className="font-display text-[40px] font-medium leading-[1.1] mt-2.5 mb-2">
            {loading ? 'Checking…' : overall === 'pass' ? 'This receipt matches the chain.' : 'Verification failed.'}
          </h1>
          <p className="text-ink-2">
            Your browser re-read Arc for <span className="font-mono">{receiptId}</span>. Nothing here relies on the Kolo server.
          </p>

          <div className="mt-6 border-t-2 border-ink divide-y divide-line">
            {loading ? (
              <p className="py-6 text-ink-3 font-mono text-[14px]">Reading Arc…</p>
            ) : checks.map((c, i) => (
              <div key={i} className="flex items-start gap-3 py-3.5">
                {c.ok
                  ? <BadgeCheck size={20} strokeWidth={2} className="text-green flex-shrink-0 mt-0.5" />
                  : <span className="w-5 h-5 rounded-full bg-danger/10 border border-danger text-danger text-[12px] grid place-items-center flex-shrink-0 mt-0.5">✕</span>
                }
                <div>
                  <p className="font-semibold text-[15px]">{c.label}</p>
                  <p className="font-mono text-[12px] text-ink-3 mt-0.5">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2.5 mt-6">
            <Button variant="ghost" size="sm" onClick={() => window.open(`${BRAND.explorerBase}/tx/${tx}`, '_blank')}>
              <ExternalLink size={15} />Open in explorer
            </Button>
            {result?.potId && <Link to={`/p/${result.potId}`}><Button variant="ghost" size="sm">View public pot</Button></Link>}
          </div>
        </div>

        {/* Right: result seal */}
        <div>
          <div className="bg-surface border border-line rounded-lg p-10 text-center">
            {!loading && <Seal released={overall === 'pass'} size={150} />}
            {amount && (
              <>
                <div className="font-display text-[44px] font-medium num mt-4">{amount}<span className="font-mono text-[16px] text-ink-3 ml-1.5">USDC</span></div>
                <p className="text-ink-3 mt-1">{timestamp}</p>
              </>
            )}
          </div>
          <div className="mt-3 border border-line rounded-[12px] p-4 flex items-start gap-3">
            <span className="text-ink-3 mt-0.5">ⓘ</span>
            <div>
              <p className="font-semibold text-[14px]">Verification failures show the reason</p>
              <p className="text-[13px] text-ink-2 mt-0.5">A receipt only passes when its event, pot, payee and USDC movement all match what Arc recorded.</p>
            </div>
          </div>
        </div>
      </div>
    </KoloLayout>
  )
}
