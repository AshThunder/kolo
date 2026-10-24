import { useState } from 'react'
import { useAccount, useWriteContract, usePublicClient, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { Modal } from '../design/Modal'
import { AmountInput } from '../design/Field'
import { Button } from '../design/Button'
import { CrossChainTracker } from '../design/CrossChainTracker'
import { FxEstimate } from '../design/FxEstimate'
import { KOLO_GROUP_POT_ABI } from '../abi/KoloGroupPot'
import { parseUsdc } from '../onchain-money'
import { formatUsdc, formatDecimal } from '../lib/money'
import { useReadContract } from 'wagmi'
import { erc20Abi, encodeAbiParameters, pad, parseAbi } from 'viem'
import { KOLO_ADDRESSES } from '../addresses'
import { NET } from '../network'
import { API_BASE } from '../lib/api'
import { useFxRate } from '../hooks/useFxRate'
import { ARC_CHAIN_ID } from '../addresses'

const USDC_ADDR = NET.usdc
type Chain = 'arc' | 'base' | 'solana'

// CCTP V2: TokenMessengerV2 is deployed at the same address on every EVM chain of a network kind. Source = Base, Arc = domain 26.
const SRC_CHAIN = NET.source.chainId // the CCTP pay-in source chain (Base mainnet, or Base Sepolia on testnet)
const BASE_USDC = NET.source.usdc
const TOKEN_MESSENGER_V2 = NET.cctp.tokenMessenger
const ARC_DOMAIN = NET.cctp.domain
const BASE_DOMAIN = NET.source.domain
const TM_ABI = parseAbi(['function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)'])

interface Props {
  open: boolean
  onClose: () => void
  potAddress?: `0x${string}`
  potTitle?: string
}

export function ContributeModal({ open, onClose, potAddress, potTitle }: Props) {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const basePublicClient = usePublicClient({ chainId: SRC_CHAIN })
  const { switchChainAsync } = useSwitchChain()
  const [amount, setAmount] = useState('')
  const [chain, setChain] = useState<Chain>('arc')
  const [status, setStatus] = useState<'idle' | 'approving' | 'contributing' | 'tracking' | 'done'>('idle')
  type StepStatus = 'pending' | 'active' | 'done'
  interface Step { label: string; sub: string; status: StepStatus }
  const [txSteps, setTxSteps] = useState<Step[]>([
    { label: 'Approve USDC', sub: '', status: 'pending' },
    { label: 'Lock into pot', sub: '', status: 'pending' },
  ])
  const { rate, symbol } = useFxRate()

  const { data: balance } = useReadContract({
    address: USDC_ADDR,
    abi: erc20Abi,
    functionName: 'balanceOf', chainId: ARC_CHAIN_ID,
    args: address ? [address] : undefined,
    query: { enabled: !!address && chain === 'arc' },
  })
  const { data: baseBalance } = useReadContract({
    address: BASE_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: SRC_CHAIN,
    query: { enabled: !!address && chain === 'base' },
  })

  type Cc = { label: string; sub: string; status: StepStatus }
  const [ccSteps, setCcSteps] = useState<Cc[]>([])
  const setCc = (i: number, status: StepStatus, sub = '') => setCcSteps(s => s.map((st, j): Cc => j === i ? { ...st, status, sub: sub || st.sub } : st))

  // Burn on the source chain -> Circle attests -> Kolo's permissionless receiver mints on Arc and credits this pot.
  async function handleCrossChain(parsedAmount: bigint) {
    if (!address || !potAddress) return
    setStatus('approving')
    setCcSteps([
      { label: `Switch to ${NET.source.name}`, sub: '', status: 'active' },
      { label: 'Approve USDC', sub: '', status: 'pending' },
      { label: `Burn USDC on ${NET.source.name}`, sub: 'Standard finality, no fee', status: 'pending' },
      { label: 'Circle attestation', sub: `About ${NET.source.blocks.replace('about ', '')}`, status: 'pending' },
      { label: 'Credited on Arc', sub: '', status: 'pending' },
    ])
    try {
      await switchChainAsync({ chainId: SRC_CHAIN })
      setCc(0, 'done'); setCc(1, 'active')
      const approveTx = await writeContractAsync({ address: BASE_USDC, abi: erc20Abi, functionName: 'approve', args: [TOKEN_MESSENGER_V2, parsedAmount], chainId: SRC_CHAIN })
      await basePublicClient?.waitForTransactionReceipt({ hash: approveTx })
      setCc(1, 'done', approveTx.slice(0, 10) + '…'); setCc(2, 'active'); setStatus('contributing')
      const receiver = pad(KOLO_ADDRESSES.cctpReceiver, { size: 32 })
      const hookData = encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'bytes32' }], [potAddress, address, `0x${'0'.repeat(64)}`])
      const burnTx = await writeContractAsync({
        address: TOKEN_MESSENGER_V2, abi: TM_ABI, functionName: 'depositForBurnWithHook', chainId: SRC_CHAIN,
        args: [parsedAmount, ARC_DOMAIN, receiver, BASE_USDC, receiver, 0n, 2000, hookData],
      })
      const rc = await basePublicClient?.waitForTransactionReceipt({ hash: burnTx })
      if (rc && rc.status !== 'success') throw new Error('Burn reverted')
      setCc(2, 'done', burnTx.slice(0, 10) + '…'); setCc(3, 'active'); setStatus('tracking')
      await fetch(`${API_BASE}/cctp/burns`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceDomain: BASE_DOMAIN, tx: burnTx }) })
      toast.success('Burn confirmed', { description: 'Circle is attesting. Your contribution lands on Arc automatically.' })
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 15_000))
        const list = (await (await fetch(`${API_BASE}/cctp/burns`)).json()) as { tx: string; status: string; relayTx?: string }[]
        const mine = list.find(b => b.tx.toLowerCase() === burnTx.toLowerCase())
        if (mine?.status === 'relayed') { setCc(3, 'done'); setCc(4, 'done', mine.relayTx ? mine.relayTx.slice(0, 10) + '…' : ''); setStatus('done'); toast.success('Contribution credited on Arc'); return }
        if (mine?.status === 'failed') throw new Error('Relay failed')
      }
    } catch (err: unknown) {
      setStatus('idle'); setCcSteps([])
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rejected')) toast.error('Transaction rejected in wallet')
      else toast.error('Cross-chain pay-in failed', { description: msg.slice(0, 80) })
    }
  }

  async function handleContribute() {
    if (!address) { toast.error('Sign in to contribute'); return }
    if (!potAddress) { toast.error('Pot not found'); return }
    if (!amount || Number(amount) <= 0) { toast.error('Enter an amount'); return }

    if (chain === 'solana') {
      toast.info('Solana pay-in is not live yet. Use Arc or Base.', { duration: 4000 })
      return
    }
    if (chain === 'base') { await handleCrossChain(parseUsdc(amount)); return }

    const parsedAmount = parseUsdc(amount)
    const parsedAmountBig = parsedAmount

    setStatus('approving')
    setTxSteps(s => s.map((st, i): Step => i === 0 ? { ...st, status: 'active' } : st))

    try {
      const approveTx = await writeContractAsync({
        address: USDC_ADDR,
        abi: erc20Abi,
        functionName: 'approve',
        args: [potAddress, parsedAmountBig], chainId: ARC_CHAIN_ID,
      })
      await publicClient?.waitForTransactionReceipt({ hash: approveTx })
      setTxSteps(s => s.map((st, i): Step => i === 0 ? { ...st, status: 'done', sub: approveTx.slice(0, 10) + '…' } : i === 1 ? { ...st, status: 'active' } : st))
      setStatus('contributing')

      const contribTx = await writeContractAsync({
        address: potAddress,
        abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID,
        functionName: 'contribute',
        args: [parsedAmountBig, `0x${'0'.repeat(64)}`],
      })
      const rc = await publicClient?.waitForTransactionReceipt({ hash: contribTx })
      if (rc && rc.status !== 'success') throw new Error('Contribution reverted')
      setTxSteps(s => s.map((st, i): Step => i === 1 ? { ...st, status: 'done', sub: contribTx.slice(0, 10) + '…' } : st))
      setStatus('done')
      toast.success('Contribution confirmed', { description: `${formatDecimal(amount || '0')} USDC locked into ${potTitle ?? 'pot'}` })
      setTimeout(() => { onClose(); setStatus('idle'); setAmount('') }, 2000)
    } catch (err: unknown) {
      setStatus('idle')
      setTxSteps(s => s.map((st): Step => ({ ...st, status: 'pending' })))
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rejected')) toast.error('Transaction rejected in wallet')
      else if (msg.includes('insufficient') || msg.includes('balance')) toast.error('Not enough USDC: approve failed')
      else toast.error('Contribution failed', { description: msg.slice(0, 80) })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Contribute">
      <h2 className="font-display text-[28px] font-medium mb-4">
        {potTitle ? `Contribute to ${potTitle}` : 'Contribute'}
      </h2>

      {/* Chain picker */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {([['arc', '/assets/logos/arc-icon-navy.svg', 'Arc'], ['base', '/assets/logos/base-square.svg', 'Base'], ['solana', '/assets/logos/solana-mark.svg', 'Solana']] as [Chain, string, string][]).map(([id, src, label]) => (
          <button
            key={id}
            onClick={() => setChain(id)}
            className={`border rounded-[12px] p-2.5 text-center text-[13px] transition-colors ${chain === id ? 'border-[1.5px] border-ink bg-paper' : 'border-line'}`}
            data-testid={`chain-${id}`}
          >
            <img src={src} alt={label} className="h-5 block mx-auto mb-1.5" />
            {label}
          </button>
        ))}
      </div>

      <AmountInput
        value={amount}
        onChange={setAmount}
        balance={chain === 'base' ? (baseBalance !== undefined ? formatUsdc(baseBalance) : undefined) : balance ? formatUsdc(balance) : undefined}
        label="Amount"
      />
      {amount && Number(amount) > 0 && (
        <div className="mt-1"><FxEstimate usdc={Number(amount)} rate={rate} symbol={symbol} /></div>
      )}

      {/* Cross-chain tracker */}
      {chain === 'base' && ccSteps.length > 0 && (
        <div className="mt-4" data-testid="cctp-tracker">
          <CrossChainTracker steps={ccSteps.map(s => ({ label: s.label, sub: s.sub || undefined, status: s.status }))} />
        </div>
      )}
      {chain !== 'base' && (status === 'approving' || status === 'contributing' || status === 'done') && (
        <div className="mt-4">
          <CrossChainTracker steps={txSteps.map(s => ({ label: s.label, sub: s.sub || undefined, status: s.status }))} />
        </div>
      )}

      {chain === 'base' && (
        <p className="text-[13px] text-ink-3 mt-3 bg-warn-soft/50 rounded-[10px] p-3">
          Pays in USDC from {NET.source.name} via Circle CCTP. You sign two transactions on {NET.source.name}; no Arc gas needed. Arrives on Arc in {NET.source.blocks}.
        </p>
      )}
      {chain === 'solana' && (
        <p className="text-[13px] text-ink-3 mt-3 bg-warn-soft/50 rounded-[10px] p-3">Solana pay-in is not live yet. Use Arc or Base.</p>
      )}

      <Button
        variant="green"
        fullWidth
        className="mt-4"
        onClick={() => { void handleContribute() }}
        disabled={status !== 'idle' || !amount || Number(amount) <= 0 || chain === 'solana'}
        data-testid="confirm-contribute"
      >
        <Lock size={16} strokeWidth={2} />
        {status === 'approving' ? 'Approving…' : status === 'contributing' ? 'Locking…' : status === 'done' ? 'Done!' : `Lock ${formatDecimal(amount || '0')} USDC into pot`}
      </Button>
      <p className="text-[13px] text-ink-3 mt-2">Refunded in full if the pot misses its deadline.</p>
    </Modal>
  )
}
