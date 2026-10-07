'use server'

import { env } from 'env'
import { BasePayload } from 'payload'

import { assertTenantOwnership } from '@/lib/extractID'
import { protectedClient } from '@/lib/safe-action'
import { extractSSHDetails } from '@/lib/ssh'
import { Service } from '@/payload-types'
import { addExternalBackupQueue } from '@/queues/database/backup/externalBackup'
import { addInternalBackupQueue } from '@/queues/database/backup/internalBackup'
import { deleteInternalBackupQueue } from '@/queues/database/backup/internalBackupDelete'

import {
  externalBackupSchema,
  internalDBBackupSchema,
  internalDbDeleteScheme,
  internalRestoreSchema,
  scheduleExternalBackupSchema,
} from './validator'

export const getAllBackupsAction = protectedClient
  .metadata({
    actionName: 'getAllBackupsAction',
  })
  .action(async ({ ctx }) => {
    const { payload, userTenant } = ctx

    const { docs: backups } = await payload.find({
      collection: 'backups',
      pagination: false,
      sort: '-createdAt',
      where: {
        'tenant.slug': {
          equals: userTenant.tenant?.slug,
        },
      },
    })

    return backups
  })

export const internalBackupAction = protectedClient
  .metadata({
    actionName: 'internalBackupAction',
  })
  .inputSchema(internalDBBackupSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx
    const { serviceId } = clientInput

    const { project, ...serviceDetails } = await payload.findByID({
      collection: 'services',
      depth: 3,
      id: serviceId,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    const now = new Date()

    const formattedDate = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
      String(now.getUTCHours()).padStart(2, '0'),
      String(now.getUTCMinutes()).padStart(2, '0'),
      String(now.getUTCSeconds()).padStart(2, '0'),
    ].join('-')

    const dumpFileName = `${serviceDetails?.name}-${formattedDate}.dump`

    const { id: backupId } = await payload.create({
      collection: 'backups',
      data: {
        service: serviceId,
        type: 'internal',
        databaseType: serviceDetails?.databaseDetails?.type,
        backupName: dumpFileName,
        status: 'in-progress',
        tenant: userTenant.tenant?.id,
      },
    })

    let queueResponseId: string | undefined = ''

    if (typeof project === 'object' && typeof project?.server === 'object') {
      const sshDetails = extractSSHDetails({ project })

      const { id } = await addInternalBackupQueue({
        databaseName: serviceDetails?.name,
        databaseType: serviceDetails?.databaseDetails?.type ?? '',
        sshDetails,
        type: 'export',
        serverDetails: {
          id: project?.server?.id,
        },
        dumpFileName,
        serviceId,
        backupId,
        tenant: {
          slug: userTenant.tenant.slug,
        },
      })
      queueResponseId = id
    }

    return {
      success: true,
      queueResponseId: queueResponseId,
    }
  })

export const internalRestoreAction = protectedClient
  .metadata({
    actionName: 'internalRestoreAction',
  })
  .inputSchema(internalRestoreSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serviceId, backupId } = clientInput
    const { payload, userTenant } = ctx

    const [{ project, ...serviceDetails }, backup] = await Promise.all([
      payload.findByID({
        collection: 'services',
        depth: 3,
        id: serviceId,
      }),
      payload.findByID({
        collection: 'backups',
        id: backupId,
      }),
    ])
    assertTenantOwnership(
      serviceDetails.tenant,
      userTenant.tenant.id,
      'Service',
    )
    assertTenantOwnership(backup.tenant, userTenant.tenant.id, 'Backup')

    // Refuse cross-type restores (e.g. mongo dump into postgres, #484).
    // Legacy backups without a recorded type can't be verified, allow those.
    const backupType = backup.databaseType ?? null
    const serviceType = serviceDetails?.databaseDetails?.type ?? null
    if (backupType && serviceType && backupType !== serviceType) {
      throw new Error(
        `Backup type mismatch: backup is ${backupType}, target database is ${serviceType}`,
      )
    }

    let queueResponseId: string | undefined = ''

    if (typeof project === 'object' && typeof project?.server === 'object') {
      const sshDetails = extractSSHDetails({ project })

      const { id } = await addInternalBackupQueue({
        databaseName: serviceDetails?.name,
        databaseType: serviceType ?? '',
        sshDetails,
        type: 'import',
        serverDetails: {
          id: project?.server?.id,
        },
        serviceId,
        backupId,
        dumpFileName: backup.backupName ?? undefined,
        tenant: {
          slug: userTenant.tenant.slug,
        },
      })
      queueResponseId = id
    }

    return {
      success: true,
      queueResponseId: queueResponseId,
    }
  })

const S3_BUCKET = env.S3_BUCKET || 'dflow'

// Resolves the service + owning server + SSH details for external-backup
// operations, enforcing tenant ownership (#407).
const resolveManagedDatabase = async ({
  payload,
  serviceId,
  tenantId,
}: {
  payload: BasePayload
  serviceId: string
  tenantId: string
}) => {
  const { project, ...serviceDetails } = await payload.findByID({
    collection: 'services',
    depth: 3,
    id: serviceId,
  })
  assertTenantOwnership(serviceDetails.tenant, tenantId, 'Service')

  if (serviceDetails.databaseDetails?.provider === 'external') {
    throw new Error(
      'Externally-managed databases cannot use dokku backups — the provider owns dump access',
    )
  }

  if (
    typeof project !== 'object' ||
    typeof project?.server !== 'object' ||
    !project.server
  ) {
    throw new Error('Could not resolve the server hosting this database')
  }

  return {
    serviceDetails: serviceDetails as Service,
    project,
    server: project.server,
    sshDetails: extractSSHDetails({ project }),
  }
}

const s3Configured = () =>
  !!(
    env.S3_ENDPOINT &&
    env.S3_REGION &&
    env.S3_ACCESS_KEY_ID &&
    env.S3_SECRET_ACCESS_KEY
  )

// Stores the instance's S3 credentials on the dokku plugin so
// <db>:backup / :backup-schedule can upload dumps (#407).
export const configureExternalBackupAction = protectedClient
  .metadata({ actionName: 'configureExternalBackupAction' })
  .inputSchema(externalBackupSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx
    const { serviceId } = clientInput

    if (!s3Configured()) {
      throw new Error(
        'S3 is not configured — set S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
      )
    }

    const { serviceDetails, server, sshDetails } =
      await resolveManagedDatabase({
        payload,
        serviceId,
        tenantId: userTenant.tenant.id,
      })

    const { id } = await addExternalBackupQueue({
      databaseName: serviceDetails.name,
      databaseType: serviceDetails.databaseDetails?.type ?? '',
      op: 'auth',
      bucket: S3_BUCKET,
      awsAccessKeyId: env.S3_ACCESS_KEY_ID,
      awsSecretAccessKey: env.S3_SECRET_ACCESS_KEY,
      awsDefaultRegion: env.S3_REGION,
      endPointUrl: env.S3_ENDPOINT,
      sshDetails,
      serverDetails: { id: server.id },
      serviceId,
      tenant: { slug: userTenant.tenant.slug },
    })

    return { success: true, queueResponseId: id }
  })

// Manual one-shot dump to S3 (#407).
export const externalBackupAction = protectedClient
  .metadata({ actionName: 'externalBackupAction' })
  .inputSchema(externalBackupSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx
    const { serviceId } = clientInput

    if (!s3Configured()) {
      throw new Error(
        'S3 is not configured — set S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
      )
    }

    const { serviceDetails, server, sshDetails } =
      await resolveManagedDatabase({
        payload,
        serviceId,
        tenantId: userTenant.tenant.id,
      })

    const now = new Date()
    const formattedDate = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
      String(now.getUTCHours()).padStart(2, '0'),
      String(now.getUTCMinutes()).padStart(2, '0'),
      String(now.getUTCSeconds()).padStart(2, '0'),
    ].join('-')

    const { id: backupId } = await payload.create({
      collection: 'backups',
      data: {
        service: serviceId,
        type: 'external',
        databaseType: serviceDetails?.databaseDetails?.type,
        backupName: `${serviceDetails?.name}-${formattedDate}`,
        destination: `s3://${S3_BUCKET}/${serviceDetails?.name}`,
        status: 'in-progress',
        tenant: userTenant.tenant?.id,
      },
    })

    const { id } = await addExternalBackupQueue({
      databaseName: serviceDetails.name,
      databaseType: serviceDetails.databaseDetails?.type ?? '',
      op: 'backup',
      bucket: S3_BUCKET,
      awsAccessKeyId: env.S3_ACCESS_KEY_ID,
      awsSecretAccessKey: env.S3_SECRET_ACCESS_KEY,
      awsDefaultRegion: env.S3_REGION,
      endPointUrl: env.S3_ENDPOINT,
      sshDetails,
      serverDetails: { id: server.id },
      serviceId,
      backupId,
      tenant: { slug: userTenant.tenant.slug },
    })

    return { success: true, queueResponseId: id }
  })

// Schedule a recurring external backup (dokku cron) (#407).
export const scheduleExternalBackupAction = protectedClient
  .metadata({ actionName: 'scheduleExternalBackupAction' })
  .inputSchema(scheduleExternalBackupSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx
    const { serviceId, schedule } = clientInput

    if (!s3Configured()) {
      throw new Error(
        'S3 is not configured — set S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
      )
    }

    const { serviceDetails, server, sshDetails } =
      await resolveManagedDatabase({
        payload,
        serviceId,
        tenantId: userTenant.tenant.id,
      })

    const { id } = await addExternalBackupQueue({
      databaseName: serviceDetails.name,
      databaseType: serviceDetails.databaseDetails?.type ?? '',
      op: 'schedule',
      bucket: S3_BUCKET,
      cronSchedule: schedule,
      awsAccessKeyId: env.S3_ACCESS_KEY_ID,
      awsSecretAccessKey: env.S3_SECRET_ACCESS_KEY,
      awsDefaultRegion: env.S3_REGION,
      endPointUrl: env.S3_ENDPOINT,
      sshDetails,
      serverDetails: { id: server.id },
      serviceId,
      tenant: { slug: userTenant.tenant.slug },
    })

    await payload.update({
      collection: 'services',
      id: serviceId,
      data: {
        databaseDetails: {
          ...serviceDetails.databaseDetails,
          backupSchedule: schedule,
        },
      },
    })

    return { success: true, queueResponseId: id }
  })

export const unscheduleExternalBackupAction = protectedClient
  .metadata({ actionName: 'unscheduleExternalBackupAction' })
  .inputSchema(externalBackupSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx
    const { serviceId } = clientInput

    const { serviceDetails, server, sshDetails } =
      await resolveManagedDatabase({
        payload,
        serviceId,
        tenantId: userTenant.tenant.id,
      })

    const { id } = await addExternalBackupQueue({
      databaseName: serviceDetails.name,
      databaseType: serviceDetails.databaseDetails?.type ?? '',
      op: 'unschedule',
      bucket: S3_BUCKET,
      sshDetails,
      serverDetails: { id: server.id },
      serviceId,
      tenant: { slug: userTenant.tenant.slug },
    })

    await payload.update({
      collection: 'services',
      id: serviceId,
      data: {
        databaseDetails: {
          ...serviceDetails.databaseDetails,
          backupSchedule: '',
        },
      },
    })

    return { success: true, queueResponseId: id }
  })

export const internalDbDeleteAction = protectedClient
  .metadata({
    actionName: 'internalDbDeleteAction',
  })
  .inputSchema(internalDbDeleteScheme)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx
    const { backupId, serviceId, databaseType } = clientInput

    const { project, ...serviceDetails } = await payload.findByID({
      collection: 'services',
      depth: 3,
      id: serviceId,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    let queueResponseId: string | undefined = ''

    if (typeof project === 'object' && typeof project?.server === 'object') {
      const sshDetails = extractSSHDetails({ project })

      const { id } = await deleteInternalBackupQueue({
        backupId,
        serviceId,
        sshDetails,
        databaseName: serviceDetails?.name,
        databaseType: databaseType || '',
        serverDetails: {
          id: project?.server?.id,
        },
        tenant: {
          slug: userTenant.tenant.slug,
        },
      })
      queueResponseId = id
    }

    return {
      success: true,
      queueResponseId: queueResponseId,
    }
  })
