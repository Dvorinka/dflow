'use server'

import { assertTenantOwnership } from '@/lib/extractID'
import { protectedClient } from '@/lib/safe-action'
import { extractSSHDetails } from '@/lib/ssh'
import { addInternalBackupQueue } from '@/queues/database/backup/internalBackup'
import { deleteInternalBackupQueue } from '@/queues/database/backup/internalBackupDelete'

import {
  internalDBBackupSchema,
  internalDbDeleteScheme,
  internalRestoreSchema,
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
