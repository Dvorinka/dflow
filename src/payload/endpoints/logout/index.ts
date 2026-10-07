import type { PayloadHandler } from 'payload'

import { safeSyncBack, safeSyncNext } from '@/lib/auth/syncDomains'

// Clears the payload-token cookie. Supports auth-sync redirect chains:
// `next` hops to a sibling domain's /api/logout, `back` is the final
// relative destination (defaults to /sign-in). Also loadable in a hidden
// iframe for best-effort sync (#364).
export const logoutHandler: PayloadHandler = async req => {
  const next = safeSyncNext(req.searchParams.get('next'))
  const back = safeSyncBack(req.searchParams.get('back'))

  return new Response(null, {
    status: 302,
    headers: {
      'Set-Cookie': [
        'payload-token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
      ].join(', '),
      Location: next ?? back,
      // 'X-Frame-Options': 'ALLOWALL',
    },
  })
}
