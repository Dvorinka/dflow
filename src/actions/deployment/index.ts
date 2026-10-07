'use server'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getQueue } from '@/lib/bullmq'
import { assertTenantOwnership } from '@/lib/extractID'
import { queueConnection } from '@/lib/redis'
import { protectedClient } from '@/lib/safe-action'

import { triggerDeployment } from './deploy'
import { cancelDeploymentSchema, createDeploymentSchema } from './validator'

// No need to handle try/catch that abstraction is taken care by next-safe-actions
export const createDeploymentAction = protectedClient
  .metadata({
    // This action name can be used for sentry tracking
    actionName: 'createDeploymentAction',
  })
  .inputSchema(createDeploymentSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serviceId, projectId, cache = 'no-cache' } = clientInput
    const {
      userTenant: { tenant },
    } = ctx

    const deploymentQueueId = await triggerDeployment({
      serviceId,
      cache,
      tenantSlug: tenant.slug,
      tenantId: tenant.id,
    })

    if (deploymentQueueId) {
      return {
        success: true,
        redirectURL: `/${tenant.slug}/dashboard/project/${projectId}/service/${serviceId}?tab=deployments`,
      }
    }
  })

// Cancel a deployment that hasn't started building yet. Queued BullMQ jobs
// are removed and the record is marked failed. Actively building jobs hold
// open SSH sessions and can't be killed safely, so those are refused (#279).
export const cancelDeploymentAction = protectedClient
  .metadata({
    actionName: 'cancelDeploymentAction',
  })
  .inputSchema(cancelDeploymentSchema)
  .action(async ({ clientInput, ctx }) => {
    const { deploymentId } = clientInput
    const { payload, userTenant } = ctx

    const deployment = await payload.findByID({
      collection: 'deployments',
      id: deploymentId,
    })

    if (deployment.status !== 'queued') {
      throw new Error(
        deployment.status === 'building'
          ? 'Deployment is already building and cannot be cancelled'
          : `Deployment already ${deployment.status}`,
      )
    }

    const service =
      typeof deployment.service === 'object'
        ? deployment.service
        : await payload.findByID({
            collection: 'services',
            id: deployment.service,
            depth: 2,
          })
    assertTenantOwnership(
      (service as { tenant?: unknown }).tenant,
      userTenant.tenant.id,
      'Service',
    )
    const project = (service as { project?: unknown }).project
    const serverId =
      typeof project === 'object' && project !== null
        ? typeof (project as { server?: unknown }).server === 'object'
          ? ((project as { server: { id: string } }).server.id ?? null)
          : ((project as { server?: string }).server ?? null)
        : null

    let removed = 0
    if (serverId) {
      const queueNames = [
        `server-${serverId}-deploy-app`,
        `server-${serverId}-deploy-app-dockerImage`,
        `server-${serverId}-create-database-with-plugins`,
      ]
      for (const name of queueNames) {
        const queue = getQueue({ name, connection: queueConnection })
        // ponytail: match via serialized data; job shapes vary per queue
        // but every deployment job carries its deploymentId.
        const [waiting, active] = await Promise.all([
          queue.getJobs(['waiting', 'delayed', 'prioritized']),
          queue.getJobs(['active']),
        ])
        if (
          active.some(job => JSON.stringify(job.data).includes(deploymentId))
        ) {
          throw new Error(
            'Deployment is already building and cannot be cancelled',
          )
        }
        for (const job of waiting) {
          if (JSON.stringify(job.data).includes(deploymentId)) {
            await job.remove()
            removed++
          }
        }
      }
    }

    const existingLogs = Array.isArray(deployment.logs) ? deployment.logs : []
    await payload.update({
      collection: 'deployments',
      id: deploymentId,
      data: {
        status: 'failed',
        logs: [...existingLogs, 'Cancelled by user before build started'],
      },
    })

    return { success: true, removedJobs: removed }
  })
