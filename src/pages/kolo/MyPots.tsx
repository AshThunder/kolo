import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { ViewerGate } from '../../components/ViewerGate'
import { useViewer } from '../../hooks/useViewer'
import { KoloLayout } from '../../components/KoloLayout'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { EmptyState } from '../../design/EmptyState'
import { useAllPots } from '../../hooks/usePotMeta'
import { api } from '../../lib/api'
import { Users, GraduationCap } from 'lucide-react'

const TABS = ['Organising', 'Contributed', 'Co-signing']

export default function MyPots() {
  const { viewer: address, source, setLookup } = useViewer()
  const [tab, setTab] = useState(0)
  const allPots = useAllPots()
  const [mine, setMine] = useState<{ organising: number[]; contributed: number[]; cosigning: number[] } | undefined>()
  useEffect(() => { if (address) api<typeof mine>(`/pots/by/${address}`).then(setMine).catch(() => setMine({ organising: [], contributed: [], cosigning: [] })) }, [address])

  if (!address) return <KoloLayout><ViewerGate what="pots" /></KoloLayout>

  const ids = mine ? [mine.organising, mine.contributed, mine.cosigning][tab] : []
  const STATE = ['Active', 'Refunding', 'Closed']
  const organising = (allPots ?? []).filter(p => ids.includes(p.id)).map(p => ({ potId: p.id, slug: String(p.id), title: p.title ?? `Pot #${p.id}`, potType: p.type === 'tuition' ? 1 : 0, state: STATE[p.state] ?? 'Active' }))

  return (
    <KoloLayout>
      <div className="py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-[36px] font-medium">My pots</h1>
          <Link to="/create">
            <Button variant="green" data-testid="new-pot-btn"><Plus size={16} />New pot</Button>
          </Link>
        </div>

        {source !== 'wallet' && (
          <p className="mb-5 text-[13px] text-ink-2 border border-line bg-surface rounded-[12px] px-4 py-2.5 flex flex-wrap items-center gap-x-3" data-testid="viewer-note">
            <span>Showing {source === 'passkey' ? 'the passkey wallet saved on this device' : 'a looked-up address'} <span className="font-mono">{address.slice(0, 6)}…{address.slice(-4)}</span>. Connect a wallet to act on your pots.</span>
            <button type="button" className="underline font-medium" onClick={() => setLookup(undefined)}>Switch</button>
          </p>
        )}
        {/* Tabs */}
        <div className="flex gap-1 border-b border-line mb-6">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={`px-4 py-2.5 font-semibold text-[14px] transition-colors ${tab === i ? 'text-ink border-b-2 border-ink' : 'text-ink-3 hover:text-ink-2'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {(
          organising.length === 0 ? (
            <EmptyState
              illustration="/assets/illustrations/empty-pot.svg"
              title={!mine ? "Loading your pots from Arc…" : "No pots here yet. Start one or open an invite link."}
              action={<Link to="/create"><Button variant="green">Start a pot</Button></Link>}
            />
          ) : (
            <div className="divide-y divide-line">
              {organising.map(p => (
                <Link key={p.potId} to={`/p/${p.slug}`} className="flex items-center gap-4 py-4 hover:bg-paper -mx-4 px-4 transition-colors rounded-[12px]">
                  <div className="w-10 h-10 bg-green-soft rounded-[10px] grid place-items-center flex-shrink-0">
                    {p.potType === 0 ? <Users size={20} className="text-green" /> : <GraduationCap size={20} className="text-green" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[15px] truncate">{p.title}</p>
                    <p className="font-mono text-[12px] text-ink-3 mt-0.5">{p.potType === 0 ? 'GroupPot' : 'Tuition Pot'}</p>
                  </div>
                  <Chip variant="neutral">{p.state}</Chip>
                </Link>
              ))}
            </div>
          )
        )}

      </div>
    </KoloLayout>
  )
}
