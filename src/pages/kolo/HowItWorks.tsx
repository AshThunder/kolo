import { KoloLayout } from '../../components/KoloLayout'
import { Link } from 'react-router-dom'
import { Button } from '../../design/Button'

const STEPS = [
  {
    n: '01', title: 'Seal the promise',
    body: 'Create a pot, choose a payee from the verified registry and set a deadline. The payee address is locked into the contract — no swap, no redirect, no admin override.',
  },
  {
    n: '02', title: 'Fill it from anywhere',
    body: 'Contributors add USDC from Arc, Base or Solana. Cross-chain funds arrive via CCTP Forwarding — no Arc gas needed. Every contribution is on-chain and downloadable as a signed receipt.',
  },
  {
    n: '03', title: 'Release against evidence',
    body: 'The organiser uploads an invoice (SHA-256 stored on-chain). Co-signers approve. Once threshold is met, funds release only to the locked payee. No invoice? No release.',
  },
  {
    n: '04', title: 'Refunds if the promise breaks',
    body: 'If the deadline and a 3-day grace period pass without a full release, anyone can open refunds with one transaction, and every contributor can then claim their pro-rata share straight from the contract. No admin approval is needed and nobody can block it.',
  },
]

export default function HowItWorks() {
  return (
    <KoloLayout>
      <div className="max-w-2xl mx-auto py-12">
        <p className="eyebrow mb-2">How it works</p>
        <h1 className="font-display text-[48px] font-medium leading-[1.05] mb-10">
          Group money that can only go where it was promised.
        </h1>

        <div className="space-y-0">
          {STEPS.map((s, i) => (
            <div key={s.n} className={`py-8 ${i > 0 ? 'border-t border-line' : ''}`}>
              <span className="eyebrow text-green">{s.n}</span>
              <h2 className="font-display text-[26px] font-medium mt-2 mb-3">{s.title}</h2>
              <p className="text-ink-2 text-[16px]">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="border-t-2 border-ink pt-8 mt-4">
          <h3 className="font-display text-[22px] font-medium mb-3">Tuition Pot</h3>
          <p className="text-ink-2 text-[16px] mb-4">
            A special pot type for school fees. The payee must be a school verified in the Kolo registry — their wallet can't change without a 48-hour public notice. Terms are paid on their due dates: Kolo's keeper sends each payment, and anyone else can trigger it too. Leftover funds return pro-rata to every contributor.
          </p>
          <h3 className="font-display text-[22px] font-medium mb-3 mt-8">Co-signers &amp; disputes</h3>
          <p className="text-ink-2 text-[16px]">
            Add co-signers to a pot (e.g. family members, a company director, a trusted friend). Any contributor can flag an invoice as disputed — this pauses the release and resets all approvals. Co-signers re-vote. Still unresolved after the deadline and grace period → anyone can open refunds, and each contributor claims their pro-rata share.
          </p>
        </div>

        <div className="flex gap-3 mt-10">
          <Link to="/create"><Button variant="green">Start a pot</Button></Link>
          <Link to="/payees"><Button variant="ghost">See verified payees</Button></Link>
        </div>
      </div>
    </KoloLayout>
  )
}
