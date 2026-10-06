import type Redis from 'ioredis'

import { createRedisClient } from '@/lib/redis'

// Cache-aside for server details (#414). The populated server read fans out
// to SSH calls via payload hooks, so a short TTL here saves seconds per
// page view. Invalidation is best-effort: TTL bounds staleness, explicit
// busts happen on refresh requests and server mutations.
const KEY_PREFIX = 'server-details'
const LIST_PREFIX = 'tenant-servers'

// SERVER_DETAILS_CACHE_TTL (seconds, default 300) — see .env.example
const ttlSeconds = () => {
  const raw = Number(process.env.SERVER_DETAILS_CACHE_TTL ?? 300)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 300
}

let shared: Redis | null = null
const redis = () => (shared ??= createRedisClient())

const detailsKey = (id: string) => `${KEY_PREFIX}:${id}`
const listKey = (tenantSlug: string) => `${LIST_PREFIX}:${tenantSlug}`

export const getCachedServerDetails = async <T>(id: string): Promise<T | null> => {
  try {
    const raw = await redis().get(detailsKey(id))
    if (!raw) {
      console.info(`[server-cache] miss ${detailsKey(id)}`)
      return null
    }
    console.info(`[server-cache] hit ${detailsKey(id)}`)
    return JSON.parse(raw) as T
  } catch (error) {
    console.warn('[server-cache] read failed, falling back to DB', error)
    return null
  }
}

export const setCachedServerDetails = async (
  id: string,
  value: unknown,
): Promise<void> => {
  try {
    await redis().set(detailsKey(id), JSON.stringify(value), 'EX', ttlSeconds())
    console.info(`[server-cache] refresh ${detailsKey(id)}`)
  } catch (error) {
    console.warn('[server-cache] write failed', error)
  }
}

export const getCachedTenantServers = async <T>(
  tenantSlug: string,
): Promise<T | null> => {
  try {
    const raw = await redis().get(listKey(tenantSlug))
    if (!raw) {
      console.info(`[server-cache] miss ${listKey(tenantSlug)}`)
      return null
    }
    console.info(`[server-cache] hit ${listKey(tenantSlug)}`)
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const setCachedTenantServers = async (
  tenantSlug: string,
  value: unknown,
): Promise<void> => {
  try {
    await redis().set(listKey(tenantSlug), JSON.stringify(value), 'EX', ttlSeconds())
  } catch {
    // best-effort
  }
}

// ponytail: one invalidate entry point; call it from every server mutation.
export const invalidateServerCache = async (
  tenantSlug?: string,
  serverId?: string,
): Promise<void> => {
  try {
    const keys = [
      ...(tenantSlug ? [listKey(tenantSlug)] : []),
      ...(serverId ? [detailsKey(serverId)] : []),
    ]
    if (!keys.length) return
    await redis().del(...keys)
    console.info(`[server-cache] invalidate ${keys.join(',')}`)
  } catch {
    // best-effort
  }
}
