import { env } from 'env'
import jwt from 'jsonwebtoken'
import { APIError, PayloadHandler } from 'payload'

import { createSession } from '@/lib/auth/createSession'
import { safeSyncBack, safeSyncNext } from '@/lib/auth/syncDomains'

// Exchanges a short-lived auth-sync token (minted by signInAction) for a
// real session cookie on this domain, then continues the redirect chain:
// `next` = next sibling's /api/login-sync URL, `back` = final relative path.
// First-party navigation is used because third-party iframe cookie writes
// are blocked/partitioned by modern browsers (#364).
export const loginSync: PayloadHandler = async req => {
  const { payload, searchParams } = req
  const token = searchParams.get('token') ?? ''

  if (!token) {
    throw new APIError('Token required', 400)
  }

  let decoded: jwt.JwtPayload
  try {
    const result = jwt.verify(token, env.PAYLOAD_SECRET, {
      algorithms: ['HS256'],
    })
    if (typeof result === 'string') throw new Error('not an object')
    decoded = result
  } catch {
    throw new APIError('Invalid token', 401)
  }

  if (decoded.purpose !== 'auth-sync' || typeof decoded.email !== 'string') {
    throw new APIError('Invalid token', 401)
  }

  const { docs } = await payload.find({
    collection: 'users',
    req,
    where: { email: { equals: decoded.email } },
    limit: 1,
    depth: 1,
  })

  const user = docs[0]
  if (!user) {
    throw new APIError('User not found', 404)
  }

  await createSession({ user, payload })

  const next = safeSyncNext(searchParams.get('next'))
  const back = safeSyncBack(searchParams.get('back'))
  const target = next ?? back

  return Response.redirect(new URL(target, env.NEXT_PUBLIC_WEBSITE_URL), 302)
}
