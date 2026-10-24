import { BadgeCheck, Users, ShieldCheck } from 'lucide-react'

/** Plain-language answer to "who approves a payee, and when?" Shown on the directory, the create review and the registrar console. */
export function PayeeApprovalInfo({ compact }: { compact?: boolean }) {
  const steps = [
    { icon: ShieldCheck, title: 'Kolo registrar verifies the payee', body: 'A payee applies with its wallet and documents. The registrar checks them, records the payee on-chain, then marks it Verified. Only Verified payees can be chosen for a pot.' },
    { icon: BadgeCheck, title: 'The organiser seals the payee into the pot', body: 'When a pot is created the payee is fixed. Contributors can see exactly who can ever be paid, and a later revoke freezes the pot instead of redirecting the money.' },
    { icon: Users, title: 'Co-signers approve each payment', body: 'Every invoice to the payee needs the pot’s co-signers (and the organiser, where set) to approve it on the pot page before any USDC is released.' },
  ]
  return (
    <section className="border border-line rounded-[14px] bg-surface p-5" aria-labelledby="how-payee-approval">
      <h2 id="how-payee-approval" className="eyebrow mb-3">How a payee gets approved</h2>
      <ol className={`grid gap-4 ${compact ? '' : 'md:grid-cols-3'}`}>
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-paper border border-line grid place-items-center flex-shrink-0"><s.icon size={16} className="text-green" /></span>
            <div><p className="font-semibold text-[14px]"><span className="font-mono text-ink-3 mr-1.5">{i + 1}</span>{s.title}</p><p className="text-[13px] text-ink-2 mt-1">{s.body}</p></div>
          </li>
        ))}
      </ol>
    </section>
  )
}
