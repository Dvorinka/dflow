import configPromise from '@payload-config'
import { Job } from 'bullmq'
import { NodeSSH } from 'node-ssh'
import { getPayload } from 'payload'

import { getQueue, getWorker } from '@/lib/bullmq'
import { dokku } from '@/lib/dokku'
import { jobOptions, pub, queueConnection } from '@/lib/redis'
import { sendActionEvent, sendEvent } from '@/lib/sendEvent'
import { SSHType, dynamicSSH } from '@/lib/ssh'
import { Service } from '@/payload-types'

interface QueueArgs {
  databaseType: string
  databaseName: string
  op: 'auth' | 'backup' | 'schedule' | 'unschedule' | 'deauth'
  bucket: string
  cronSchedule?: string
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
  awsDefaultRegion?: string
  endPointUrl?: string
  sshDetails: SSHType
  serverDetails: {
    id: string
  }
  serviceId: Service['id']
  backupId?: string
  tenant: {
    slug: string
  }
}

export const addExternalBackupQueue = async (data: QueueArgs) => {
  const QUEUE_NAME = `server-${data.serverDetails.id}-database-backup-external`

  const externalBackupQueue = getQueue({
    name: QUEUE_NAME,
    connection: queueConnection,
  })

  const worker = getWorker<QueueArgs>({
    name: QUEUE_NAME,
    processor: async job => {
      const payload = await getPayload({ config: configPromise })
      const {
        databaseName,
        databaseType,
        op,
        bucket,
        cronSchedule,
        awsAccessKeyId,
        awsSecretAccessKey,
        awsDefaultRegion,
        endPointUrl,
        sshDetails,
        serverDetails,
        backupId,
        tenant,
      } = job.data

      let ssh: NodeSSH | null = null
      const emit = async (chunk: Buffer | string) =>
        sendEvent({
          pub,
          message: chunk.toString(),
          serverId: serverDetails.id,
        })

      console.log(
        `starting external backup op=${op} for ${databaseType} database ${databaseName}`,
      )

      try {
        ssh = await dynamicSSH(sshDetails)
        const options = { onStdout: emit, onStderr: emit }

        // Re-auth on every op when creds are supplied — cheap, idempotent,
        // and keeps one-click backup working even if auth was never run.
        if (op !== 'deauth' && awsAccessKeyId && awsSecretAccessKey) {
          await dokku.database.backup.auth(
            ssh,
            databaseType,
            databaseName,
            awsAccessKeyId,
            awsSecretAccessKey,
            awsDefaultRegion ?? '',
            3,
            endPointUrl ?? '',
            options,
          )
        }

        let result: { code: number | null }

        switch (op) {
          case 'auth':
            result = await dokku.database.backup.auth(
              ssh,
              databaseType,
              databaseName,
              awsAccessKeyId ?? '',
              awsSecretAccessKey ?? '',
              awsDefaultRegion ?? '',
              3, // aws signature v4
              endPointUrl ?? '',
              options,
            )
            break
          case 'backup':
            result = await dokku.database.backup.backup(
              ssh,
              databaseType,
              databaseName,
              bucket,
              options,
            )
            break
          case 'schedule':
            result = await dokku.database.backup.schedule(
              ssh,
              databaseType,
              databaseName,
              bucket,
              cronSchedule ?? '0 3 * * *',
              options,
            )
            break
          case 'unschedule':
            result = await dokku.database.backup.unschedule(
              ssh,
              databaseType,
              databaseName,
              options,
            )
            break
          case 'deauth':
            result = await dokku.database.backup.deauth(
              ssh,
              databaseType,
              databaseName,
              options,
            )
            break
        }

        if (result.code === 0) {
          sendEvent({
            pub,
            message: `✅ External backup ${op} for ${databaseName} succeeded`,
            serverId: serverDetails.id,
          })

          if (op === 'backup' && backupId) {
            await payload.update({
              collection: 'backups',
              data: { status: 'success' },
              id: backupId,
            })
          }

          sendActionEvent({
            pub,
            action: 'refresh',
            tenantSlug: tenant.slug,
          })
        } else {
          throw new Error(
            `dokku ${databaseType}:backup-${op === 'auth' ? 'auth' : op} exited with code ${result.code}`,
          )
        }
      } catch (error) {
        if (op === 'backup' && backupId) {
          await payload
            .update({
              collection: 'backups',
              data: { status: 'failed' },
              id: backupId,
            })
            .catch(() => {})
        }
        let message = error instanceof Error ? error.message : ''
        throw new Error(
          `❌ External backup ${op} for ${databaseType} database ${databaseName} failed: ${message}`,
        )
      } finally {
        if (ssh) {
          ssh.dispose()
        }
      }
    },
    connection: queueConnection,
  })

  worker.on('failed', async (job: Job<QueueArgs> | undefined, err) => {
    const serverDetails = job?.data?.serverDetails

    if (serverDetails) {
      sendEvent({
        pub,
        message: err.message,
        serverId: serverDetails.id,
      })
    }
  })

  const id = `backup-external-${data.op}-${data.databaseType}-${data.databaseName}:${new Date().getTime()}`

  return await externalBackupQueue.add(id, data, {
    ...jobOptions,
    jobId: id,
  })
}
