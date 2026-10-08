'use server'

import { revalidatePath } from 'next/cache'

import {
  assertTenantOwnership,
  extractID,
  extractTenantSlug,
} from '@/lib/extractID'
import { protectedClient } from '@/lib/safe-action'
import { extractSSHDetails } from '@/lib/ssh'
import { addAnsibleRunQueue } from '@/queues/ansible/run'

import {
  createPlaybookSchema,
  deletePlaybookSchema,
  getAnsibleExecutionsSchema,
  runAnsiblePlaybookSchema,
} from './validator'

export const getPlaybooksAction = protectedClient
  .metadata({ actionName: 'getPlaybooksAction' })
  .action(async ({ ctx }) => {
    const { payload, userTenant } = ctx

    const { docs } = await payload.find({
      collection: 'ansiblePlaybooks',
      where: {
        'tenant.slug': { equals: userTenant.tenant?.slug },
      },
      pagination: false,
      sort: 'name',
    })

    return docs
  })

export const createPlaybookAction = protectedClient
  .metadata({ actionName: 'createPlaybookAction' })
  .inputSchema(createPlaybookSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx

    const doc = await payload.create({
      collection: 'ansiblePlaybooks',
      data: {
        name: clientInput.name,
        description: clientInput.description,
        playbook: clientInput.playbook,
        tenant: userTenant.tenant?.id,
      },
    })

    return { success: true, playbook: doc }
  })

export const deletePlaybookAction = protectedClient
  .metadata({ actionName: 'deletePlaybookAction' })
  .inputSchema(deletePlaybookSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx

    const playbook = await payload.findByID({
      collection: 'ansiblePlaybooks',
      id: clientInput.playbookId,
    })
    assertTenantOwnership(
      playbook.tenant,
      userTenant.tenant.id,
      'Ansible playbook',
    )

    await payload.delete({
      collection: 'ansiblePlaybooks',
      id: clientInput.playbookId,
    })

    return { success: true }
  })

export const runAnsiblePlaybookAction = protectedClient
  .metadata({ actionName: 'runAnsiblePlaybookAction' })
  .inputSchema(runAnsiblePlaybookSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx
    const { playbookId, serverId } = clientInput

    const playbook = await payload.findByID({
      collection: 'ansiblePlaybooks',
      id: playbookId,
    })
    assertTenantOwnership(
      playbook.tenant,
      userTenant.tenant.id,
      'Ansible playbook',
    )

    // playbook restricted to specific servers
    const allowed = playbook.servers ?? []
    if (
      allowed.length > 0 &&
      !allowed.map(s => extractID(s)).includes(serverId)
    ) {
      throw new Error('Playbook is restricted to other servers')
    }

    const server = await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 2,
    })
    assertTenantOwnership(server.tenant, userTenant.tenant.id, 'Server')

    const sshDetails = extractSSHDetails({ server })

    const execution = await payload.create({
      collection: 'ansibleExecutions',
      data: {
        playbook: playbook.id,
        server: server.id,
        status: 'queued',
        tenant: userTenant.tenant?.id,
      },
    })

    const queueResponse = await addAnsibleRunQueue({
      executionId: execution.id,
      playbookContent: playbook.playbook,
      sshDetails,
      serverDetails: { id: server.id, name: server.name },
      tenantDetails: { slug: userTenant.tenant.slug },
    })

    revalidatePath(
      `/${extractTenantSlug(userTenant.tenant)}/servers/${server.id}`,
    )

    return { success: true, execution, jobId: queueResponse.id }
  })

export const getAnsibleExecutionsAction = protectedClient
  .metadata({ actionName: 'getAnsibleExecutionsAction' })
  .inputSchema(getAnsibleExecutionsSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx
    const { serverId, limit } = clientInput

    const server = await payload.findByID({
      collection: 'servers',
      id: serverId,
    })
    assertTenantOwnership(server.tenant, userTenant.tenant.id, 'Server')

    const { docs } = await payload.find({
      collection: 'ansibleExecutions',
      where: {
        and: [
          { server: { equals: serverId } },
          { 'tenant.slug': { equals: userTenant.tenant?.slug } },
        ],
      },
      sort: '-createdAt',
      limit,
      depth: 1,
    })

    return docs
  })
