// Auth-sync smoke check (#364). Exercises the sync URL validators and the
// /api/login-sync token acceptance rules without a running server.
//
// Run: NEXT_PUBLIC_AUTH_SYNC_DOMAINS="app.example.com,foo.example.com" \
//   npx tsx -r dotenv/config scripts/smoke-auth-sync.ts

process.env.NEXT_PUBLIC_AUTH_SYNC_DOMAINS ||= 'app.example.com,foo.example.com'

import jwt from 'jsonwebtoken'

const results: { name: string; ok: boolean; detail?: string }[] = []
const check = (name: string, ok: boolean, detail?: string) =>
  results.push({ name, ok, detail })

// Non-literal specifier: the module lives on the auth-sync branch — keep
// this script typecheck-clean on branches where it does not exist.
const modPath = '../src/lib/auth/syncDomains'
const { safeSyncBack, safeSyncNext, getAuthSyncDomains } = await import(modPath)

// --- domain list parsing ---
check(
  'getAuthSyncDomains parses CSV',
  getAuthSyncDomains().join(',') === 'app.example.com,foo.example.com',
)

// --- safeSyncNext ---
check(
  'safeSyncNext allows configured domain',
  safeSyncNext('https://app.example.com/api/logout?back=/sign-in') ===
    'https://app.example.com/api/logout?back=/sign-in',
)
check(
  'safeSyncNext rejects unlisted domain',
  safeSyncNext('https://evil.com/api/logout') === null,
)
check(
  'safeSyncNext rejects http',
  safeSyncNext('http://app.example.com/api/logout') === null,
)
check(
  'safeSyncNext rejects javascript: scheme',
  safeSyncNext('javascript:alert(1)') === null,
)
check(
  'safeSyncNext rejects sibling subdomain spoof',
  safeSyncNext('https://app.example.com.evil.com/x') === null,
)
check('safeSyncNext rejects malformed', safeSyncNext('not a url') === null)
check('safeSyncNext rejects null', safeSyncNext(null) === null)

// --- safeSyncBack ---
check('safeSyncBack allows relative path', safeSyncBack('/dashboard') === '/dashboard')
check('safeSyncBack rejects absolute URL', safeSyncBack('https://evil.com') === '/sign-in')
check('safeSyncBack rejects //protocol-relative', safeSyncBack('//evil.com') === '/sign-in')
check('safeSyncBack defaults on null', safeSyncBack(null) === '/sign-in')

// --- /api/login-sync token rules (same as endpoint: HS256, purpose, email) ---
const secret = process.env.PAYLOAD_SECRET || 'test-secret'

const good = jwt.sign(
  { email: 'a@b.c', purpose: 'auth-sync' },
  secret,
  { algorithm: 'HS256', expiresIn: 60 },
)
const decoded = jwt.verify(good, secret, { algorithms: ['HS256'] })
check(
  'valid token decodes with email + purpose',
  typeof decoded === 'object' &&
    decoded.email === 'a@b.c' &&
    decoded.purpose === 'auth-sync',
)

const expired = jwt.sign(
  { email: 'a@b.c', purpose: 'auth-sync' },
  secret,
  { algorithm: 'HS256', expiresIn: -10 },
)
check('expired token rejected', (() => {
  try {
    jwt.verify(expired, secret, { algorithms: ['HS256'] })
    return false
  } catch {
    return true
  }
})())

const forged = jwt.sign(
  { email: 'a@b.c', purpose: 'auth-sync' },
  'wrong-secret',
  { algorithm: 'HS256' },
)
check('wrong-secret token rejected', (() => {
  try {
    jwt.verify(forged, secret, { algorithms: ['HS256'] })
    return false
  } catch {
    return true
  }
})())

const wrongPurpose = jwt.sign({ email: 'a@b.c', purpose: 'x' }, secret, {
  algorithm: 'HS256',
})
const wp = jwt.verify(wrongPurpose, secret, { algorithms: ['HS256'] })
check(
  'wrong-purpose token fails endpoint check',
  !(typeof wp === 'object' && wp.purpose === 'auth-sync'),
)

const failed = results.filter(r => !r.ok)
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
