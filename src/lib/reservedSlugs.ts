// Usernames become tenant slugs and org route prefixes (/[organisation]),
// so they must not collide with top-level routes (#172).
export const RESERVED_SLUGS = [
  'admin',
  'payload-admin',
  'api',
  'onboarding',
  'invite',
  'sign-in',
  'sign-up',
  'dashboard',
  'servers',
  'team',
  'templates',
  'docs',
  'security',
  'backups',
  'integrations',
  '_next',
  '_static',
  '_vercel',
] as const

export const isReservedSlug = (value: string): boolean =>
  (RESERVED_SLUGS as readonly string[]).includes(value.toLowerCase())
