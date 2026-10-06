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
