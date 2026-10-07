import type { CollectionSlug } from 'payload'

import { Config } from '@/payload-types'

export const extractID = <T extends Config['collections'][CollectionSlug]>(
  objectOrID: T | T['id'],
): T['id'] => {
  if (objectOrID && typeof objectOrID === 'object') return objectOrID.id

  return objectOrID
}

// Tenant slug for tenant-scoped revalidation paths (#176). Relationship
// values arrive as objects (populated) or id strings.
export const extractTenantSlug = (tenant: unknown): string | undefined => {
  if (tenant && typeof tenant === 'object' && 'slug' in tenant) {
    const slug = (tenant as { slug?: unknown }).slug
    return typeof slug === 'string' ? slug : undefined
  }
  return undefined
}

// IDOR guard for actions that fetch by raw id. payload.findByID runs with
// overrideAccess — it does not scope to the caller's tenant. Actions must
// verify the fetched document's tenant matches ctx.userTenant.tenant.id
// before trusting it, especially before SSH/destructive work.
export const extractTenantId = (tenant: unknown): string | undefined => {
  if (tenant && typeof tenant === 'object' && 'id' in tenant) {
    const id = (tenant as { id?: unknown }).id
    return typeof id === 'string' ? id : undefined
  }
  return typeof tenant === 'string' ? tenant : undefined
}

export const assertTenantOwnership = (
  docTenant: unknown,
  tenantId: string,
  resource = 'Resource',
) => {
  const docTenantId = extractTenantId(docTenant)
  if (!docTenantId || docTenantId !== tenantId) {
    throw new Error(`${resource} not found`)
  }
}
