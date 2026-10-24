import { useState } from 'react'
import { Loader2, ShieldCheck, Clock3 } from 'lucide-react'
import { Button } from '../design/Button'
import { RegistrarActions } from './RegistrarActions'
import { useIsRegistrar, useRegistrarTx } from '../hooks/useRegistrar'
import { fmtDateTime, shortAddr } from '../lib/format'

const STATUS = [
  { t: 'Not registered', d: 'This payee has not been added to the registry.' },
  { t: 'Waiting for verification', d: 'Registered on-chain, but pots can’t pay it until the Kolo registrar verifies it.' },
  { t: 'Approved · verified', d: 'The registrar checked this payee. Pots can be created for it and it can be paid.' },
  { t: 'Revoked', d: 'The registrar withdrew approval. Pots that point here are frozen.' },
]

/** Approval status for one payee, plus the registrar-only buttons when the connected wallet holds the role. */
export function PayeeApprovalPanel({ id, name, status, verifier, pending }: { id: number; name: string; status: number; verifier: string; pending?: { newWallet: string; executeAfter: number } }) {
  const { isRegistrar, address } = useIsRegistrar()
  const { run, busy } = useRegistrarTx()
  const s = STATUS[status] ?? STATUS[0]
  const [now] = useState(() => Date.now())
  const ready = pending && pending.executeAfter * 1000 <= now
  return (
    <div className="bg-surface border border-line rounded-lg p-5" data-testid="payee-approval">
      <span className="eyebrow">Approval</span>
      <p className="font-semibold mt-2 flex items-center gap-2"><ShieldCheck size={17} className={status === 2 ? 'text-green' : 'text-ink-3'} />{s.t}</p>
      <p className="text-[14px] text-ink-2 mt-1">{s.d}</p>
      <dl className="mt-3 pt-3 border-t border-line text-[13px] grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-ink-3">Who approves</dt><dd className="text-right">Kolo registrar{verifier && status >= 2 ? <> · <span className="font-mono">{shortAddr(verifier)}</span></> : ''}</dd>
        <dt className="text-ink-3">Co-signers</dt><dd className="text-right">Don’t approve payees; they approve invoices</dd>
      </dl>
      {isRegistrar && (
        <div className="mt-4 pt-4 border-t border-line space-y-3">
          <p className="text-[12px] text-ink-3">You hold the registrar role{address ? ` (${shortAddr(address)})` : ''}.</p>
          <RegistrarActions id={id} status={status} name={name} />
          {pending && (
            <div className="text-[13px]">
              <p className="text-ink-2 flex items-center gap-1.5"><Clock3 size={14} />Wallet change to <span className="font-mono">{shortAddr(pending.newWallet)}</span> {ready ? 'can be applied now.' : `can be applied after ${fmtDateTime(pending.executeAfter)}.`}</p>
              <Button size="sm" variant="ink" className="mt-2" disabled={!ready || !!busy} onClick={() => { void run({ kind: 'executeWalletChange', id }) }}>
                {busy === `executeWalletChange:${id}` ? <Loader2 size={14} className="animate-spin" /> : null}Apply wallet change
              </Button>
            </div>
          )}
        </div>
      )}
      {!isRegistrar && <p className="text-[12px] text-ink-3 mt-4">Only the registrar wallet can change this.</p>}
    </div>
  )
}
