import { useState } from 'react'
import { BadgeCheck, Ban, Loader2 } from 'lucide-react'
import { Button } from '../design/Button'
import { useIsRegistrar, useRegistrarTx } from '../hooks/useRegistrar'

/** Verify / Revoke for one payee. Renders nothing unless the connected wallet holds REGISTRAR_ROLE. */
export function RegistrarActions({ id, status, name }: { id: number; status: number; name: string }) {
  const { isRegistrar } = useIsRegistrar()
  const { run, busy } = useRegistrarTx()
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  if (!isRegistrar) return null
  const verifying = busy === `verify:${id}`, revoking = busy === `revoke:${id}`
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`registrar-actions-${id}`}>
      {status === 1 && (
        <Button size="sm" variant="green" disabled={!!busy} onClick={() => { void run({ kind: 'verify', id }) }} aria-label={`Verify ${name}`}>
          {verifying ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}Verify
        </Button>
      )}
      {(status === 1 || status === 2) && !confirmRevoke && (
        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirmRevoke(true)} aria-label={`Revoke ${name}`}><Ban size={14} />Revoke</Button>
      )}
      {confirmRevoke && (
        <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
          Freeze pots that use {name}?
          <Button size="sm" variant="warn" disabled={!!busy} onClick={() => { void run({ kind: 'revoke', id }).then(() => setConfirmRevoke(false)) }}>{revoking ? <Loader2 size={14} className="animate-spin" /> : null}Yes, revoke</Button>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirmRevoke(false)}>Cancel</Button>
        </span>
      )}
    </div>
  )
}
