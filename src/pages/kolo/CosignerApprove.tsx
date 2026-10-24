import { PotGovernance } from '../../components/PotGovernance'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import { ArrowLeft, BadgeCheck, AlertTriangle } from 'lucide-react'
import { KoloLayout } from '../../components/KoloLayout'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Skeleton } from '../../design/Skeleton'
import { KOLO_FACTORY_ABI } from '../../abi/KoloFactory'
import { KOLO_GROUP_POT_ABI } from '../../abi/KoloGroupPot'
import { KOLO_ADDRESSES } from '../../config'
import { usePotBySlug } from '../../hooks/usePotMeta'
import { formatUsdc } from '../../lib/money'
import { ARC_CHAIN_ID } from '../../addresses'

export default function CosignerApprove() {
  const { slug, invoiceId } = useParams<{ slug: string; invoiceId: string }>()
  const potMeta = usePotBySlug(slug ?? '')
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: ARC_CHAIN_ID })

  const { data: potAddress } = useReadContract({
    address: KOLO_ADDRESSES.factory,
    abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'potAddress',
    args: [BigInt(potMeta?.potId ?? 0)],
    query: { enabled: !!potMeta?.potId },
  })
  const addr = potAddress

  const { data: invoice, isLoading } = useReadContract({
    address: addr,
    abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'invoices',
    args: [BigInt(invoiceId ?? 0)],
    query: { enabled: !!addr && !!invoiceId },
  })
  const inv = invoice as readonly [number, number, number, bigint, string, string, bigint, bigint, number, number, number] | undefined

  async function handleApprove() {
    if (!addr || !address) { toast.error('Sign in to approve'); return }
    try {
      const hash = await writeContractAsync({
        address: addr,
        abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID,
        functionName: 'approve',
        args: [BigInt(invoiceId ?? 0)],
      })
      await client!.waitForTransactionReceipt({ hash })
      toast.success('Invoice approved', { description: hash.slice(0, 10) + '…' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rejected')) toast.error('Transaction rejected in wallet')
      else toast.error('Approval failed', { description: msg.slice(0, 80) })
    }
  }

  if (!potMeta) return <KoloLayout><div className="py-20 text-center text-ink-3">Finding pot on Arc…</div></KoloLayout>

  return (
    <KoloLayout>
      <div className="max-w-lg mx-auto py-10">
        <Link to={`/p/${slug}`} className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink mb-5 text-[14px]">
          <ArrowLeft size={16} />Back to pot
        </Link>
        <p className="eyebrow mb-1">Co-signer approval</p>
        <h1 className="font-display text-[32px] font-medium mb-6">{potMeta.title}</h1>

        {isLoading && <Skeleton rows={2} />}

        {inv && (
          <div className="space-y-4">
            <div className="bg-surface border border-line rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Invoice #{invoiceId}</span>
                <Chip variant={inv[2] === 5 ? 'warn' : inv[2] === 1 || inv[2] === 4 ? 'neutral' : 'green'}>
                  {['—', 'Pending', 'Approved', 'Released', 'Cancelled', 'Disputed'][inv[2]] ?? '?'}
                </Chip>
              </div>
              <div className="font-mono text-[13px] text-ink-3">
                sha256 {(inv[4]).slice(0, 12)}…{(inv[4]).slice(-4)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-2">Amount</span>
                <span className="font-display text-[22px] font-medium num">{formatUsdc(inv[3])} USDC</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 bg-paper rounded-[12px] border border-line p-4">
              <BadgeCheck size={18} strokeWidth={2} className="text-green flex-shrink-0 mt-0.5" />
              <p className="text-[14px] text-ink-2">
                By approving, you confirm the invoice matches the goods or services agreed, and authorise release of {formatUsdc(inv[3])} USDC to the locked payee.
              </p>
            </div>

            {inv[2] === 5 && (
              <div className="flex items-start gap-2.5 bg-warn-soft/40 rounded-[12px] border border-warn p-4">
                <AlertTriangle size={18} strokeWidth={2} className="text-warn flex-shrink-0 mt-0.5" />
                <p className="text-[14px] text-ink">This invoice is disputed. Re-vote carefully.</p>
              </div>
            )}

            {inv[2] === 1 && (
              <Button variant="green" fullWidth onClick={() => { void handleApprove() }} data-testid="cosign-approve">
                Approve release
              </Button>
            )}
            {addr && <PotGovernance pot={addr} potId={Number(potMeta.potId)} />}
          </div>
        )}

        {!isLoading && !inv && (
          <p className="text-ink-3">Invoice #{invoiceId} not found.</p>
        )}
      </div>
    </KoloLayout>
  )
}
