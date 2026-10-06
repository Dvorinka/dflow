'use server'

import { z } from 'zod'

import { adminClient } from '@/lib/safe-action'

export const getAdminMetricsAction = adminClient
  .metadata({
    actionName: 'getAdminMetrics',
  })
  .inputSchema(z.object({}).optional())
  .action(async ({ ctx }) => {
    const { payload } = ctx
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString()

    const [
      users,
      newUsers,
      servers,
      projects,
      services,
      databases,
      queuedDeployments,
      failedDeployments,
      backups,
    ] = await Promise.all([
      payload.count({ collection: 'users' }),
      payload.count({
        collection: 'users',
        where: { createdAt: { greater_than: thirtyDaysAgo } },
      }),
      payload.count({ collection: 'servers' }),
      payload.count({ collection: 'projects' }),
      payload.count({ collection: 'services' }),
      payload.count({
        collection: 'services',
        where: { type: { equals: 'database' } },
      }),
      payload.count({
        collection: 'deployments',
        where: { status: { equals: 'queued' } },
      }),
      payload.count({
        collection: 'deployments',
        where: { status: { equals: 'failed' } },
      }),
      payload.count({ collection: 'backups' }),
    ])

    return {
      users: users.totalDocs,
      newUsers: newUsers.totalDocs,
      servers: servers.totalDocs,
      projects: projects.totalDocs,
      services: services.totalDocs,
      databases: databases.totalDocs,
      queuedDeployments: queuedDeployments.totalDocs,
      failedDeployments: failedDeployments.totalDocs,
      backups: backups.totalDocs,
    }
  })
