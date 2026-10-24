import { useParams, Link } from 'react-router-dom'
import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { toast } from 'sonner'
import { ArrowLeft, Undo2 } from 'lucide-react'
import { KoloLayout } from '../../components/KoloLayout'
import { Button } from '../../design/Button'
import { Seal } from '../../design/Seal'
import { KOLO_FACTORY_ABI } from '../../abi/KoloFactory'
import { KOLO_GROUP_POT_ABI } from '../../abi/KoloGroupPot'
import { KOLO_ADDRESSES } from '../../config'
import { usePotBySlug } from '../../hooks/usePotMeta'
import { formatUsdc } from '../../lib/money'
import { ARC_CHAIN_ID } from '../../addresses'

export default function RefundClaim() {
  const { slug } = useParams<{ slug: string }>()
  const potMeta = usePotBySlug(slug ?? '')
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const { data: potAddress } = useReadContract({
    address: KOLO_ADDRESSES.factory,
    abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'potAddress',
    args: [BigInt(potMeta?.potId ?? 0)],
    query: { enabled: !!potMeta?.potId },
  })
  const addr = potAddress

  const { data: contributed } = useReadContract({
    address: addr,
    abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'contributed',
    args: address ? [address] : undefined,
    query: { enabled: !!addr && !!address },
  })
  const { data: refundClaimed } = useReadContract({
    address: addr,
    abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'refundClaimed',
    args: address ? [address] : undefined,
    query: { enabled: !!addr && !!address },
  })
  const { data: totalContributed } = useReadContract({
    address: addr,
    abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'totalContributed',
    query: { enabled: !!addr },
  })
  const rd = (functionName: 'totalReleased' | 'totalRefunded' | 'totalUnrefundedContrib') => ({ address: addr, abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID, functionName, query: { enabled: !!addr } } as const)
  const { data: totalReleased } = useReadContract(rd('totalReleased'))
  const { data: totalRefunded } = useReadContract(rd('totalRefunded'))
  const { data: totalUnrefunded } = useReadContract(rd('totalUnrefundedContrib'))
  const { data: state } = useReadContract({
    address: addr,
    abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'state',
    query: { enabled: !!addr },
  })

  const contrib = contributed ?? 0n
  const tc = totalContributed ?? 0n
  const claimed = !!refundClaimed
  // Mirror claimRefund(): share = contrib × remaining / totalUnrefundedContrib (last claimant gets the rest)
  const remaining = tc - (totalReleased ?? 0n) - (totalRefunded ?? 0n)
  const denom = totalUnrefunded ?? 0n
  const share = contrib === 0n || denom === 0n ? 0n : denom === contrib ? remaining : (contrib * remaining) / denom
  const stateNum = state
  const isRefunding = stateNum === 1

  async function handleClaim() {
    if (!addr || !address) { toast.error('Sign in to claim'); return }
    try {
      const hash = await writeContractAsync({
        address: addr,
        abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID,
        functionName: 'claimRefund',
        args: [],
      })
      toast.success('Refund claimed', { description: hash.slice(0, 10) + '…' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rejected')) toast.error('Transaction rejected in wallet')
      else if (msg.includes('already')) toast.error('Refund already claimed')
      else toast.error('Refund failed', { description: msg.slice(0, 80) })
    }
  }

  const pct = denom > 0n ? Number((contrib * 10000n) / denom) / 100 : 0

  if (!potMeta) return <KoloLayout><div className="py-20 text-center text-ink-3">Finding pot on Arc…</div></KoloLayout>

  return (
    <KoloLayout>
      <div className="max-w-lg mx-auto py-10 text-center">
        <Link to={`/p/${slug}`} className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink mb-5 text-[14px]">
          <ArrowLeft size={16} />Back to pot
        </Link>

        <img src="/assets/illustrations/refund-return.svg" alt="Refund" className="w-36 mx-auto mb-6 opacity-80" />

        <h1 className="font-display text-[36px] font-medium mb-3">
          {claimed ? 'Refund claimed.' : isRefunding ? 'Refund available.' : 'Pot not in refund state.'}
        </h1>

        {!claimed && contrib > 0n && (
          <div className="bg-surface border border-line rounded-lg p-6 mb-6">
            <p className="eyebrow mb-1">Your share</p>
            <div className="font-display text-[44px] font-medium num">{formatUsdc(share)}<span className="font-mono text-[16px] text-ink-3 ml-1.5">USDC</span></div>
            <p className="text-ink-3 text-[14px] mt-1">Pro-rata {pct.toFixed(1)}% of the unspent {formatUsdc(remaining)} USDC · you put in {formatUsdc(contrib)} USDC</p>
          </div>
        )}

        {!address && (
          <p className="text-ink-2 mb-6">Sign in with the wallet you contributed from to see and claim your share. Released invoices are not refundable; everything still in the pot is split pro-rata.</p>
        )}
        {address && !claimed && contrib === 0n && (
          <p className="text-ink-2 mb-6">This wallet didn't contribute to this pot, so there's nothing to claim.</p>
        )}

        {claimed && (
          <div className="flex flex-col items-center gap-4 mt-4">
            <Seal released />
            <p className="text-ink-2">Your refund was returned. Check your wallet balance.</p>
          </div>
        )}

        {!claimed && isRefunding && contrib > 0n && (
          <Button variant="green" fullWidth onClick={() => { void handleClaim() }} data-testid="claim-refund-btn">
            <Undo2 size={16} />Claim {formatUsdc(share)} USDC
          </Button>
        )}

        {!isRefunding && !claimed && (
          <p className="text-ink-3 text-[14px]">Refunds are only available when the pot is in Refunding state (deadline passed without full release).</p>
        )}
      </div>
    </KoloLayout>
  )
}
