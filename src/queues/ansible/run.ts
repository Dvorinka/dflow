import configPromise from '@payload-config'
import { Job } from 'bullmq'
import { spawn } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getPayload } from 'payload'

import { getQueue, getWorker } from '@/lib/bullmq'
import { jobOptions, pub, queueConnection } from '@/lib/redis'
import { sendEvent } from '@/lib/sendEvent'
import { SSHType } from '@/lib/ssh'

interface QueueArgs {
  executionId: string
  playbookContent: string
  serverDetails: {
    id: string
    name: string
  }
  sshDetails: SSHType
  tenantDetails: {
    slug: string
  }
}

const OUTPUT_CAP = 200_000

const finishExecution = async (
  executionId: string,
  status: 'success' | 'failed',
  exitCode: number | null,
  output: string,
) => {
  const payload = await getPayload({ config: configPromise })

  await payload.update({
    collection: 'ansibleExecutions',
    id: executionId,
    data: {
      status,
      exitCode: exitCode ?? undefined,
      output: output.slice(0, OUTPUT_CAP),
      completedAt: new Date().toISOString(),
    },
  })
}

export const addAnsibleRunQueue = async (data: QueueArgs) => {
  const QUEUE_NAME = `server-${data.serverDetails.id}-ansible-run`

  const ansibleRunQueue = getQueue({
    name: QUEUE_NAME,
    connection: queueConnection,
  })

  const worker = getWorker<QueueArgs>({
    name: QUEUE_NAME,
    processor: async job => {
      const { executionId, playbookContent, serverDetails, sshDetails } =
        job.data
      const payload = await getPayload({ config: configPromise })

      const emit = (message: string) =>
        sendEvent({ pub, message, serverId: serverDetails.id })

      await payload.update({
        collection: 'ansibleExecutions',
        id: executionId,
        data: { status: 'running', startedAt: new Date().toISOString() },
      })

      const workDir = mkdtempSync(join(tmpdir(), 'dflow-ansible-'))
      let output = ''
      const append = (chunk: string) => {
        if (output.length < OUTPUT_CAP) output += chunk
      }

      try {
        writeFileSync(join(workDir, 'playbook.yml'), playbookContent, {
          mode: 0o600,
        })

        // inventory — the server's existing SSH details become the
        // ansible connection; keys are written to a private temp file
        let hostLine: string
        if (sshDetails.type === 'ssh') {
          const keyPath = join(workDir, 'ssh_key')
          writeFileSync(keyPath, sshDetails.privateKey, { mode: 0o600 })
          chmodSync(keyPath, 0o600)
          hostLine = `${serverDetails.name} ansible_host=${sshDetails.ip} ansible_port=${sshDetails.port} ansible_user=${sshDetails.username} ansible_ssh_private_key_file=${keyPath}`
        } else {
          hostLine = `${serverDetails.name} ansible_host=${sshDetails.hostname} ansible_user=${sshDetails.username}`
        }
        writeFileSync(join(workDir, 'hosts.ini'), `[servers]\n${hostLine}\n`)

        emit(`Running ansible-playbook on ${serverDetails.name}...`)

        const exitCode = await new Promise<number>(resolve => {
          const child = spawn(
            'ansible-playbook',
            ['-i', 'hosts.ini', 'playbook.yml'],
            {
              cwd: workDir,
              env: {
                ...process.env,
                ANSIBLE_HOST_KEY_CHECKING: 'False',
                ANSIBLE_FORCE_COLOR: '0',
              },
            },
          )

          child.stdout.on('data', (chunk: Buffer) => {
            const text = chunk.toString()
            append(text)
            emit(text.trimEnd())
          })
          child.stderr.on('data', (chunk: Buffer) => {
            const text = chunk.toString()
            append(text)
            emit(text.trimEnd())
          })
          child.on('error', error => {
            append(`spawn failed: ${error.message}\n`)
            emit(
              `ansible-playbook not found or failed to start: ${error.message}`,
            )
            resolve(127)
          })
          child.on('close', code => resolve(code ?? 1))
        })

        const status = exitCode === 0 ? 'success' : 'failed'
        await finishExecution(executionId, status, exitCode, output)
        emit(
          `Playbook finished — exit code ${exitCode}`,
        )

        if (exitCode !== 0) {
          throw new Error(`ansible-playbook exited with code ${exitCode}`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await finishExecution(executionId, 'failed', null, output || message)
        throw new Error(`Ansible run failed: ${message}`)
      } finally {
        rmSync(workDir, { recursive: true, force: true })
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

  const id = `ansible-run-${data.executionId}`

  return await ansibleRunQueue.add(id, data, {
    ...jobOptions,
    jobId: id,
  })
}
