import { Link } from 'react-router-dom'
import { useIsRegistrar } from '../hooks/useRegistrar'

/** Site-wide footer links. "Registrar" only appears for a connected registrar wallet. */
export function KoloFooter() {
  const { isRegistrar } = useIsRegistrar()
  const links: [string, string][] = [['/how-it-works', 'How it works'], ['/payees', 'Verified payees'], ['/payees/apply', 'Apply as a payee'], ['/payees/status', 'Application status'], ...(isRegistrar ? [['/admin', 'Registrar'] as [string, string]] : [])]
  return (
    <footer className="mt-16 border-t border-line py-8" data-testid="kolo-footer">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-ink-2">
        {links.map(([to, label]) => <li key={to}><Link to={to} className="hover:text-ink">{label}</Link></li>)}
      </ul>
    </footer>
  )
}
