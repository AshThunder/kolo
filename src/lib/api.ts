export const API_BASE = (import.meta.env.VITE_KOLO_API as string | undefined) ?? '/api/kolo'
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API_BASE + path, init)
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return r.json() as Promise<T>
}
