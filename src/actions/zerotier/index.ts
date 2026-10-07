'use server'

import { env } from 'env'

import zerotier from '@/lib/axios/zerotier'
import { protectedClient } from '@/lib/safe-action'

import { authorizeZerotierMemberSchema } from './validator'

const isConfigured = () =>
  Boolean(env.ZEROTIER_API_TOKEN) && Boolean(env.ZEROTIER_NETWORK_ID)

interface ZtMember {
  nodeId: string
  name?: string
  authorized: boolean
  ipAssignments: string[]
  lastSeen?: number
  online?: boolean
}

const toMember = (m: any): ZtMember => ({
  nodeId: m.nodeId ?? m.id ?? '',
  name: m.name,
  authorized: Boolean(m.config?.authorized ?? m.authorized),
  ipAssignments: (m.config?.ipAssignments ?? m.ipAssignments ?? []) as string[],
  lastSeen: m.lastSeen ?? m.lastAuthorizedTime ?? undefined,
  online: Boolean(m.online),
})

// Lets the UI decide between the API-driven authorize flow and a fully
// manual path (paste your own ZeroTier IP).
export const zerotierConfiguredAction = protectedClient
  .metadata({ actionName: 'zerotierConfiguredAction' })
  .action(async () => ({
    configured: isConfigured(),
    apiUrl: env.ZEROTIER_API_URL ?? 'https://api.zerotier.com/api/v1',
    // The network ID is required for `zerotier-cli join`, so it is safe to
    // surface to authenticated users — it is not a credential.
    networkId: env.ZEROTIER_NETWORK_ID ?? null,
  }))

// Lists members of the configured network. The UI uses this to find the
// machine that just ran `zerotier-cli join` so it can be authorized.
export const getZerotierMembersAction = protectedClient
  .metadata({ actionName: 'getZerotierMembersAction' })
  .action(async () => {
    if (!isConfigured()) {
      throw new Error(
        'ZeroTier is not configured. Set ZEROTIER_API_TOKEN and ZEROTIER_NETWORK_ID, or enter the mesh IP manually.',
      )
    }

    try {
      const { data } = await zerotier.get(
        `/network/${env.ZEROTIER_NETWORK_ID}/member`,
      )

      const members = (Array.isArray(data) ? data : []).map(toMember)
      return { success: true as const, members }
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('ZeroTier API token is invalid or expired')
      }
      if (error.response?.status === 404) {
        throw new Error(
          'ZeroTier network not found — check ZEROTIER_NETWORK_ID',
        )
      }
      throw new Error(
        `Failed to list ZeroTier members: ${error.message || 'unknown error'}`,
      )
    }
  })

// Authorizes a joined member on the network and names it, returning its
// assigned mesh IPs so the server record can be created over SSH.
export const authorizeZerotierMemberAction = protectedClient
  .metadata({ actionName: 'authorizeZerotierMemberAction' })
  .inputSchema(authorizeZerotierMemberSchema)
  .action(async ({ clientInput }) => {
    if (!isConfigured()) {
      throw new Error('ZeroTier API is not configured on this instance')
    }

    const memberPath = `/network/${env.ZEROTIER_NETWORK_ID}/member/${clientInput.nodeId}`

    try {
      await zerotier.post(memberPath, {
        name: clientInput.name,
        config: { authorized: true },
      })

      const { data } = await zerotier.get(memberPath)
      const member = toMember(data)

      return { success: true as const, member }
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error('ZeroTier token lacks permission to authorize members')
      }
      throw new Error(
        `Failed to authorize ZeroTier member: ${error.message || 'unknown error'}`,
      )
    }
  })
