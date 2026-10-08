import { Job } from 'bullmq'
import { env } from 'env'
import { NodeSSH } from 'node-ssh'

import { getQueue, getWorker } from '@/lib/bullmq'
import { dokku } from '@/lib/dokku'
import { jobOptions, pub, queueConnection } from '@/lib/redis'
import { sendEvent } from '@/lib/sendEvent'
import { SSHType, dynamicSSH } from '@/lib/ssh'

interface QueueArgs {
  sshDetails: SSHType
  serverDetails: {
    id: string
    hostname: string
  }
  serviceDetails: {
    name: string
    email?: string
  }
}

export const addLetsencryptRegenerateQueueQueue = async (data: QueueArgs) => {
  const QUEUE_NAME = `server-${data.serverDetails.id}-letsencrypt-regenerate`

  const letsencryptRegenerateQueue = getQueue({
    name: QUEUE_NAME,
    connection: queueConnection,
  })

  const worker = getWorker<QueueArgs>({
    name: QUEUE_NAME,
    processor: async job => {
      const { sshDetails, serverDetails, serviceDetails } = job.data
      const { email, name } = serviceDetails
      let ssh: NodeSSH | null = null

      try {
        ssh = await dynamicSSH(sshDetails)

        if (email) {
          // add letsencrypt generation through this email for app
          await dokku.letsencrypt.addEmail({
            ssh,
            email,
            appName: name,
            options: {
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
              },
            },
          })
        }

        // check domains before removing wildcard-domain
        const domainsList = await dokku.domains.list({
          ssh,
          appName: serviceDetails.name,
        })

        // the actual attached proxy-suffixed domain — derived, not
        // constructed, so both the old `name.hostname.proxy` format and
        // the new flattened `name-hostname.proxy` format resolve
        const proxyDomain = domainsList.find(domain =>
          domain.endsWith(env.NEXT_PUBLIC_PROXY_DOMAIN_URL ?? ' '),
        )

        console.log({ domainsList, proxyDomain })

        // skipping letsencrypt enablement when there is single proxy domain
        if (proxyDomain && domainsList.length === 1) {
          sendEvent({
            pub,
            message: `Skipping regenerated SSL certificates for service: ${name}`,
            serverId: serverDetails.id,
          })

          return
        }

        if (proxyDomain) {
          // remove the wildcard-domain before generating letsencrypt
          const removeResponse = await dokku.domains.remove(
            ssh,
            serviceDetails.name,
            proxyDomain,
          )

          console.dir({ removeResponse }, { depth: null })
        }

        const letsencryptEmailResponse = await dokku.letsencrypt.enable(
          ssh,
          name,
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
            },
          },
        )

        if (letsencryptEmailResponse.code === 0) {
          sendEvent({
            pub,
            message: `Successfully regenerated SSL certificates for service: ${name}`,
            serverId: serverDetails.id,
          })

          // remove email from the letsencrypt config for service
          if (email) {
            await dokku.letsencrypt.addEmail({
              ssh,
              email: '',
              appName: name,
              options: {
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
                },
              },
            })
          }
        }

        // add the wildcard-domain after generating letsencrypt
        if (proxyDomain) {
          const addResponse = await dokku.domains.add(
            ssh,
            serviceDetails.name,
            proxyDomain,
          )

          console.dir({ addResponse }, { depth: null })
        }
      } catch (error) {
        let message = error instanceof Error ? error.message : ''
        throw new Error(`failed to regenerate SSL certificates: ${message}`)
      } finally {
        ssh?.dispose()
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

  const id = `letsencrypt-regenerate:${new Date().getTime()}`

  return await letsencryptRegenerateQueue.add(id, data, {
    jobId: id,
    ...jobOptions,
  })
}
