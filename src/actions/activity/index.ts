'use server'

import { z } from 'zod'
import type { Where } from 'payload'

import { protectedClient } from '@/lib/safe-action'
import type { Activity } from '@/payload-types'

export const getActivitiesAction = protectedClient
  .metadata({ actionName: 'getActivitiesAction' })
  .inputSchema(
    z.object({
      limit: z.number().max(100).default(50),
      page: z.number().default(1),
    }),
  )
  .action(async ({ clientInput, ctx }) => {
    const { limit, page } = clientInput
    const { user, payload } = ctx

    const { docs, totalDocs, hasNextPage } = await payload.find({
      collection: 'activity',
      where: {
        user: {
          equals: user.id,
        },
      },
      sort: '-createdAt',
      limit,
      page,
    })

    return {
      activities: docs,
      total: totalDocs,
      hasNextPage,
      page,
    }
  })

export const getActivitiesByCategoryAction = protectedClient
  .metadata({ actionName: 'getActivitiesByCategoryAction' })
  .inputSchema(
    z.object({
      category: z.string(),
      limit: z.number().max(100).default(50),
      page: z.number().default(1),
    }),
  )
  .action(async ({ clientInput, ctx }) => {
    const { category, limit, page } = clientInput
    const { user, payload } = ctx

    const { docs, totalDocs, hasNextPage } = await payload.find({
      collection: 'activity',
      where: {
        and: [
          {
            user: {
              equals: user.id,
            },
          },
          {
            category: {
              equals: category,
            },
          },
        ],
      },
      sort: '-createdAt',
      limit,
      page,
    })

    return {
      activities: docs,
      total: totalDocs,
      hasNextPage,
      category,
    }
  })

export const getActivityCategoriesAction = protectedClient
  .metadata({ actionName: 'getActivityCategoriesAction' })
  .action(async ({ ctx }) => {
    const { user, payload } = ctx

    // ponytail: capped scan, replace with DB distinct/group-by when activity volume grows
    const { docs } = await payload.find({
      collection: 'activity',
      where: {
        user: {
          equals: user.id,
        },
      },
      limit: 1000,
    })

    const categories = Array.from(
      new Set(
        (docs as Activity[])
          .map(doc => doc.category)
          .filter((c): c is string => typeof c === 'string'),
      ),
    ).sort()

    return categories
  })

export const getActivityStatsAction = protectedClient
  .metadata({ actionName: 'getActivityStatsAction' })
  .action(async ({ ctx }) => {
    const { user, payload } = ctx
    const baseWhere = {
      user: {
        equals: user.id,
      },
    }

    // Count-only queries (limit 1 still returns totalDocs) instead of
    // fetching full docs for stats.
    const countWhere = (extra: Where | Record<string, never>) =>
      payload.find({
        collection: 'activity',
        where: { and: [baseWhere, extra] },
        limit: 1,
      })
    const latest = () =>
      payload.find({
        collection: 'activity',
        where: baseWhere,
        sort: '-createdAt',
        limit: 1,
      })

    const [total, success, failed, pending, info, warning, error, critical, last] =
      await Promise.all([
        countWhere({}),
        countWhere({ status: { equals: 'success' } }),
        countWhere({ status: { equals: 'failed' } }),
        countWhere({ status: { equals: 'pending' } }),
        countWhere({ severity: { equals: 'info' } }),
        countWhere({ severity: { equals: 'warning' } }),
        countWhere({ severity: { equals: 'error' } }),
        countWhere({ severity: { equals: 'critical' } }),
        latest(),
      ])

    return {
      total: total.totalDocs,
      byStatus: {
        success: success.totalDocs,
        failed: failed.totalDocs,
        pending: pending.totalDocs,
      },
      bySeverity: {
        info: info.totalDocs,
        warning: warning.totalDocs,
        error: error.totalDocs,
        critical: critical.totalDocs,
      },
      lastActivity: (last.docs[0] as Activity | undefined)?.createdAt ?? null,
    }
  })
