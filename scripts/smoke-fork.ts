// Smoke test for fork changes: user bootstrap, reserved slugs,
// unique-name resolution, activity tracking + permission mapping.
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isReservedSlug } from '@/lib/auth/reservedSlugs'
import { trackActivity } from '@/lib/activityTracker'
import { getUniqueName } from '@/lib/uniqueName'
import { isVersionNewer } from '@/lib/version'
import { getDnsRecordName } from '@/lib/dnsRecord'
import { packageVersions } from '@/lib/packageVersions'
import { resolveAuthMethod, effectiveAuthMethod } from '@/lib/auth/authMethod'
import { getActionAccess } from '@/lib/permissions/config'

const results: { name: string; ok: boolean; detail?: string }[] = []
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const payload = await getPayload({ config: configPromise })

// 1. Pure helpers
check('version compare', isVersionNewer('0.36.0', '0.35.2') && !isVersionNewer('v1.0', '1.0.1'))
check('dns record name', getDnsRecordName('app.example.com') === 'app' && getDnsRecordName('a.b.example.com', 'example.com') === 'a.b')
check('package versions load', typeof packageVersions.dokku === 'string' && packageVersions.dokku.length > 0, `dokku=${packageVersions.dokku}`)
check('reserved slug', isReservedSlug('admin') && isReservedSlug('API') && !isReservedSlug('alice'))
check('auth method env unset -> both', resolveAuthMethod(undefined) === 'both')
check('magic link degrades w/o resend', effectiveAuthMethod('both') === 'email-password')

// 2. Permission map covers activity actions
const activityPerms = [
  'getActivitiesAction',
  'getActivitiesByCategoryAction',
  'getActivityCategoriesAction',
  'getActivityStatsAction',
] as const
const accessMap = getActionAccess as Record<string, readonly string[]>
check(
  'activity actions mapped',
  activityPerms.every(a => Array.isArray(accessMap[a])) &&
    activityPerms.every(a => accessMap[a].includes('team.read')),
)

// 3. Unique name resolution against a real collection
const probeName = `smoke-${Date.now().toString(36)}`
const unique = await getUniqueName(async candidate => {
  const { totalDocs } = await payload.count({
    collection: 'users',
    where: { username: { equals: candidate } },
  })
  return totalDocs > 0
}, probeName)
check('unique name first pass', unique === probeName)

// 4. User creation -> tenant + role hook
let user: any
try {
  user = await payload.create({
    collection: 'users',
    data: {
      username: probeName,
      email: `${probeName}@example.test`,
      password: 'SmokeTest!234',
      onboarded: false,
    },
  })
  check('user created', !!user?.id)
} catch (e) {
  check('user created', false, (e as Error).message)
}

// 5. Reserved slug rejected at collection level
try {
  await payload.create({
    collection: 'users',
    data: { username: 'admin', email: `smoke-admin-${Date.now()}@example.test`, password: 'x'.repeat(12) },
  })
  check('reserved slug rejected', false, 'create succeeded')
} catch (e) {
  check('reserved slug rejected', (e as Error).message.includes('reserved'))
}

// 6. Tenant + role created by hook
if (user?.id) {
  const refreshed = await payload.findByID({ collection: 'users', id: user.id, depth: 2 })
  const tenantRef = refreshed.tenants?.[0]
  check(
    'tenant+role provisioned',
    typeof tenantRef?.tenant === 'object' && typeof tenantRef?.role === 'object',
    typeof tenantRef?.tenant === 'object' ? (tenantRef.tenant as any).slug : 'no tenant',
  )
}

// 7. Activity write + read (uses overrideAccess + collection schema)
if (user?.id) {
  await trackActivity({
    payload,
    userId: user.id,
    eventType: 'smoke_test',
    operation: 'create',
    label: 'Smoke Test Event',
    status: 'success',
    severity: 'info',
    category: 'test',
  })
  const { totalDocs } = await payload.find({
    collection: 'activity',
    where: { and: [{ user: { equals: user.id } }, { eventType: { equals: 'smoke_test' } }] },
  })
  check('activity persisted', totalDocs === 1)
}

// 8. User reads own activity via collection access (non-admin -> self scope)
const anonRead = await payload.find({
  collection: 'activity',
  overrideAccess: false,
  // no user on req -> access denies
}).then(r => r.totalDocs).catch(() => -1)
check('activity access denies anonymous', anonRead === 0 || anonRead === -1, `totalDocs=${anonRead}`)

// 9. Auth sign-in via payload.login
if (user?.id) {
  const login = await payload.login({
    collection: 'users',
    data: { email: `${probeName}@example.test`, password: 'SmokeTest!234' },
  }).catch(() => null)
  check('payload.login works', !!login?.token)
}

// Cleanup test data
if (user?.id) {
  const refreshed = await payload.findByID({ collection: 'users', id: user.id, depth: 1 })
  const tenantId = typeof refreshed.tenants?.[0]?.tenant === 'object' ? refreshed.tenants[0].tenant.id : refreshed.tenants?.[0]?.tenant
  const roleId = typeof refreshed.tenants?.[0]?.role === 'object' ? refreshed.tenants[0].role.id : refreshed.tenants?.[0]?.role
  await payload.delete({ collection: 'activity', where: { user: { equals: user.id } } }).catch(() => {})
  await payload.delete({ collection: 'users', id: user.id }).catch(() => {})
  if (tenantId) await payload.delete({ collection: 'tenants', id: tenantId }).catch(() => {})
  if (roleId) await payload.delete({ collection: 'roles', id: roleId }).catch(() => {})
  console.log('cleanup done')
}

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
