import { PotGovernance } from '../../components/PotGovernance'
import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { FileUp, ArrowLeft } from 'lucide-react'
import { useWriteContract, useAccount, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import { KoloLayout } from '../../components/KoloLayout'
import { Button } from '../../design/Button'
import { AmountInput } from '../../design/Field'
import { usePotBySlug } from '../../hooks/usePotMeta'
import { KOLO_GROUP_POT_ABI } from '../../abi/KoloGroupPot'
import { parseUsdc } from '../../onchain-money'
import { useReadContract } from 'wagmi'
import { KOLO_FACTORY_ABI } from '../../abi/KoloFactory'
import { KOLO_ADDRESSES } from '../../config'
import { ARC_CHAIN_ID } from '../../addresses'

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function OrganizerDashboard() {
  const { slug } = useParams<{ slug: string }>()
  const potMeta = usePotBySlug(slug ?? '')
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: ARC_CHAIN_ID })

  const [file, setFile] = useState<File | null>(null)
  const [fileHash, setFileHash] = useState<string>()
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: potAddress } = useReadContract({
    address: KOLO_ADDRESSES.factory,
    abi: KOLO_FACTORY_ABI, chainId: ARC_CHAIN_ID,
    functionName: 'potAddress',
    args: [BigInt(potMeta?.potId ?? 0)],
    query: { enabled: !!potMeta?.potId },
  })
  const addr = potAddress

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const buf = await f.arrayBuffer()
    const hex = await sha256Hex(buf)
    setFileHash(hex)
  }

  async function handleSubmit() {
    if (!addr || !fileHash || !amount) { toast.error('Fill all fields'); return }
    if (!address) { toast.error('Sign in to submit'); return }
    setSubmitting(true)
    try {
      const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const
      const hashBytesHex: `0x${string}` = ('0x' + fileHash) as `0x${string}`
      const hash = await writeContractAsync({
        address: addr,
        abi: KOLO_GROUP_POT_ABI, chainId: ARC_CHAIN_ID,
        functionName: 'submitInvoice',
        args: [0, 0, parseUsdc(amount), hashBytesHex, ZERO_BYTES32],
      })
      await client!.waitForTransactionReceipt({ hash })
      toast.success('Invoice submitted — awaiting co-signer approval', { description: hash.slice(0, 10) + '…' })
      setFile(null); setFileHash(undefined); setAmount('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rejected')) toast.error('Transaction rejected in wallet')
      else toast.error('Invoice submission failed', { description: msg.slice(0, 80) })
    } finally {
      setSubmitting(false)
    }
  }

  if (!potMeta) return (
    <KoloLayout><div className="py-20 text-center text-ink-3">Finding pot on Arc…</div></KoloLayout>
  )

  return (
    <KoloLayout>
      <div className="max-w-2xl mx-auto py-10">
        <Link to={`/p/${slug}`} className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink mb-5 text-[14px]">
          <ArrowLeft size={16} />Back to pot
        </Link>
        <p className="eyebrow mb-1">Organiser dashboard</p>
        <h1 className="font-display text-[32px] font-medium mb-6">{potMeta.title}</h1>

        {/* Upload invoice */}
        <div className="bg-surface border border-line rounded-lg p-6 space-y-4">
          <h2 className="font-display text-[22px] font-medium">Submit invoice</h2>
          <p className="text-ink-2 text-[14px]">Upload a PDF or image. The SHA-256 hash is computed locally and stored on-chain. Co-signers then approve the hash before funds release.</p>

          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-[14px] p-8 text-center cursor-pointer transition-colors ${file ? 'border-green bg-green-soft/20' : 'border-line hover:border-ink-2'}`}
          >
            <FileUp size={32} strokeWidth={1.5} className="mx-auto mb-2 text-ink-3" />
            {file ? (
              <>
                <p className="font-semibold">{file.name}</p>
                {fileHash && <p className="font-mono text-[12px] text-ink-3 mt-1">sha256 {fileHash.slice(0, 8)}…{fileHash.slice(-8)}</p>}
              </>
            ) : (
              <>
                <p className="text-ink-2">Drop invoice here or click to upload</p>
                <p className="text-[13px] text-ink-3 mt-1">PDF, PNG, JPG · hash computed locally</p>
              </>
            )}
            <input ref={fileRef} type="file" className="hidden" accept="application/pdf,image/*" onChange={e => { void handleFileChange(e) }} data-testid="invoice-file-input" />
          </div>

          <AmountInput label="Invoice amount (USDC)" value={amount} onChange={setAmount} />

          <Button
            variant="green"
            fullWidth
            onClick={() => { void handleSubmit() }}
            disabled={submitting || !file || !amount}
            data-testid="submit-invoice"
          >
            {submitting ? 'Submitting…' : 'Submit invoice for approval'}
          </Button>
        </div>

        {/* Existing invoices */}
        <div className="mt-8">{addr && <PotGovernance pot={addr} potId={Number(potMeta.potId)} />}</div>
      </div>
    </KoloLayout>
  )
}
