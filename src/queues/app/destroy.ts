import { NodeSSH } from 'node-ssh'

import { getQueue, getWorker } from '@/lib/bullmq'
import { dokku } from '@/lib/dokku'
import { jobOptions, pub, queueConnection } from '@/lib/redis'
import { sendEvent } from '@/lib/sendEvent'
import { SSHType, dynamicSSH } from '@/lib/ssh'

interface QueueArgs {
  sshDetails: SSHType
  serviceDetails: {
    name: string
  }
  serverDetails: {
    id: string
  }
  deleteVolumes?: boolean
}

// Only dokku-managed storage is removed. Arbitrary bind mounts are left
// untouched (their data may be shared) and reported in the event log.
const DOKKU_STORAGE_PATH = '/var/lib/dokku/data/storage/'

export const addDestroyApplicationQueue = async (data: QueueArgs) => {
  const QUEUE_NAME = `server-${data?.serverDetails.id}-destroy-application`

  const destroyApplicationQueue = getQueue({
    name: QUEUE_NAME,
    connection: queueConnection,
  })

  getWorker<QueueArgs>({
    name: QUEUE_NAME,
    processor: async job => {
      const { sshDetails, serviceDetails, serverDetails } = job.data
      let ssh: NodeSSH | null = null

      console.log(
        `starting deletingApplication queue for ${serviceDetails.name}`,
      )

      try {
        ssh = await dynamicSSH(sshDetails)

        // Snapshot storage mounts before destroy: afterwards the app (and
        // its storage list) no longer exists.
        let storageMounts: { host_path: string; container_path: string }[] =
          []
        if (job.data.deleteVolumes) {
          try {
            storageMounts = (await dokku.volumes.list(
              ssh,
              serviceDetails.name,
            )) as { host_path: string; container_path: string }[]
          } catch (listError) {
            console.warn(
              `Could not list storage for ${serviceDetails.name}, skipping volume removal:`,
              listError instanceof Error ? listError.message : listError,
            )
          }
        }

        const deletedResponse = await dokku.apps.destroy(
          ssh,
          serviceDetails.name,
          {
            onStdout: async chunk => {
              sendEvent({
                pub,
                message: chunk.toString(),
                serverId: serverDetails.id,
              })
            },
            onStderr: async chunk => {
              sendEvent({
                pub,
                message: chunk.toString(),
                serverId: serverDetails.id,
              })

              console.info({
                deleteApplicationLogs: {
                  message: chunk.toString(),
                  type: 'stdout',
                },
              })
            },
          },
        )

        if (deletedResponse) {
          sendEvent({
            pub,
            message: `✅ Successfully deleted ${serviceDetails.name}`,
            serverId: serverDetails.id,
          })

          // ponytail: bind mounts outside dokku storage are reported, not
          // removed; docker named-volume orphans are out of scope.
          for (const mount of storageMounts) {
            const hostPath = mount.host_path
            // Guard: only touch dokku-managed paths with safe characters —
            // the value comes from server output, never trust it blindly.
            const safePath =
              typeof hostPath === 'string' &&
              hostPath.startsWith(DOKKU_STORAGE_PATH) &&
              /^[A-Za-z0-9/_\-.]+$/.test(hostPath)
            if (safePath) {
              const rm = await ssh.execCommand(`rm -rf "${hostPath}"`)
              sendEvent({
                pub,
                message:
                  rm.code === 0
                    ? `🗑️ Removed storage volume ${hostPath}`
                    : `⚠️ Could not remove storage volume ${hostPath}: ${rm.stderr}`,
                serverId: serverDetails.id,
              })
            } else if (hostPath) {
              sendEvent({
                pub,
                message: `⚠️ Kept bind mount ${hostPath} (outside dokku storage, remove manually if needed)`,
                serverId: serverDetails.id,
              })
            }
          }
        }
      } catch (error) {
        let message = error instanceof Error ? error.message : ''
        throw new Error(
          `❌ Failed deleting ${serviceDetails?.name}: ${message}`,
        )
      } finally {
        if (ssh) {
          ssh.dispose()
        }
      }
    },
    connection: queueConnection,
  })

  const id = `destroy-app-${data.serviceDetails.name}:${new Date().getTime()}`

  return await destroyApplicationQueue.add(id, data, {
    jobId: id,
    ...jobOptions,
  })
}
