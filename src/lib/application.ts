/** The applicant's own lookup (reference or wallet), kept on this device so "Your application" shows up again. Cleared by Log out (see lib/session.ts). */
const KEY = 'kolo:application'
export type SavedApplication = { ref?: string; wallet?: string }

export function loadSavedApplication(): SavedApplication | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SavedApplication> | null; return v && (typeof v.ref === 'string' || typeof v.wallet === 'string') ? { ref: v.ref, wallet: v.wallet } : null } catch { return null }
}
export function saveApplication(a: SavedApplication) { try { localStorage.setItem(KEY, JSON.stringify(a)) } catch { /* storage blocked */ } }
export const statusLink = (ref?: string) => (ref ? `/payees/status?ref=${encodeURIComponent(ref)}` : '/payees/status')
