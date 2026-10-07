'use server'

import dns from 'dns/promises'
import isPortReachable from 'is-port-reachable'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { NodeSSH } from 'node-ssh'
import { extractID } from 'payload/shared'

import updateRailpack from '@/lib/axios/updateRailpack'
import { dokku } from '@/lib/dokku'
import { assertTenantOwnership, extractTenantSlug } from '@/lib/extractID'
import { protectedClient, userClient } from '@/lib/safe-action'
import { server } from '@/lib/server'
import { dynamicSSH, extractSSHDetails } from '@/lib/ssh'
import { generateRandomString } from '@/lib/utils'
import { isVersionNewer } from '@/lib/version'
import { ServersSelect, Service } from '@/payload-types'
import { ServerType } from '@/payload-types-overrides'
import { addInstallRailpackQueue } from '@/queues/builder/installRailpack'
import { addInstallDokkuQueue } from '@/queues/dokku/install'
import { addManageServerDomainQueue } from '@/queues/domain/manageGlobal'
import { addDeleteProjectsQueue } from '@/queues/project/deleteProjects'
import { checkServersSSHConnectionQueue } from '@/queues/server/checkSSHConnection'
import { addCleanupServerQueue } from '@/queues/server/cleanup'
import { addResetServerQueue } from '@/queues/server/reset'

import {
  attachDanglingVolumeSchema,
  checkDNSConfigSchema,
  checkServerConnectionSchema,
  cleanupServerSchema,
  completeServerOnboardingSchema,
  configureGlobalBuildDirSchema,
  createServerSchema,
  createTailscaleServerSchema,
  danglingVolumesSchema,
  deleteDanglingVolumeSchema,
  deleteServerSchema,
  executeCommandSchema,
  getServersWithFieldsInputSchema,
  installDokkuSchema,
  setServerAutoCleanupSchema,
  syncServerAppsSchema,
  uninstallDokkuSchema,
  updateRailpackSchema,
  updateServerDomainSchema,
  updateServerResourceLimitsSchema,
  updateServerSchema,
  updateTailscaleServerSchema,
} from './validator'

type DeploymentService = Omit<Service, 'project'>

export const getServersWithFieldsAction = protectedClient
  .metadata({ actionName: 'getServersWithFieldsAction' })
  .inputSchema(getServersWithFieldsInputSchema)
  .action(async ({ clientInput, ctx }) => {
    const {
      user,
      payload,
      userTenant: { tenant, role },
    } = ctx

    const selectFields = (clientInput.fields as ServersSelect<false>) ?? {
      name: true,
    }

    const { docs: servers } = await payload.find({
      collection: 'servers',
      select: selectFields,
      where: {
        and: [
          { 'tenant.slug': { equals: tenant.slug } },
          ...(role?.servers?.readLimit === 'createdByUser'
            ? [{ createdBy: { equals: user.id } }]
            : []),
        ],
      },
      pagination: false,
    })

    return servers
  })

// No need to handle try/catch that abstraction is taken care by next-safe-actions
export const createServerAction = protectedClient
  .metadata({
    // This action name can be used for sentry tracking
    actionName: 'createServerAction',
  })
  .inputSchema(createServerSchema)
  .action(async ({ clientInput, ctx }) => {
    const { name, description, ip, port, username, sshKey } = clientInput
    const {
      userTenant: { tenant, role },
      payload,
      user,
    } = ctx

    if (Number(role?.servers?.createLimit) > 0) {
      const { totalDocs } = await payload.count({
        collection: 'servers',
        where: {
          and: [
            {
              tenant: {
                equals: tenant.id,
              },
            },
            {
              createdBy: {
                equals: user?.id,
              },
            },
          ],
        },
      })

      if (totalDocs >= Number(role?.servers?.createLimit)) {
        throw new Error(
          `You have reached your server creation limit. Please contact your administrator.`,
        )
      }
    }

    // Reconnecting a previously removed server restores it with its
    // projects and services instead of creating a duplicate (#150)
    const { docs: deletedServers } = await payload.find({
      collection: 'servers',
      pagination: false,
      limit: 1,
      sort: '-updatedAt',
      depth: 0,
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          { ip: { equals: ip } },
          { deletedAt: { exists: true } },
        ],
      },
    })

    const restoredServer = deletedServers.at(0)
    if (restoredServer) {
      await payload.update({
        collection: 'servers',
        id: restoredServer.id,
        data: {
          deletedAt: null,
          name,
          description,
          port,
          username,
          sshKey,
          onboarded: false,
        },
      })

      const { docs: deletedProjects } = await payload.update({
        collection: 'projects',
        where: {
          and: [
            { server: { equals: restoredServer.id } },
            { deletedAt: { exists: true } },
          ],
        },
        data: { deletedAt: null },
        depth: 0,
      })

      // Services hang off projects; restore those of revived projects
      for (const project of deletedProjects) {
        await payload.update({
          collection: 'services',
          where: {
            and: [
              { project: { equals: project.id } },
              { deletedAt: { exists: true } },
            ],
          },
          data: { deletedAt: null },
          depth: 0,
        })
      }

      revalidatePath(`/${tenant.slug}/servers`)

      const { invalidateServerCache } = await import('@/lib/serverDetailsCache')
      await invalidateServerCache(tenant.slug)

      await checkServersSSHConnectionQueue({
        tenant: { slug: tenant.slug, id: tenant.id },
        refreshServerDetails: true,
      })

      return {
        success: true,
        server: { ...restoredServer, name },
        restored: true,
      }
    }

    const response = await payload.create({
      collection: 'servers',
      data: {
        preferConnectionType: 'ssh',
        name,
        description,
        ip,
        port,
        username,
        sshKey,
        provider: 'other',
        createdBy: user.id,
        tenant,
      },
      user,
    })

    if (response) {
      revalidatePath(`/${tenant.slug}/servers`)
    }

    const { invalidateServerCache } = await import('@/lib/serverDetailsCache')
    await invalidateServerCache(tenant.slug)

    // Sync details immediately so the new server shows live status (#259);
    // the queue itself dedupes runs within 2 minutes.
    await checkServersSSHConnectionQueue({
      tenant: { slug: tenant.slug, id: tenant.id },
      refreshServerDetails: true,
    })

    return { success: true, server: response }
  })

export const createTailscaleServerAction = protectedClient
  .metadata({
    actionName: 'createTailscaleServerAction',
  })
  .inputSchema(createTailscaleServerSchema)
  .action(async ({ clientInput, ctx }) => {
    const { name, description, hostname, username } = clientInput

    const {
      userTenant: { tenant, role },
      payload,
      user,
    } = ctx

    if (Number(role?.servers?.createLimit) > 0) {
      const { totalDocs } = await payload.count({
        collection: 'servers',
        where: {
          and: [
            {
              tenant: {
                equals: tenant.id,
              },
            },
            {
              createdBy: {
                equals: user?.id,
              },
            },
          ],
        },
      })

      if (totalDocs >= Number(role?.servers?.createLimit)) {
        throw new Error(
          `You have reached your server creation limit. Please contact your administrator.`,
        )
      }
    }

    const response = await payload.create({
      collection: 'servers',
      data: {
        preferConnectionType: 'tailscale',
        name,
        description,
        hostname,
        username,
        provider: 'other',
        createdBy: user.id,
        tenant,
      },
      user,
    })

    const { invalidateServerCache } = await import('@/lib/serverDetailsCache')
    await invalidateServerCache(tenant.slug)

    await checkServersSSHConnectionQueue({
      tenant: { slug: tenant.slug, id: tenant.id },
      refreshServerDetails: true,
    })

    if (response) {
      redirect(`/${tenant.slug}/servers`)
    }
    return { success: true, server: response }
  })

export const updateTailscaleServerAction = protectedClient
  .metadata({
    actionName: 'updateTailscaleServerAction',
  })
  .inputSchema(updateTailscaleServerSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, ...data } = clientInput
    const { payload, user, userTenant } = ctx

    // payload.update by id bypasses access control — verify tenant first
    const existing = await payload.findByID({ collection: 'servers', id })
    assertTenantOwnership(existing.tenant, userTenant.tenant.id, 'Server')

    const response = await payload.update({
      id,
      data,
      collection: 'servers',
      user,
    })

    if (response) {
      const tenantSlug = extractTenantSlug(response.tenant)
      if (tenantSlug) revalidatePath(`/${tenantSlug}/servers/${id}`)
      revalidatePath(`/onboarding/add-server`)
    }

    return { success: true, server: response }
  })

export const updateServerAction = protectedClient
  .metadata({
    actionName: 'updateServerAction',
  })
  .inputSchema(updateServerSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, ...data } = clientInput
    const { payload, user, userTenant } = ctx

    // payload.update by id bypasses access control — verify tenant first
    const existing = await payload.findByID({ collection: 'servers', id })
    assertTenantOwnership(existing.tenant, userTenant.tenant.id, 'Server')

    const response = await payload.update({
      id,
      data,
      collection: 'servers',
      user,
    })

    if (response) {
      const tenantSlug = extractTenantSlug(response.tenant)
      if (tenantSlug) revalidatePath(`/${tenantSlug}/servers/${id}`)
      revalidatePath(`/onboarding/add-server`)
    }

    const { invalidateServerCache } = await import('@/lib/serverDetailsCache')
    await invalidateServerCache(
      typeof response.tenant === 'object' ? response.tenant?.slug : undefined,
      id,
    )

    return { success: true, server: response }
  })

export const updateServerResourceLimitsAction = protectedClient
  .metadata({
    actionName: 'updateServerResourceLimitsAction',
  })
  .inputSchema(updateServerResourceLimitsSchema)
  .action(async ({ clientInput, ctx }) => {
    try {
      const { id, defaultResourceLimits } = clientInput
      const { payload, user, userTenant } = ctx

      const existing = await payload.findByID({ collection: 'servers', id })
      assertTenantOwnership(existing.tenant, userTenant.tenant.id, 'Server')

      const response = await payload.update({
        collection: 'servers',
        id,
        data: { defaultResourceLimits },
        user,
      })

      if (response) {
        const tenantSlug = extractTenantSlug(response.tenant)
        if (tenantSlug) revalidatePath(`/${tenantSlug}/servers/${id}`)
      }

      return { success: true, server: response }
    } catch (error) {
      console.error('Failed to update server resource limits:', error)

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update resource limits',
      }
    }
  })

export const deleteServerAction = protectedClient
  .metadata({
    // This action name can be used for sentry tracking
    actionName: 'deleteServerAction',
  })
  .inputSchema(deleteServerSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, deleteProjects, deleteBackups } = clientInput
    const { payload, userTenant } = ctx
    const { tenant } = userTenant

    // The cascades below key off this id — verify the server belongs to
    // the caller's tenant before deleting anything.
    const serverDoc = await payload.findByID({ collection: 'servers', id })
    assertTenantOwnership(serverDoc.tenant, tenant.id, 'Server')

    // soft delete services
    const { docs: services } = await payload.update({
      collection: 'services',
      data: {
        deletedAt: new Date().toISOString(),
      },
      where: {
        and: [
          { 'project.server.id': { equals: id } },
          {
            deletedAt: {
              exists: false,
            },
          },
          {
            tenant: {
              equals: tenant.id,
            },
          },
        ],
      },
      depth: 0,
      select: {
        name: true,
        project: true,
      },
    })

    // soft delete projects
    const { docs: projects } = await payload.update({
      collection: 'projects',
      data: {
        deletedAt: new Date().toISOString(),
      },
      where: {
        and: [
          { 'server.id': { equals: id } },
          {
            deletedAt: {
              exists: false,
            },
          },
          {
            tenant: {
              equals: tenant.id,
            },
          },
        ],
      },
      depth: 0,
      select: {},
    })

    // soft delete server
    const server = await payload.update({
      collection: 'servers',
      id,
      data: {
        deletedAt: new Date().toISOString(),
      },
      depth: 0,
    })

    const installationResponse = await addDeleteProjectsQueue({
      serverDetails: {
        id,
      },
      deleteProjectsFromServer: deleteProjects,
      deleteBackups,
      tenant: {
        slug: userTenant.tenant.slug,
      },
      projects: projects.map(project => project.id),
      services: services.map(service => ({
        id: service.id,
        projectId: extractID(service.project),
      })),
    })

    if (server && installationResponse.id) {
      revalidatePath(`/${userTenant.tenant.slug}/servers`)
      revalidatePath(`/${userTenant.tenant.slug}/servers/${id}`)

      const { invalidateServerCache } = await import('@/lib/serverDetailsCache')
      await invalidateServerCache(userTenant.tenant.slug, id)

      return { deleted: true }
    }
  })

export const installDokkuAction = protectedClient
  .metadata({
    actionName: 'installDokkuAction',
  })
  .inputSchema(installDokkuSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId } = clientInput
    const { payload, userTenant } = ctx

    const serverDetails = await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 1,
    })

    assertTenantOwnership(
      serverDetails.tenant,
      ctx.userTenant.tenant.id,
      'Server',
    )
    const sshDetails = extractSSHDetails({ server: serverDetails })

    const installationResponse = await addInstallDokkuQueue({
      serverDetails: {
        id: serverId,
        provider: serverDetails.provider,
      },
      sshDetails,
      tenant: {
        slug: userTenant.tenant.slug,
      },
    })

    if (installationResponse.id) {
      return { success: true }
    }
  })

// Re-runs the dokku bootstrap at the pinned version, which upgrades an
// existing install in place (#319). Full removal stays under Reset Server.
export const updateDokkuAction = protectedClient
  .metadata({
    actionName: 'updateDokkuAction',
  })
  .inputSchema(installDokkuSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId } = clientInput
    const { payload, userTenant } = ctx

    const serverDetails = await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 1,
    })

    assertTenantOwnership(
      serverDetails.tenant,
      ctx.userTenant.tenant.id,
      'Server',
    )
    const sshDetails = extractSSHDetails({ server: serverDetails })

    const installationResponse = await addInstallDokkuQueue({
      serverDetails: {
        id: serverId,
        provider: serverDetails.provider,
      },
      sshDetails,
      tenant: {
        slug: userTenant.tenant.slug,
      },
    })

    if (installationResponse.id) {
      return { success: true, message: 'Dokku update queued' }
    }

    return { success: false, message: 'Failed to queue dokku update' }
  })

// Reports drift between dokku apps on the server and dFlow services (#417).
// Read-only: lists apps missing on either side so users can reconcile.
export const syncServerAppsAction = protectedClient
  .metadata({
    actionName: 'syncServerAppsAction',
  })
  .inputSchema(syncServerAppsSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId } = clientInput
    const { payload } = ctx

    const serverDetails = await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 1,
    })

    assertTenantOwnership(
      serverDetails.tenant,
      ctx.userTenant.tenant.id,
      'Server',
    )
    const sshDetails = extractSSHDetails({ server: serverDetails })
    const ssh = await dynamicSSH(sshDetails)

    try {
      const dokkuApps = (await dokku.apps.list(ssh)) as string[]
      const appNames = dokkuApps.map(app => app.trim()).filter(Boolean)

      const { docs: services } = await payload.find({
        collection: 'services',
        pagination: false,
        depth: 0,
        select: { name: true },
        where: {
          and: [
            { 'project.server': { equals: serverId } },
            { deletedAt: { exists: false } },
          ],
        },
      })
      const serviceNames = services.map(service => service.name)

      return {
        success: true,
        dokkuApps: appNames,
        missingInDflow: appNames.filter(name => !serviceNames.includes(name)),
        missingOnServer: serviceNames.filter(name => !appNames.includes(name)),
      }
    } finally {
      ssh.dispose()
    }
  })

const DANGLING_STORAGE_PATH = '/var/lib/dokku/data/storage/'

const listMountedPaths = async (
  ssh: NodeSSH,
  appNames: string[],
): Promise<Set<string>> => {
  const mounted = new Set<string>()
  for (const app of appNames) {
    try {
      const mounts = (await dokku.volumes.list(ssh, app)) as {
        host_path: string
      }[]
      for (const mount of mounts) {
        if (typeof mount.host_path === 'string') mounted.add(mount.host_path)
      }
    } catch {
      // App without storage or removed mid-scan; ignore
    }
  }
  return mounted
}

// Lists storage directories no app mounts anymore (#492). Read-only.
export const getDanglingVolumesAction = protectedClient
  .metadata({
    actionName: 'getDanglingVolumesAction',
  })
  .inputSchema(danglingVolumesSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId } = clientInput
    const { payload } = ctx

    const serverDetails = await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 1,
    })

    assertTenantOwnership(
      serverDetails.tenant,
      ctx.userTenant.tenant.id,
      'Server',
    )
    const sshDetails = extractSSHDetails({ server: serverDetails })
    const ssh = await dynamicSSH(sshDetails)

    try {
      const apps = ((await dokku.apps.list(ssh)) as string[])
        .map(app => app.trim())
        .filter(Boolean)
      const dirs = await ssh.execCommand(`ls -1 ${DANGLING_STORAGE_PATH}`)
      const names =
        dirs.code === 0
          ? dirs.stdout
              .split('\n')
              .map(d => d.trim())
              .filter(Boolean)
          : []
      const mounted = await listMountedPaths(ssh, apps)

      const volumes = []
      for (const name of names) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) continue
        const fullPath = `${DANGLING_STORAGE_PATH}${name}`
        if (mounted.has(fullPath)) continue
        let size: string | null = null
        try {
          const du = await ssh.execCommand(`du -sh ${fullPath}`)
          if (du.code === 0) size = du.stdout.split('\t')[0]?.trim() ?? null
        } catch {
          size = null
        }
        volumes.push({ name, path: fullPath, size })
      }

      const { docs: services } = await payload.find({
        collection: 'services',
        pagination: false,
        depth: 0,
        select: { name: true, volumes: true },
        where: {
          and: [
            { 'project.server': { equals: serverId } },
            { deletedAt: { exists: false } },
          ],
        },
      })

      return {
        success: true,
        volumes,
        services: services.map(service => ({
          id: service.id,
          name: service.name,
          volumes: service.volumes ?? [],
        })),
      }
    } finally {
      ssh.dispose()
    }
  })

export const deleteDanglingVolumeAction = protectedClient
  .metadata({
    actionName: 'deleteDanglingVolumeAction',
  })
  .inputSchema(deleteDanglingVolumeSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId, name } = clientInput
    const { payload } = ctx

    const serverDetails = await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 1,
    })

    assertTenantOwnership(
      serverDetails.tenant,
      ctx.userTenant.tenant.id,
      'Server',
    )
    const sshDetails = extractSSHDetails({ server: serverDetails })
    const ssh = await dynamicSSH(sshDetails)

    try {
      const fullPath = `${DANGLING_STORAGE_PATH}${name}`
      // Re-verify unmounted right before removal
      const apps = ((await dokku.apps.list(ssh)) as string[])
        .map(app => app.trim())
        .filter(Boolean)
      const mounted = await listMountedPaths(ssh, apps)
      if (mounted.has(fullPath)) {
        throw new Error(`${name} is mounted by an app, refusing to delete`)
      }

      const rm = await ssh.execCommand(`rm -rf "${fullPath}"`)
      if (rm.code !== 0) {
        throw new Error(rm.stderr.slice(0, 300) || 'Removal failed')
      }

      return { success: true }
    } finally {
      ssh.dispose()
    }
  })

export const attachDanglingVolumeAction = protectedClient
  .metadata({
    actionName: 'attachDanglingVolumeAction',
  })
  .inputSchema(attachDanglingVolumeSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serviceId, name, containerPath } = clientInput
    const {
      payload,
      userTenant: { tenant },
    } = ctx

    const service = await payload.findByID({
      collection: 'services',
      id: serviceId,
      depth: 3,
    })

    assertTenantOwnership(service.tenant, ctx.userTenant.tenant.id, 'Service')
    const hostPath = `${DANGLING_STORAGE_PATH}${name}`
    const existing = (service.volumes ?? []) as {
      hostPath: string
      containerPath: string
    }[]
    if (existing.some(volume => volume.hostPath === hostPath)) {
      throw new Error(`${name} is already attached to this service`)
    }

    const updatedService = await payload.update({
      collection: 'services',
      id: serviceId,
      depth: 3,
      data: {
        volumes: [...existing, { hostPath, containerPath }],
      },
    })

    const project = updatedService.project
    if (typeof project === 'object' && typeof project?.server === 'object') {
      const { updateVolumesQueue } = await import(
        '@/queues/volume/updateVolumesQueue'
      )
      await updateVolumesQueue({
        restart: true,
        service: updatedService,
        serverDetails: {
          id: project.server.id,
        },
        project,
        tenantDetails: {
          slug: tenant.slug,
        },
      })
    }

    return { success: true }
  })

// Runs one SSH command and returns truncated output (#37, #416). Gated by
// servers.update like every other mutating server action; the caller's SSH
// key already grants full access, so this adds no new trust.
export const executeCommandAction = protectedClient
  .metadata({
    actionName: 'executeCommandAction',
  })
  .inputSchema(executeCommandSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId, command } = clientInput
    const { payload, user } = ctx

    const serverDetails = await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 1,
    })

    assertTenantOwnership(
      serverDetails.tenant,
      ctx.userTenant.tenant.id,
      'Server',
    )
    const sshDetails = extractSSHDetails({ server: serverDetails })
    const ssh = await dynamicSSH(sshDetails)

    try {
      const result = await Promise.race([
        ssh.execCommand(command),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Command timed out after 30s')),
            30000,
          ),
        ),
      ])

      if (user) {
        const { trackActivity } = await import('@/lib/activityTracker')
        await trackActivity({
          payload,
          userId: user.id,
          eventType: 'server_command_executed',
          operation: 'exec',
          label: 'Remote Command Executed',
          status: result.code === 0 ? 'success' : 'failed',
          severity: 'warning',
          category: 'server',
          collectionSlug: 'servers',
          documentId: serverId,
          icon: 'terminal',
          metadata: { command: command.slice(0, 500), exitCode: result.code },
        })
      }

      const truncate = (s: string) =>
        s.length > 20000 ? `${s.slice(0, 20000)}\n...[truncated]` : s

      return {
        success: true,
        code: result.code,
        stdout: truncate(result.stdout),
        stderr: truncate(result.stderr),
      }
    } finally {
      ssh.dispose()
    }
  })

export const updateServerDomainAction = protectedClient
  .metadata({
    actionName: 'updateServerDomainAction',
  })
  .inputSchema(updateServerDomainSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, domains, operation } = clientInput
    const { payload, userTenant } = ctx

    // Fetching server-details for showing previous details
    const serverDoc = await payload.findByID({
      id,
      collection: 'servers',
    })
    assertTenantOwnership(serverDoc.tenant, userTenant.tenant.id, 'Server')

    const previousDomains = serverDoc.domains ?? []

    // for add operation check for duplicate domain check
    if (operation === 'add') {
      const addedDomain = domains?.[0]

      const domainExists = previousDomains.find(
        ({ domain }) => addedDomain === domain,
      )

      if (domainExists) {
        throw new Error(`${addedDomain} already exists!`)
      }
    }

    const filteredDomains =
      operation !== 'remove'
        ? [
            // 'set' replaces the default: clear previous defaults so exactly
            // one domain stays default
            ...previousDomains.map(prevDomain =>
              operation === 'set'
                ? { ...prevDomain, default: false }
                : prevDomain,
            ),
            // synced is required by the collection; new rows start unsynced
            ...domains.map(domain => ({
              domain,
              default: operation === 'set',
              synced: false,
            })),
          ]
        : previousDomains.filter(
            prevDomain => !domains.includes(prevDomain.domain),
          )

    const server = await payload.update({
      id,
      data: {
        domains: filteredDomains,
      },
      collection: 'servers',
      depth: 1,
    })

    // for delete, set action updating domain in dokku
    if (operation === 'remove' || operation === 'set') {
      const sshDetails = extractSSHDetails({ server })

      await addManageServerDomainQueue({
        serverDetails: {
          global: {
            domains,
            action: operation,
          },
          id,
        },
        sshDetails,
        tenant: {
          slug: userTenant.tenant.slug,
        },
      })
    }

    revalidatePath(`/${userTenant.tenant.slug}/servers/${id}`)
    return { success: true }
  })

export const installRailpackAction = protectedClient
  .metadata({
    actionName: 'installRailpackAction',
  })
  .inputSchema(installDokkuSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId } = clientInput
    const { payload, userTenant } = ctx

    const serverDetails = await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 1,
    })

    assertTenantOwnership(
      serverDetails.tenant,
      ctx.userTenant.tenant.id,
      'Server',
    )
    const sshDetails = extractSSHDetails({ server: serverDetails })

    const installationResponse = await addInstallRailpackQueue({
      serverDetails: {
        id: serverId,
      },
      sshDetails,
      tenant: {
        slug: userTenant.tenant.slug,
      },
    })

    if (installationResponse.id) {
      return { success: true }
    }
  })

export const updateRailpackAction = protectedClient
  .metadata({
    actionName: 'updateRailpackAction',
  })
  .inputSchema(updateRailpackSchema)
  .action(async ({ ctx, clientInput }) => {
    const { serverId, railpackVersion } = clientInput
    const { payload, userTenant } = ctx

    const latestRelease = await updateRailpack()

    if (isVersionNewer(latestRelease, railpackVersion)) {
      const serverDetails = await payload.findByID({
        collection: 'servers',
        id: serverId,
        depth: 1,
      })

      assertTenantOwnership(
        serverDetails.tenant,
        ctx.userTenant.tenant.id,
        'Server',
      )
      const sshDetails = extractSSHDetails({ server: serverDetails })

      await addInstallRailpackQueue({
        serverDetails: {
          id: serverId,
        },
        sshDetails,
        tenant: {
          slug: userTenant.tenant.slug,
        },
      })

      return { success: true, message: 'Railpack updated' }
    }

    return { success: false, message: 'Railpack is already up to date' }
  })

export const completeServerOnboardingAction = protectedClient
  .metadata({
    actionName: 'completeServerOnboardingAction',
  })
  .inputSchema(completeServerOnboardingSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId } = clientInput
    const { payload, userTenant } = ctx

    const serverDoc = await payload.findByID({
      collection: 'servers',
      id: serverId,
    })
    assertTenantOwnership(serverDoc.tenant, userTenant.tenant.id, 'Server')

    const response = await payload.update({
      id: serverId,
      data: {
        onboarded: true,
      },
      collection: 'servers',
    })

    if (response) {
      revalidatePath(`/${userTenant.tenant.slug}/servers/${serverId}`)
      return { success: true, server: response }
    }

    return { success: false }
  })

export const getServersAction = protectedClient
  .metadata({
    actionName: 'getServersAction',
  })
  .action(async ({ ctx }) => {
    const {
      payload,
      userTenant: { tenant },
    } = ctx

    const { docs } = await payload.find({
      collection: 'servers',
      select: {
        name: true,
      },
      where: {
        'tenant.slug': { equals: tenant.slug },
      },
      pagination: false,
    })

    return docs
  })

export const checkDNSConfigAction = protectedClient
  .metadata({
    actionName: 'checkDNSConfigAction',
  })
  .inputSchema(checkDNSConfigSchema)
  .action(async ({ clientInput }) => {
    const { domain, ip, proxyDomain } = clientInput

    try {
      // Try to resolve CNAME first if proxyDomain is provided
      if (proxyDomain) {
        dns.setServers([
          // IPv4
          '1.1.1.1', // Cloudflare
          '8.8.8.8', // Google
          '9.9.9.9', // Quad9

          // IPv6
          '2606:4700:4700::1111', // Cloudflare
          '2001:4860:4860::8888', // Google
          '2620:fe::fe', // Quad9
        ])

        const cnames = await dns.resolveCname(domain).catch(() => [])

        if (cnames.length > 0) {
          // Compare the CNAME target to the expected proxy domain (strict match)
          return cnames.some(cname => cname === proxyDomain)
        }
      }

      // Fallback: check A record
      const addresses = await dns.resolve4(domain)

      // for root-domain CNAME validation check is failing in proxyDomain case
      // doing A record validation as fallback
      if (proxyDomain) {
        const IPList = await dns.resolve4(proxyDomain)
        const proxyIP = IPList.at(0) ?? ''

        if (proxyIP && !!addresses.length) {
          return addresses.includes(proxyIP)
        }
      }

      return addresses.includes(ip ?? '')
    } catch (e) {
      return false
    }
  })

export const syncServerDomainAction = protectedClient
  .metadata({
    actionName: 'syncServerDomainAction',
  })
  .inputSchema(updateServerDomainSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, domains, operation } = clientInput
    const { payload, userTenant } = ctx

    const server = await payload.findByID({
      id,
      collection: 'servers',
      depth: 1,
    })

    assertTenantOwnership(server.tenant, ctx.userTenant.tenant.id, 'Server')
    const sshDetails = extractSSHDetails({ server })

    const queueResponse = await addManageServerDomainQueue({
      serverDetails: {
        global: {
          domains,
          action: operation,
        },
        id,
      },
      sshDetails,
      tenant: {
        slug: userTenant.tenant.slug,
      },
    })

    if (queueResponse.id) {
      return { success: true }
    }
  })

export const checkServerConnection = protectedClient
  .metadata({
    actionName: 'checkServerConnection',
  })
  .inputSchema(checkServerConnectionSchema)
  .action(async ({ clientInput }) => {
    const { connectionType } = clientInput

    if (connectionType === 'tailscale') {
      const { hostname, username } = clientInput

      try {
        // Validate input parameters
        if (!hostname || !username) {
          return {
            isConnected: false,
            portIsOpen: false,
            sshConnected: false,
            serverInfo: null,
            error:
              'Missing required connection parameters (hostname or username)',
          }
        }

        let sshConnected = false
        let serverInfo = null
        let ssh

        try {
          // Attempt Tailscale SSH connection
          ssh = await dynamicSSH({
            type: 'tailscale',
            hostname,
            username,
          })

          if (ssh.isConnected()) {
            sshConnected = true

            // Get server information
            const {
              dokkuVersion,
              linuxDistributionType,
              linuxDistributionVersion,
              netdataVersion,
              railpackVersion,
            } = await server.info({ ssh })

            serverInfo = {
              dokku: dokkuVersion,
              netdata: netdataVersion,
              os: {
                type: linuxDistributionType,
                version: linuxDistributionVersion,
              },
              railpack: railpackVersion,
            }
          }
        } catch (sshError) {
          console.error('Tailscale SSH connection failed:', sshError)

          // Handle specific SSH errors
          if (sshError instanceof Error) {
            const errorMessage = sshError.message.toLowerCase()

            if (errorMessage.includes('authentication')) {
              return {
                isConnected: false,
                portIsOpen: false,
                sshConnected: false,
                serverInfo: null,
                error:
                  'Tailscale SSH authentication failed. Please check if the device is authorized.',
              }
            } else if (errorMessage.includes('timeout')) {
              return {
                isConnected: false,
                portIsOpen: false,
                sshConnected: false,
                serverInfo: null,
                error:
                  'Tailscale SSH connection timeout. The device may be offline or unreachable.',
              }
            } else if (errorMessage.includes('refused')) {
              return {
                isConnected: false,
                portIsOpen: false,
                sshConnected: false,
                serverInfo: null,
                error:
                  'Tailscale SSH connection refused. Please check if SSH is enabled on the device.',
              }
            } else if (
              errorMessage.includes('not found') ||
              errorMessage.includes('unknown host')
            ) {
              return {
                isConnected: false,
                portIsOpen: false,
                sshConnected: false,
                serverInfo: null,
                error:
                  'Device not found in Tailscale network. Please ensure the device is connected to your tailnet.',
              }
            }
          }

          return {
            isConnected: false,
            portIsOpen: false,
            sshConnected: false,
            serverInfo: null,
            error:
              'Tailscale SSH connection failed. Please check your Tailscale configuration.',
          }
        } finally {
          // Clean up SSH connection
          if (ssh) {
            try {
              ssh.dispose()
            } catch (disposeError) {
              console.error('Error disposing SSH connection:', disposeError)
            }
          }
        }

        // For Tailscale, we don't check port reachability separately since it uses Tailscale's mesh network
        // If SSH is connected, we consider the connection successful
        return {
          isConnected: sshConnected,
          portIsOpen: sshConnected, // Set to same as sshConnected for Tailscale
          sshConnected,
          serverInfo,
          error: null,
        }
      } catch (error) {
        console.error('Tailscale server connection check failed:', error)

        // Handle different types of errors
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase()

          if (
            errorMessage.includes('tailscale') ||
            errorMessage.includes('not logged in')
          ) {
            return {
              isConnected: false,
              portIsOpen: false,
              sshConnected: false,
              serverInfo: null,
              error:
                'Tailscale not configured or not logged in. Please ensure Tailscale is installed and you are logged in.',
            }
          } else if (errorMessage.includes('timeout')) {
            return {
              isConnected: false,
              portIsOpen: false,
              sshConnected: false,
              serverInfo: null,
              error:
                'Connection timeout. The device may be offline or unreachable via Tailscale.',
            }
          }
        }

        // Generic error fallback
        return {
          isConnected: false,
          portIsOpen: false,
          sshConnected: false,
          serverInfo: null,
          error:
            'Failed to connect to device via Tailscale. Please check your Tailscale configuration and try again.',
        }
      }
    } else {
      const { ip, port, username, privateKey } = clientInput

      try {
        // Validate input parameters
        if (!ip || !port || !username || !privateKey) {
          return {
            isConnected: false,
            portIsOpen: false,
            sshConnected: false,
            serverInfo: null,
            error: 'Missing required connection parameters',
          }
        }

        // Check if port is reachable
        const portIsOpen = await isPortReachable(port, {
          host: ip,
          timeout: 5000, // 5 second timeout for port check
        })

        if (!portIsOpen) {
          return {
            isConnected: false,
            portIsOpen: false,
            sshConnected: false,
            serverInfo: null,
            error: `Port ${port} is not reachable on ${ip}. Please check if the server is running and the port is open.`,
          }
        }

        let sshConnected = false
        let serverInfo = null
        let ssh

        try {
          // Attempt SSH connection
          ssh = await dynamicSSH({
            type: 'ssh',
            ip,
            port,
            privateKey,
            username,
          })

          if (ssh.isConnected()) {
            sshConnected = true

            // Get server information
            const {
              dokkuVersion,
              linuxDistributionType,
              linuxDistributionVersion,
              netdataVersion,
              railpackVersion,
            } = await server.info({ ssh })

            serverInfo = {
              dokku: dokkuVersion,
              netdata: netdataVersion,
              os: {
                type: linuxDistributionType,
                version: linuxDistributionVersion,
              },
              railpack: railpackVersion,
            }
          }
        } catch (sshError) {
          console.error('SSH connection failed:', sshError)

          // Handle specific SSH errors
          if (sshError instanceof Error) {
            const errorMessage = sshError.message.toLowerCase()

            if (errorMessage.includes('authentication')) {
              return {
                isConnected: false,
                portIsOpen,
                sshConnected: false,
                serverInfo: null,
                error:
                  'SSH authentication failed. Please check your username and private key.',
              }
            } else if (errorMessage.includes('timeout')) {
              return {
                isConnected: false,
                portIsOpen,
                sshConnected: false,
                serverInfo: null,
                error:
                  'SSH connection timeout. The server may be slow to respond.',
              }
            } else if (errorMessage.includes('refused')) {
              return {
                isConnected: false,
                portIsOpen,
                sshConnected: false,
                serverInfo: null,
                error:
                  'SSH connection refused. Please check if SSH service is running on the server.',
              }
            } else if (errorMessage.includes('host key')) {
              return {
                isConnected: false,
                portIsOpen,
                sshConnected: false,
                serverInfo: null,
                error:
                  'SSH host key verification failed. The server key may have changed.',
              }
            }
          }

          return {
            isConnected: false,
            portIsOpen,
            sshConnected: false,
            serverInfo: null,
            error:
              'SSH connection failed. Please check your connection details.',
          }
        } finally {
          // Clean up SSH connection
          if (ssh) {
            try {
              ssh.dispose()
            } catch (disposeError) {
              console.error('Error disposing SSH connection:', disposeError)
            }
          }
        }

        const isFullyConnected = portIsOpen && sshConnected

        return {
          isConnected: isFullyConnected,
          portIsOpen,
          sshConnected,
          serverInfo,
          error: null,
        }
      } catch (error) {
        console.error('Server connection check failed:', error)

        // Handle different types of errors
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase()

          if (
            errorMessage.includes('network') ||
            errorMessage.includes('dns')
          ) {
            return {
              isConnected: false,
              portIsOpen: false,
              sshConnected: false,
              serverInfo: null,
              error:
                'Network error. Please check your internet connection and server IP address.',
            }
          } else if (errorMessage.includes('timeout')) {
            return {
              isConnected: false,
              portIsOpen: false,
              sshConnected: false,
              serverInfo: null,
              error:
                'Connection timeout. The server may be unreachable or overloaded.',
            }
          }
        }

        // Generic error fallback
        return {
          isConnected: false,
          portIsOpen: false,
          sshConnected: false,
          serverInfo: null,
          error:
            'Failed to connect to server. Please check your connection details and try again.',
        }
      }
    }
  })

export const generateTailscaleHostname = userClient
  .metadata({
    actionName: 'generateTailscaleHostname',
  })
  .action(async ({ ctx }) => {
    const { payload } = ctx

    let unique = false
    let hostname = ''
    while (!unique) {
      hostname = `dfi-${generateRandomString({ length: 7, charset: '0123456789' })}`
      const response = await payload.count({
        collection: 'servers',
        where: {
          hostname: {
            equals: hostname,
          },
        },
      })
      if (response.totalDocs === 0) {
        unique = true
      }
    }

    return { hostname }
  })

export const configureGlobalBuildDirAction = protectedClient
  .metadata({
    actionName: 'configureGlobalBuildDirAction',
  })
  .inputSchema(configureGlobalBuildDirSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId, buildDir } = clientInput
    const { payload } = ctx

    const server = await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 1,
    })

    assertTenantOwnership(server.tenant, ctx.userTenant.tenant.id, 'Server')
    const sshDetails = extractSSHDetails({ server })
    const ssh = await dynamicSSH(sshDetails)

    const result = await dokku.builder.setGlobalBuildDir({ ssh, buildDir })

    // Save the buildDir value to the server record
    await payload.update({
      collection: 'servers',
      id: serverId,
      data: {
        globalBuildPath: buildDir || null,
      },
    })

    return {
      success: result.code === 0,
      message: result.stdout || result.stderr,
    }
  })

export const resetServerAction = protectedClient
  .metadata({
    actionName: 'resetServerAction',
  })
  .inputSchema(uninstallDokkuSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId } = clientInput
    const { payload, userTenant } = ctx

    const serverDetails = (await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 1,
      context: {
        populateServerDetails: true,
      },
    })) as ServerType

    assertTenantOwnership(
      serverDetails.tenant,
      ctx.userTenant.tenant.id,
      'Server',
    )
    const sshDetails = extractSSHDetails({ server: serverDetails })

    const resetServerResult = await addResetServerQueue({
      sshDetails,
      serverDetails: serverDetails,
      tenant: {
        slug: userTenant.tenant.slug,
        id: userTenant.tenant.id,
      },
    })

    if (resetServerResult.id) {
      return { success: true }
    }

    return { success: false }
  })

export const resetServerOnboardingAction = protectedClient
  .metadata({
    actionName: 'resetServerOnboardingAction',
  })
  .inputSchema(uninstallDokkuSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId } = clientInput
    const { payload, user, userTenant } = ctx

    const serverDoc = await payload.findByID({
      collection: 'servers',
      id: serverId,
    })
    assertTenantOwnership(serverDoc.tenant, userTenant.tenant.id, 'Server')

    await payload.update({
      id: serverId,
      data: { onboarded: false, domains: [], plugins: [] },
      collection: 'servers',
    })

    // Audit trail for the reset (surfaced as an alert via ?onboarding-reset=1)
    if (user) {
      const { trackActivity } = await import('@/lib/activityTracker')
      await trackActivity({
        payload,
        userId: user.id,
        eventType: 'server_onboarding_reset',
        operation: 'update',
        label: 'Server Onboarding Reset',
        status: 'success',
        severity: 'warning',
        category: 'server',
        collectionSlug: 'servers',
        documentId: serverId,
        icon: 'rotate-ccw',
      })
    }

    revalidatePath(`/${userTenant.tenant.slug}/servers/${serverId}`)
    return { success: true }
  })

export const cleanupServerAction = protectedClient
  .metadata({
    actionName: 'cleanupServerAction',
  })
  .inputSchema(cleanupServerSchema)
  .action(async ({ clientInput, ctx }) => {
    const {
      serverId,
      olderThanHours = 168,
      pruneVolumes = false,
      dokkuCleanup = true,
    } = clientInput
    const { payload, userTenant } = ctx

    const serverDetails = await payload.findByID({
      collection: 'servers',
      id: serverId,
    })

    assertTenantOwnership(
      serverDetails.tenant,
      ctx.userTenant.tenant.id,
      'Server',
    )
    const sshDetails = extractSSHDetails({ server: serverDetails })

    const cleanupResult = await addCleanupServerQueue({
      sshDetails,
      serverDetails: {
        id: serverId,
      },
      tenant: {
        slug: userTenant.tenant.slug,
        id: userTenant.tenant.id,
      },
      options: { olderThanHours, pruneVolumes, dokkuCleanup },
    })

    if (cleanupResult.id) {
      return { success: true }
    }

    return { success: false }
  })

export const setServerAutoCleanupAction = protectedClient
  .metadata({
    actionName: 'setServerAutoCleanupAction',
  })
  .inputSchema(setServerAutoCleanupSchema)
  .action(async ({ clientInput, ctx }) => {
    const {
      serverId,
      enabled,
      olderThanHours = 168,
      pruneVolumes = false,
    } = clientInput
    const { payload, userTenant } = ctx

    const serverDoc = await payload.findByID({
      collection: 'servers',
      id: serverId,
    })
    assertTenantOwnership(serverDoc.tenant, userTenant.tenant.id, 'Server')

    await payload.update({
      collection: 'servers',
      id: serverId,
      data: {
        autoCleanup: { enabled, olderThanHours, pruneVolumes },
      },
    })

    revalidatePath(`/${userTenant.tenant.slug}/servers/${serverId}`)

    return { success: true }
  })
