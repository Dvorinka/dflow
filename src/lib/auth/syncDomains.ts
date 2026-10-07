import { env } from 'env'

// Sibling domains allowed in auth-sync redirect chains (#364). Set via
// NEXT_PUBLIC_AUTH_SYNC_DOMAINS (comma-separated hostnames).
export const getAuthSyncDomains = (): string[] =>
  (env.NEXT_PUBLIC_AUTH_SYNC_DOMAINS ?? '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean)

// Only sibling sync domains may appear as the next hop — anything else is
// an open-redirect attempt.
export const safeSyncNext = (raw: string | null): string | null => {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    if (!getAuthSyncDomains().includes(url.hostname.toLowerCase())) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

// Final destination stays relative — absolute `back` URLs are rejected.
export const safeSyncBack = (raw: string | null, fallback = '/sign-in') =>
  raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback
