import { env } from 'env'

import type { AuthConfig } from '@/payload-types'

export type AuthMethod = AuthConfig['authMethod']

const METHODS: AuthMethod[] = ['email-password', 'magic-link', 'both']

const isMethod = (v: unknown): v is AuthMethod =>
  typeof v === 'string' && (METHODS as string[]).includes(v)

// Env override wins over the DB global so self-hosters can lock auth
// method without admin-UI access. Unset env falls back to DB value.
export const resolveAuthMethod = (dbValue?: unknown): AuthMethod => {
  if (isMethod(env.AUTH_METHOD)) return env.AUTH_METHOD
  if (isMethod(dbValue)) return dbValue
  return 'both'
}

export const isResendConfigured = (): boolean =>
  !!(
    env.RESEND_API_KEY &&
    env.RESEND_SENDER_EMAIL &&
    env.RESEND_SENDER_NAME
  )

// Magic link requires Resend; without it the method degrades to
// email-password so the UI never offers a dead path.
// ponytail: single helper, callers route through it; per-method flags if matrix grows.
export const effectiveAuthMethod = (dbValue?: unknown): AuthMethod => {
  const method = resolveAuthMethod(dbValue)
  if (method !== 'email-password' && !isResendConfigured())
    return 'email-password'
  return method
}

export const isMagicLinkAllowed = (dbValue?: unknown): boolean =>
  effectiveAuthMethod(dbValue) !== 'email-password'

export const isPasswordAllowed = (dbValue?: unknown): boolean =>
  effectiveAuthMethod(dbValue) !== 'magic-link'
