import type { TaskConfig } from 'payload'

import { extractSSHDetails } from '@/lib/ssh'
import { addCleanupServerQueue } from '@/queues/server/cleanup'

export interface ScheduledCleanupConfig {
  cronTime?: string
  queueName?: string
}

const DEFAULT_CRON = '0 4 * * *' // daily at 04:00
export const DEFAULT_QUEUE_NAME = 'server-scheduled-cleanup'

// Runs the on-demand cleanup queue for every server opted into automatic
// cleanup, using each server's stored settings (#405).
export const createScheduledCleanupTask = (
  config: ScheduledCleanupConfig = {},
): TaskConfig<'scheduled-cleanup'> => {
  const cronTime = config.cronTime ?? DEFAULT_CRON
  const queueName = config.queueName ?? DEFAULT_QUEUE_NAME

  return {
    slug: 'scheduled-cleanup',
    label: 'dFlow Scheduled Server Cleanup',
    schedule: [
      {
        cron: cronTime,
        queue: queueName,
      },
    ],
    handler: async ({ req }) => {
      const { docs: servers } = await req.payload.find({
        collection: 'servers',
        pagination: false,
        depth: 1,
        where: {
          and: [
            { 'autoCleanup.enabled': { equals: true } },
            { deletedAt: { exists: false } },
          ],
        },
      })

      let queued = 0
      const skipped: string[] = []

      for (const server of servers) {
        try {
          const sshDetails = extractSSHDetails({ server })
          const tenant = (server as { tenant?: unknown }).tenant
          const tenantSlug =
            typeof tenant === 'object' && tenant !== null
              ? (tenant as { slug: string }).slug
              : undefined
          const tenantId =
            typeof tenant === 'object' && tenant !== null
              ? (tenant as { id: string }).id
              : typeof tenant === 'string'
                ? tenant
                : undefined

          if (!tenantSlug || !tenantId) {
            skipped.push(server.id)
            continue
          }

          const autoCleanup =
            (server as { autoCleanup?: unknown }).autoCleanup ?? {}
          const { enabled: _enabled, ...options } = autoCleanup as {
            enabled?: boolean
            olderThanHours?: number
            pruneVolumes?: boolean
          }

          await addCleanupServerQueue({
            sshDetails,
            serverDetails: { id: server.id },
            tenant: { slug: tenantSlug, id: tenantId },
            options: {
              olderThanHours: options.olderThanHours ?? 168,
              pruneVolumes: options.pruneVolumes ?? false,
              dokkuCleanup: true,
            },
          })
          queued++
        } catch (error) {
          req.payload.logger.error(
            `Scheduled cleanup: skipping server ${server.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
          )
          skipped.push(server.id)
        }
      }

      req.payload.logger.info(
        `Scheduled cleanup queued for ${queued} server(s), skipped ${skipped.length}`,
      )

      return {
        output: { success: true, queued, skipped },
      }
    },
  }
}
