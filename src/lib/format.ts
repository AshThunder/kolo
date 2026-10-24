const pad = (n: number) => String(n).padStart(2, '0')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "23 Oct 2026, 09:12 UTC": one unambiguous format for every timestamp in the app. */
export function fmtDateTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}
export const fmtDate = (unixSeconds: number) => { const d = new Date(unixSeconds * 1000); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` }
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
