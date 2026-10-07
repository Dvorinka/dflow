'use server'

import { env } from 'env'

import netbird from '@/lib/axios/netbird'
import { protectedClient } from '@/lib/safe-action'

import {
  generateNetbirdSetupKeySchema,
  getNetbirdPeerSchema,
} from './validator'

const isConfigured = () =>
  Boolean(env.NETBIRD_API_URL || env.NETBIRD_API_TOKEN) &&
  Boolean(env.NETBIRD_API_TOKEN)

// Lets the UI decide between "generate a key for me" and "paste your own"
// without ever exposing the token client-side.
export const netbirdConfiguredAction = protectedClient
  .metadata({ actionName: 'netbirdConfiguredAction' })
  .action(async () => ({
    configured: isConfigured(),
    apiUrl: env.NETBIRD_API_URL ?? 'https://api.netbird.io',
    managementUrl: env.NETBIRD_MANAGEMENT_URL ?? null,
  }))

// One-off setup key, expires in 24h — enough to enrol a single server.
export const generateNetbirdSetupKeyAction = protectedClient
  .metadata({ actionName: 'generateNetbirdSetupKeyAction' })
  .inputSchema(generateNetbirdSetupKeySchema)
  .action(async ({ clientInput }) => {
    if (!isConfigured()) {
      throw new Error(
        'NetBird is not configured. Set NETBIRD_API_TOKEN (and NETBIRD_API_URL for self-hosted) or paste a setup key manually.',
      )
    }

    try {
      const { data } = await netbird.post('/api/setup-keys', {
        name: `dflow-${clientInput.hostname}`,
        type: 'one-off',
        expires_in: 86400,
        usage_limit: 1,
        auto_groups: [],
        ephemeral: false,
        allow_extra_dns_labels: false,
      })

      if (!data?.key) {
        throw new Error('NetBird did not return a setup key')
      }

      return { success: true, key: data.key as string }
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('NetBird API token is invalid or expired')
      }
      if (error.response?.status === 403) {
        throw new Error('NetBird token lacks permission to create setup keys')
      }
      throw new Error(
        `Failed to generate NetBird setup key: ${error.message || 'unknown error'}`,
      )
    }
  })

// After `netbird up` runs on the server, resolve its mesh IP by matching
// the hostname the peer registered with.
export const getNetbirdPeerAction = protectedClient
  .metadata({ actionName: 'getNetbirdPeerAction' })
  .inputSchema(getNetbirdPeerSchema)
  .action(async ({ clientInput }) => {
    if (!isConfigured()) {
      throw new Error('NetBird API is not configured on this instance')
    }

    const wanted = clientInput.hostname.toLowerCase()

    const { data: peers } = await netbird.get('/api/peers')
    const peer = (peers ?? []).find((p: any) => {
      const hostname = (p.hostname ?? '').toLowerCase()
      const label = (p.dns_label ?? '').toLowerCase()
      return (
        hostname === wanted ||
        label === wanted ||
        label.split('.')[0] === wanted
      )
    })

    if (!peer) {
      return {
        found: false as const,
        peer: null,
      }
    }

    return {
      found: true as const,
      peer: {
        id: peer.id as string,
        ip: peer.ip as string,
        hostname: peer.hostname as string,
        dnsLabel: peer.dns_label as string,
        connected: Boolean(peer.connected),
      },
    }
  })

// Best-effort cleanup when a dFlow server is deleted — removes the peer
// from the NetBird network so stale machines don't linger.
export const deleteNetbirdPeerAction = protectedClient
  .metadata({ actionName: 'deleteNetbirdPeerAction' })
  .inputSchema(getNetbirdPeerSchema)
  .action(async ({ clientInput }) => {
    if (!isConfigured()) {
      return { success: false, skipped: true }
    }

    const { data: peers } = await netbird.get('/api/peers')
    const wanted = clientInput.hostname.toLowerCase()
    const peer = (peers ?? []).find(
      (p: any) =>
        (p.hostname ?? '').toLowerCase() === wanted ||
        (p.dns_label ?? '').toLowerCase().split('.')[0] === wanted,
    )

    if (!peer) {
      return { success: true, skipped: true }
    }

    await netbird.delete(`/api/peers/${peer.id}`)
    return { success: true, skipped: false }
  })
