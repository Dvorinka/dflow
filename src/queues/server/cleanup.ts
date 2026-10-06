import { Job } from 'bullmq'
import { NodeSSH } from 'node-ssh'

import { getQueue, getWorker } from '@/lib/bullmq'
import { jobOptions, pub, queueConnection } from '@/lib/redis'
import { sendActionEvent, sendEvent } from '@/lib/sendEvent'
import { SSHType, dynamicSSH } from '@/lib/ssh'

interface QueueArgs {
  sshDetails: SSHType
  tenant: {
    slug: string
    id: string
  }
  serverDetails: {
    id: string
  }
  options: {
    olderThanHours: number
    pruneVolumes: boolean
    dokkuCleanup: boolean
  }
}

const runStep = async (
  ssh: NodeSSH,
  serverId: string,
  label: string,
  command: string,
) => {
  sendEvent({ pub, message: `🧹 ${label}...`, serverId })
  const res = await ssh.execCommand(command)
  sendEvent({
    pub,
    message:
      res.code === 0
        ? `✅ ${label} done`
        : `⚠️ ${label} exited with code ${res.code}: ${res.stderr.slice(0, 500)}`,
    serverId,
  })
}

export const addCleanupServerQueue = async (data: QueueArgs) => {
  const QUEUE_NAME = `server-${data.serverDetails.id}-cleanup`

  const cleanupQueue = getQueue({
    name: QUEUE_NAME,
    connection: queueConnection,
  })

  const worker = getWorker<QueueArgs>({
    name: QUEUE_NAME,
    processor: async job => {
      const { sshDetails, serverDetails, tenant, options } = job.data
      let ssh: NodeSSH | null = null

      try {
        ssh = await dynamicSSH(sshDetails)
        const serverId = serverDetails.id
        const until = `${options.olderThanHours}h`

        if (options.dokkuCleanup) {
          await runStep(ssh, serverId, 'Dokku cleanup', 'dokku cleanup')
        }

        // Safe-mode prune: only objects older than the threshold.
        // Volumes excluded unless explicitly requested.
        await runStep(
          ssh,
          serverId,
          `Docker prune (older than ${until}${options.pruneVolumes ? ', incl. volumes' : ''})`,
          `docker system prune -af --filter "until=${until}"${options.pruneVolumes ? ` && docker volume prune -f --filter "until=${until}"` : ''}`,
        )

        sendEvent({
          pub,
          message: '✅ Server cleanup completed',
          serverId,
        })

        sendActionEvent({
          pub,
          action: 'refresh',
          tenantSlug: tenant.slug,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error'
        sendEvent({
          pub,
          message: `❌ Server cleanup failed: ${message}`,
          serverId: job.data.serverDetails.id,
        })
        throw new Error(`Server cleanup failed: ${message}`)
      } finally {
        if (ssh) ssh.dispose()
      }
    },
    connection: queueConnection,
  })

  worker.on('failed', async (job: Job<QueueArgs> | undefined, err) => {
    if (job?.data) {
      sendEvent({
        pub,
        message: err.message,
        serverId: job.data.serverDetails.id,
      })
    }
  })

  const id = `cleanup-server-${data.serverDetails.id}:${new Date().getTime()}`

  return await cleanupQueue.add(id, data, {
    jobId: id,
    ...jobOptions,
  })
}
