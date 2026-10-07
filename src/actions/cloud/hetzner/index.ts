'use server'

import configPromise from '@payload-config'
import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'

import { hetznerClient, hetznerError } from '@/lib/axios/hetzner'
import { assertTenantOwnership } from '@/lib/extractID'
import { protectedClient } from '@/lib/safe-action'
import { CloudProviderAccount } from '@/payload-types'

import {
  connectHetznerAccountSchema,
  createHetznerServerSchema,
  hetznerAccountIdSchema,
  updateHetznerAccountSchema,
} from './validator'

const getAccountClient = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  accountId: string,
  tenantId: string,
) => {
  const account = await payload.findByID({
    collection: 'cloudProviderAccounts',
    id: accountId,
  })
  assertTenantOwnership(account.tenant, tenantId, 'Cloud provider account')

  const apiToken = account.hetznerDetails?.apiToken
  if (account.type !== 'hetzner' || !apiToken) {
    throw new Error('Selected account is not a Hetzner Cloud account')
  }

  return { account, client: hetznerClient(apiToken) }
}

// Verifies the token against the Hetzner API before storing it.
export const connectHetznerAccountAction = protectedClient
  .metadata({ actionName: 'connectHetznerAccountAction' })
  .inputSchema(connectHetznerAccountSchema)
  .action(async ({ clientInput, ctx }) => {
    const { name, apiToken } = clientInput
    const { userTenant, payload } = ctx

    try {
      await hetznerClient(apiToken).get('/locations')
    } catch (error) {
      throw hetznerError(error, 'Hetzner API token check failed')
    }

    const response: CloudProviderAccount = await payload.create({
      collection: 'cloudProviderAccounts',
      data: {
        type: 'hetzner',
        hetznerDetails: { apiToken },
        tenant: userTenant.tenant,
        name,
      },
    })

    return response
  })

export const updateHetznerAccountAction = protectedClient
  .metadata({ actionName: 'updateHetznerAccountAction' })
  .inputSchema(updateHetznerAccountSchema)
  .action(async ({ clientInput, ctx }) => {
    const { name, apiToken, id } = clientInput
    const { userTenant, payload } = ctx

    const existing = await payload.findByID({
      collection: 'cloudProviderAccounts',
      id,
    })
    assertTenantOwnership(
      existing.tenant,
      userTenant.tenant.id,
      'Cloud provider account',
    )

    try {
      await hetznerClient(apiToken).get('/locations')
    } catch (error) {
      throw hetznerError(error, 'Hetzner API token check failed')
    }

    return payload.update({
      collection: 'cloudProviderAccounts',
      id,
      data: {
        type: 'hetzner',
        hetznerDetails: { apiToken },
        name,
      },
    })
  })

export const listHetznerLocationsAction = protectedClient
  .metadata({ actionName: 'listHetznerLocationsAction' })
  .inputSchema(hetznerAccountIdSchema)
  .action(async ({ clientInput, ctx }) => {
    const { client } = await getAccountClient(
      ctx.payload,
      clientInput.accountId,
      ctx.userTenant.tenant.id,
    )

    try {
      const { data } = await client.get('/locations')
      return (data.locations ?? []).map((l: any) => ({
        name: l.name as string,
        city: l.city as string,
        country: l.country as string,
      }))
    } catch (error) {
      throw hetznerError(error, 'Failed to list Hetzner locations')
    }
  })

export const listHetznerServerTypesAction = protectedClient
  .metadata({ actionName: 'listHetznerServerTypesAction' })
  .inputSchema(hetznerAccountIdSchema)
  .action(async ({ clientInput, ctx }) => {
    const { client } = await getAccountClient(
      ctx.payload,
      clientInput.accountId,
      ctx.userTenant.tenant.id,
    )

    try {
      const { data } = await client.get('/server_types', {
        params: { per_page: 50 },
      })
      return (data.server_types ?? [])
        .filter((t: any) => !t.deprecated)
        .map((t: any) => ({
          name: t.name as string,
          description: t.description as string,
          cores: t.cores as number,
          memory: t.memory as number,
          disk: t.disk as number,
          architecture: t.architecture as string,
        }))
    } catch (error) {
      throw hetznerError(error, 'Failed to list Hetzner server types')
    }
  })

// System images only — apps/snapshots are not valid for fresh installs.
export const listHetznerImagesAction = protectedClient
  .metadata({ actionName: 'listHetznerImagesAction' })
  .inputSchema(hetznerAccountIdSchema)
  .action(async ({ clientInput, ctx }) => {
    const { client } = await getAccountClient(
      ctx.payload,
      clientInput.accountId,
      ctx.userTenant.tenant.id,
    )

    try {
      const { data } = await client.get('/images', {
        params: { type: 'system', architecture: 'x86', per_page: 50 },
      })
      return (data.images ?? [])
        .filter((i: any) => i.status === 'available')
        .map((i: any) => ({
          id: i.id as number,
          name: (i.name ?? i.description) as string,
          description: i.description as string,
        }))
    } catch (error) {
      throw hetznerError(error, 'Failed to list Hetzner images')
    }
  })

// One-click VPS: uploads the tenant's SSH key if missing, creates the
// server, polls for the public IPv4, then registers it so the existing
// Dokku install / SSH pipeline takes over.
export const createHetznerServerAction = protectedClient
  .metadata({ actionName: 'createHetznerServerAction' })
  .inputSchema(createHetznerServerSchema)
  .action(async ({ clientInput, ctx }) => {
    const {
      name,
      description,
      accountId,
      sshKeyId,
      location,
      serverType,
      image,
    } = clientInput
    const {
      user,
      userTenant: { tenant, role },
    } = ctx
    const payload = await getPayload({ config: configPromise })

    if (Number(role?.servers?.createLimit) > 0) {
      const { totalDocs } = await payload.count({
        collection: 'servers',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { createdBy: { equals: user?.id } },
          ],
        },
      })

      if (totalDocs >= Number(role?.servers?.createLimit)) {
        throw new Error(
          'You have reached your server creation limit. Please contact your administrator.',
        )
      }
    }

    const { client } = await getAccountClient(payload, accountId, tenant.id)

    const sshKeyDetails = await payload.findByID({
      collection: 'sshKeys',
      id: sshKeyId,
    })
    assertTenantOwnership(sshKeyDetails.tenant, tenant.id, 'SSH key')

    try {
      // Register the SSH public key with Hetzner if it isn't there yet.
      const { data: keysData } = await client.get('/ssh_keys')
      const existingKey = (keysData.ssh_keys ?? []).find(
        (k: any) => k.name === sshKeyDetails.name,
      )
      if (!existingKey) {
        await client.post('/ssh_keys', {
          name: sshKeyDetails.name,
          public_key: sshKeyDetails.publicKey,
          labels: { managed_by: 'dflow' },
        })
      }

      const { data } = await client.post('/servers', {
        name,
        server_type: serverType,
        location,
        image,
        ssh_keys: [sshKeyDetails.name],
        start_after_create: true,
        labels: { managed_by: 'dflow' },
      })

      const server = data?.server
      if (!server?.id) {
        throw new Error('Hetzner did not return a server')
      }

      // Poll until public IPv4 is assigned (usually seconds).
      const pollForIp = async (): Promise<string> => {
        for (let i = 0; i < 12; i++) {
          const { data: s } = await client.get(`/servers/${server.id}`)
          const ip = s?.server?.public_net?.ipv4?.ip
          if (ip) return ip
          await new Promise(r => setTimeout(r, 5000))
        }
        throw new Error('Public IP not assigned yet after waiting')
      }

      const ip = await pollForIp()

      const serverResponse = await payload.create({
        collection: 'servers',
        data: {
          name,
          description,
          port: 22,
          sshKey: sshKeyId,
          username: 'root',
          ip,
          provider: 'hetzner',
          cloudProviderAccount: accountId,
          preferConnectionType: 'ssh',
          hetznerDetails: {
            serverId: server.id,
            location,
            serverType,
            image,
            publicIp: ip,
            status: server.status,
          },
          createdBy: user.id,
          tenant,
        },
      })

      if (serverResponse.id) {
        revalidatePath(`/${tenant.slug}/servers`)
        return { success: true, server: serverResponse }
      }
    } catch (error) {
      throw hetznerError(error, 'Failed to create Hetzner server')
    }
  })
