'use server'

import { env } from 'env'
import net from 'net'
import { revalidatePath } from 'next/cache'
import { NodeSSH } from 'node-ssh'
import { extractID } from 'payload/shared'

import { dokku } from '@/lib/dokku'
import { assertTenantOwnership, extractTenantSlug } from '@/lib/extractID'
import { protectedClient } from '@/lib/safe-action'
import { cloneService } from '@/lib/service/cloneService'
import { checkServerResources } from '@/lib/server/resourceCheck'
import { dynamicSSH, extractSSHDetails } from '@/lib/ssh'
import { getUniqueName } from '@/lib/uniqueName'
import { buildConnectionUrl, parseDatabaseUrl } from '@/lib/utils'
import { addDestroyApplicationQueue } from '@/queues/app/destroy'
import { addResourceAppQueue } from '@/queues/app/resource'
import { addRestartAppQueue } from '@/queues/app/restart'
import { addScaleAppQueue } from '@/queues/app/scale'
import { addStopAppQueue } from '@/queues/app/stop'
import { addDestroyDatabaseQueue } from '@/queues/database/destroy'
import { addExposeDatabasePortQueue } from '@/queues/database/expose'
import { addRestartDatabaseQueue } from '@/queues/database/restart'
import { addStopDatabaseQueue } from '@/queues/database/stop'
import { addManageServiceDomainQueue } from '@/queues/domain/manage'
import { addUpdateEnvironmentVariablesQueue } from '@/queues/environment/update'
import { addLetsencryptRegenerateQueueQueue } from '@/queues/letsencrypt/regenerate'
import { ServerType } from '@/payload-types-overrides'
import { addCreateServiceWithPluginsQueue } from '@/queues/service/createWithPlugins'
import { updateVolumesQueue } from '@/queues/volume/updateVolumesQueue'

import {
  checkServerResourcesSchema,
  cloneServiceSchema,
  clearServiceResourceLimitSchema,
  clearServiceResourceReserveSchema,
  createServiceSchema,
  deleteServiceSchema,
  exposeDatabasePortSchema,
  fetchServiceResourceStatusSchema,
  fetchServiceScaleStatusSchema,
  getServiceNginxConfigSchema,
  markDefaultServiceDomainSchema,
  migrateDatabaseSchema,
  regenerateSSLSchema,
  restartServiceSchema,
  scaleServiceSchema,
  setServiceNginxConfigSchema,
  setServiceResourceLimitSchema,
  setServiceResourceReserveSchema,
  stopServiceSchema,
  testExternalDbConnectionSchema,
  toggleHttpAuthSchema,
  toggleMaintenanceSchema,
  updateServiceDomainSchema,
  updateServiceSchema,
  updateVolumesSchema,
} from './validator'

function getServerIdFromProject(project: any): string {
  if (!project) return ''
  if (typeof project === 'string') return project
  if (typeof project.server === 'string') return project.server
  if (typeof project.server === 'object' && project.server !== null)
    return project.server.id
  return ''
}

// No need to handle try/catch that abstraction is taken care by next-safe-actions
export const createServiceAction = protectedClient
  .metadata({
    // This action name can be used for sentry tracking
    actionName: 'createServiceAction',
  })
  .inputSchema(createServiceSchema)
  .action(async ({ clientInput, ctx }) => {
    const {
      name,
      description,
      projectId,
      type,
      databaseType,
      databaseProvider,
      externalDetails,
      databaseVersion,
    } = clientInput
    const {
      userTenant: { tenant },
      payload,
      user,
    } = ctx

    const {
      server,
      name: projectName,
      tenant: docTenant,
    } = await payload.findByID({
      collection: 'projects',
      id: projectId,
      depth: 2,
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Project')

    // External databases (Neon, Atlas, Turso, RDS, …) are managed outside
    // dFlow — we only store the connection details; nothing is provisioned
    // on the project's server (#412/#366).
    if (type === 'database' && databaseProvider === 'external') {
      const connectionUrl =
        externalDetails?.connectionUrl ||
        buildConnectionUrl({
          type: databaseType!,
          host: externalDetails?.host ?? '',
          port: externalDetails?.port,
          username: externalDetails?.username,
          password: externalDetails?.password,
          databaseName: externalDetails?.databaseName,
        })

      const parsed = parseDatabaseUrl(connectionUrl)

      const databaseResponse = await payload.create({
        collection: 'services',
        data: {
          project: projectId,
          name: await getUniqueName(async candidate => {
            const { totalDocs } = await payload.count({
              collection: 'services',
              where: {
                and: [
                  { tenant: { equals: tenant.id } },
                  { name: { equals: candidate } },
                ],
              },
            })
            return totalDocs > 0
          }, `${projectName}-${name.slice(0, 10)}`),
          description,
          type,
          databaseDetails: {
            type: databaseType,
            provider: 'external',
            version: databaseVersion,
            host: externalDetails?.host || parsed.host,
            port: externalDetails?.port || parsed.port,
            username: externalDetails?.username || parsed.username,
            password: externalDetails?.password || parsed.password,
            connectionUrl,
            status: 'running',
          },
          tenant,
        },
        user,
      })

      if (databaseResponse.id) {
        revalidatePath(`/${tenant.slug}/dashboard/project/${projectId}`)
        return {
          success: true,
          redirectUrl: `/${tenant.slug}/dashboard/project/${projectId}/service/${databaseResponse.id}`,
        }
      }

      throw new Error('Failed to create external database service')
    }

    const slicedName = name.slice(0, 10)

    let serviceName = await getUniqueName(async candidate => {
      const { totalDocs } = await payload.count({
        collection: 'services',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { name: { equals: candidate } },
          ],
        },
      })
      return totalDocs > 0
    }, `${projectName}-${slicedName}`)

    let ssh: NodeSSH | null = null

    const sshDetails = extractSSHDetails({ server })

    try {
      // Commented: Resource capability check - now allows creation regardless of resources
      // const resourceCheck = await checkServerResources(ssh, {
      //   serviceType: type,
      // })
      // if (!resourceCheck.capable) {
      //   console.log('Unable to create service')
      //   throw new Error(
      //     `Server is not capable of handling a new service: ${resourceCheck.reason}`,
      //   )
      // }

      // serviceName is already unique (resolved above); no suffix needed

      if (type === 'app' || type === 'docker') {
        ssh = await dynamicSSH(sshDetails)

        // Creating app in dokku
        const appsCreationResponse = await dokku.apps.create(ssh, serviceName)

        // If app created adding db entry
        if (appsCreationResponse) {
          const response = await payload.create({
            collection: 'services',
            data: {
              project: projectId,
              name: serviceName,
              description,
              type,
              databaseDetails: {
                type: databaseType,
                version: databaseVersion,
              },
              tenant,
            },
            user,
          })

          // Apply default resource limits if configured on the server
          if (
            server &&
            typeof server === 'object' &&
            'defaultResourceLimits' in server &&
            server.defaultResourceLimits &&
            (server.defaultResourceLimits.cpu ||
              server.defaultResourceLimits.memory)
          ) {
            const resourceArgs = []
            if (server.defaultResourceLimits.cpu)
              resourceArgs.push(`--cpu ${server.defaultResourceLimits.cpu}`)
            if (server.defaultResourceLimits.memory)
              resourceArgs.push(
                `--memory ${server.defaultResourceLimits.memory}`,
              )
            try {
              await dokku.resource.limit(ssh, serviceName, resourceArgs)
            } catch (e) {
              console.error('Failed to apply default resource limits:', e)
              // Do not throw, allow service creation to succeed
            }
          }

          if (response?.id) {
            revalidatePath(`/${tenant.slug}/dashboard/project/${projectId}`)
            return {
              success: true,
              redirectUrl: `/${tenant.slug}/dashboard/project/${projectId}/service/${response.id}`,
            }
          }
        }
      } else if (databaseType) {
        // const databaseList = await dokku.database.list(ssh, databaseType)

        // Throwing a error if database is already created
        // if (databaseList.includes(serviceName)) {
        //   throw new Error('Name is already taken!')
        // }

        const databaseResponse = await payload.create({
          collection: 'services',
          data: {
            project: projectId,
            name: serviceName,
            description,
            type,
            databaseDetails: {
              type: databaseType,
              version: databaseVersion,
            },
            tenant,
          },
          user,
        })

        if (databaseResponse.id) {
          revalidatePath(`/${tenant.slug}/dashboard/project/${projectId}`)

          return {
            success: true,
            redirectUrl: `/${tenant.slug}/dashboard/project/${projectId}/service/${databaseResponse.id}`,
          }
        }
      }
    } catch (error) {
      let message = ''

      if (error instanceof Error) {
        message = error.message
      }

      throw new Error(message)
    } finally {
      // disposing ssh even on error cases
      if (ssh) {
        ssh.dispose()
      }
    }
  })

// TCP-level reachability check for externally-managed databases —
// confirms host:port is dialable before the service is created (#412/#366).
export const testExternalDbConnectionAction = protectedClient
  .metadata({ actionName: 'testExternalDbConnectionAction' })
  .inputSchema(testExternalDbConnectionSchema)
  .action(async ({ clientInput }) => {
    const { connectionUrl, host, port, databaseType } = clientInput

    let targetHost = host
    let targetPort = port

    if (connectionUrl) {
      const parsed = parseDatabaseUrl(connectionUrl)
      targetHost = parsed.host
      targetPort = parsed.port
    }

    if (!targetHost) {
      throw new Error('Could not determine the database host')
    }

    const defaultPorts: Record<string, string> = {
      postgres: '5432',
      mongo: '27017',
      mysql: '3306',
      mariadb: '3306',
      redis: '6379',
      clickhouse: '9000',
    }
    const resolvedPort = Number(
      targetPort || (databaseType ? defaultPorts[databaseType] : ''),
    )
    if (!resolvedPort || Number.isNaN(resolvedPort)) {
      throw new Error('Could not determine the database port')
    }

    const reachable = await new Promise<boolean>(resolve => {
      const socket = net.connect(
        { host: targetHost, port: resolvedPort },
        () => {
          socket.destroy()
          resolve(true)
        },
      )
      socket.setTimeout(5000)
      socket.on('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.on('error', () => {
        socket.destroy()
        resolve(false)
      })
    })

    if (!reachable) {
      throw new Error(
        `Cannot reach ${targetHost}:${resolvedPort} — check host, port, and firewall`,
      )
    }

    return { success: true, host: targetHost, port: resolvedPort }
  })

// Clone a service into any project — the pragmatic slice of environments
// (#358): new name, copied config/env vars (self-references rewritten),
// and for dokku databases an optional data copy via export → import.
export const cloneServiceAction = protectedClient
  .metadata({ actionName: 'cloneServiceAction' })
  .inputSchema(cloneServiceSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serviceId, projectId, cloneData } = clientInput
    const {
      payload,
      userTenant: { tenant },
      user,
    } = ctx

    const source = await payload.findByID({
      collection: 'services',
      depth: 3,
      id: serviceId,
    })
    assertTenantOwnership(source.tenant, tenant.id, 'Service')

    const targetProject = await payload.findByID({
      collection: 'projects',
      depth: 2,
      id: projectId,
    })
    assertTenantOwnership(targetProject.tenant, tenant.id, 'Project')

    const { service: created, warning } = await cloneService({
      payload,
      user,
      tenant,
      source,
      targetProject,
      cloneData: cloneData ?? false,
    })

    revalidatePath(`/${tenant.slug}/dashboard/project/${projectId}`)
    return {
      success: true,
      redirectUrl: `/${tenant.slug}/dashboard/project/${projectId}/service/${created.id}`,
      ...(warning ? { warning } : {}),
    }
  })

export const createServiceWithPluginAction = protectedClient
  .metadata({
    actionName: 'createServiceWithPluginAction',
  })
  .inputSchema(createServiceSchema)
  .action(async ({ clientInput, ctx }) => {
    const {
      name,
      description,
      projectId,
      type,
      databaseType,
      databaseVersion,
    } = clientInput
    const {
      userTenant: { tenant },
      user,
      payload,
    } = ctx

    try {
      const project = await payload.findByID({
        collection: 'projects',
        id: projectId,
        depth: 0,
      })
      assertTenantOwnership(project.tenant, ctx.userTenant.tenant.id, 'Project')

      const job = await addCreateServiceWithPluginsQueue({
        name,
        description,
        projectId,
        type,
        databaseType,
        databaseVersion,
        userId: user.id,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        serverDetails: {
          id: extractID(project.server),
        },
      })

      revalidatePath(`/${tenant.slug}/dashboard/project/${projectId}`)

      return {
        success: true,
        jobId: job.id,
        message: 'Service creation started',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(message)
    }
  })

export const deleteServiceAction = protectedClient
  .metadata({
    // This action name can be used for sentry tracking
    actionName: 'deleteServiceAction',
  })
  .inputSchema(deleteServiceSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, deleteBackups, deleteFromServer, deleteVolumes } = clientInput
    const {
      userTenant: { tenant },
      payload,
    } = ctx

    const { project, type, ...serviceDetails } = await payload.findByID({
      collection: 'services',
      id,
      depth: 3,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    if (typeof project === 'object') {
      const serverId =
        typeof project.server === 'object' ? project.server.id : project.server

      // Again fetching the server details because, it's coming as objectID
      const serverDetails = await payload.findByID({
        collection: 'servers',
        id: serverId,
      })
      assertTenantOwnership(
        serverDetails.tenant,
        ctx.userTenant.tenant.id,
        'Server',
      )

      // Only delete from server if the option is enabled
      if (deleteFromServer && serverDetails.id) {
        const sshDetails = extractSSHDetails({ server: serverDetails })

        let queueId: string | undefined = ''

        // handling database delete — external databases are managed
        // elsewhere, nothing exists on the server to destroy (#412)
        if (
          type === 'database' &&
          serviceDetails.databaseDetails?.type &&
          serviceDetails.databaseDetails?.provider !== 'external'
        ) {
          const databaseDeletionQueueResponse = await addDestroyDatabaseQueue({
            databaseName: serviceDetails.name,
            databaseType: serviceDetails.databaseDetails?.type,
            sshDetails,
            serverDetails: {
              id: serverDetails.id,
            },
            serviceId: serviceDetails.id,
            deleteBackups,
            tenant: {
              slug: tenant.slug,
            },
          })

          queueId = databaseDeletionQueueResponse.id
        }

        // handling service delete
        if (type === 'app' || type === 'docker') {
          const appDeletionQueueResponse = await addDestroyApplicationQueue({
            sshDetails,
            serviceDetails: {
              name: serviceDetails.name,
            },
            serverDetails: {
              id: serverDetails.id,
            },
            deleteVolumes,
          })

          queueId = appDeletionQueueResponse.id
        }

        // If deleting of service is added to queue, update the service entry
        if (queueId) {
          await payload.update({
            collection: 'services',
            id,
            data: {
              deletedAt: new Date().toISOString(),
            },
          })
        }
      } else if (!deleteFromServer) {
        // marking service as deleted
        await payload.update({
          collection: 'services',
          id,
          data: {
            deletedAt: new Date().toISOString(),
          },
        })
      }

      // Always delete associated deployments
      await payload.update({
        collection: 'deployments',
        data: {
          deletedAt: new Date().toISOString(),
        },
        where: {
          service: {
            equals: id,
          },
        },
      })

      return {
        deleted: true,
        deletedFromServer: deleteFromServer,
      }
    } else {
      throw new Error('Failed to delete service: Project not found')
    }
  })

export const updateServiceAction = protectedClient
  .metadata({
    actionName: 'updateServiceAction',
  })
  .inputSchema(updateServiceSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, ...data } = clientInput
    const {
      userTenant: { tenant },
      payload,
    } = ctx

    const previousDetails = await payload.findByID({
      collection: 'services',
      id,
    })
    assertTenantOwnership(
      previousDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    const response = await payload.update({
      collection: 'services',
      data: {
        ...data,
        provider:
          (data?.providerType ? data?.provider : previousDetails.provider) ??
          null,
      },
      id,
      depth: 3,
    })

    const environmentVariablesChange =
      data?.variables &&
      JSON.stringify(previousDetails.variables) !==
        JSON.stringify(data?.variables)

    // If env variables are added then adding it to queue to update env
    if (
      environmentVariablesChange &&
      typeof response?.project === 'object' &&
      typeof response?.project?.server === 'object'
    ) {
      const sshDetails = extractSSHDetails({ project: response.project })

      await addUpdateEnvironmentVariablesQueue({
        serviceDetails: {
          previousVariables: previousDetails?.variables ?? [],
          variables: response?.variables ?? [],
          name: response?.name,
          noRestart: data?.noRestart ?? true,
          id,
        },
        sshDetails,
        serverDetails: {
          id: response.project.server.id,
        },
        tenantDetails: {
          slug: tenant.slug,
        },
      })
    }

    if (response?.id) {
      const projectId =
        typeof response?.project === 'object'
          ? response?.project?.id
          : response?.project
      revalidatePath(
        `/${tenant.slug}/dashboard/project/${projectId}/service/${response?.id}`,
      )
      return { success: true }
    }
  })

export const restartServiceAction = protectedClient
  .metadata({
    actionName: 'restartServiceAction',
  })
  .inputSchema(restartServiceSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id } = clientInput
    const { payload, userTenant } = ctx

    const { project, type, ...serviceDetails } = await payload.findByID({
      collection: 'services',
      depth: 3,
      id,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    // A if check for getting all ssh keys & server details
    if (typeof project === 'object' && typeof project?.server === 'object') {
      const sshDetails = extractSSHDetails({ project })

      let queueId: string | undefined

      if (type === 'database' && serviceDetails.databaseDetails?.type) {
        const queueResponse = await addRestartDatabaseQueue({
          databaseName: serviceDetails.name,
          databaseType: serviceDetails.databaseDetails?.type,
          sshDetails,
          serviceDetails: {
            id: serviceDetails.id,
          },
          serverDetails: {
            id: serviceDetails.id,
          },
          tenant: {
            slug: userTenant.tenant.slug,
          },
        })

        queueId = queueResponse.id
      }

      if (type === 'docker' || type === 'app') {
        const queueResponse = await addRestartAppQueue({
          sshDetails,
          serviceDetails: {
            id: serviceDetails.id,
            name: serviceDetails.name,
          },
          serverDetails: {
            id: project.server.id,
          },
        })

        queueId = queueResponse.id
      }

      if (queueId) {
        return { success: true }
      }
    }
  })

export const stopServiceAction = protectedClient
  .metadata({
    actionName: 'stopServiceAction',
  })
  .inputSchema(stopServiceSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id } = clientInput
    const { payload, userTenant } = ctx

    const { project, type, ...serviceDetails } = await payload.findByID({
      collection: 'services',
      depth: 3,
      id,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    // A if check for getting all ssh keys & server details
    if (typeof project === 'object' && typeof project?.server === 'object') {
      const sshDetails = extractSSHDetails({ project })
      let queueId: string | undefined

      if (type === 'database' && serviceDetails.databaseDetails?.type) {
        const queueResponse = await addStopDatabaseQueue({
          databaseName: serviceDetails.name,
          databaseType: serviceDetails.databaseDetails?.type,
          sshDetails,
          serviceDetails: {
            id: serviceDetails.id,
          },
          serverDetails: {
            id: project.server.id,
          },
          tenant: {
            slug: userTenant.tenant.slug,
          },
        })

        queueId = queueResponse.id
      }

      if (type === 'docker' || type === 'app') {
        const queueResponse = await addStopAppQueue({
          sshDetails,
          serviceDetails: {
            id: serviceDetails.id,
            name: serviceDetails.name,
          },
          serverDetails: {
            id: project.server.id,
          },
        })

        queueId = queueResponse.id
      }

      if (queueId) {
        return { success: true }
      }
    }
  })

export const toggleMaintenanceAction = protectedClient
  .metadata({
    actionName: 'toggleMaintenanceAction',
  })
  .inputSchema(toggleMaintenanceSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, enabled } = clientInput
    const { payload } = ctx

    const { project, type, ...serviceDetails } = await payload.findByID({
      collection: 'services',
      depth: 3,
      id,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    if (type !== 'app' && type !== 'docker') {
      throw new Error('Maintenance mode is only available for app services')
    }

    if (typeof project === 'object' && typeof project?.server === 'object') {
      const sshDetails = extractSSHDetails({ project })
      const ssh = await dynamicSSH(sshDetails)

      try {
        if (enabled) {
          await dokku.maintenance.on(ssh, serviceDetails.name)
        } else {
          await dokku.maintenance.off(ssh, serviceDetails.name)
        }
        return { success: true }
      } finally {
        ssh.dispose()
      }
    }

    throw new Error('Server details not found')
  })

export const getMaintenanceStatusAction = protectedClient
  .metadata({
    actionName: 'getMaintenanceStatusAction',
  })
  .inputSchema(restartServiceSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id } = clientInput
    const { payload } = ctx

    const { project, ...serviceDetails } = await payload.findByID({
      collection: 'services',
      depth: 3,
      id,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    if (typeof project === 'object' && typeof project?.server === 'object') {
      const sshDetails = extractSSHDetails({ project })
      const ssh = await dynamicSSH(sshDetails)

      try {
        const enabled = await dokku.maintenance.status(ssh, serviceDetails.name)
        return { success: true, enabled }
      } finally {
        ssh.dispose()
      }
    }

    throw new Error('Server details not found')
  })

export const toggleHttpAuthAction = protectedClient
  .metadata({
    actionName: 'toggleHttpAuthAction',
  })
  .inputSchema(toggleHttpAuthSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, enabled, username, password } = clientInput
    const { payload } = ctx

    const { project, type, ...serviceDetails } = await payload.findByID({
      collection: 'services',
      depth: 3,
      id,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    if (type !== 'app' && type !== 'docker') {
      throw new Error('HTTP auth is only available for app services')
    }

    if (enabled && (!username || !password)) {
      throw new Error('Username and password are required to enable HTTP auth')
    }

    if (typeof project === 'object' && typeof project?.server === 'object') {
      const sshDetails = extractSSHDetails({ project })
      const ssh = await dynamicSSH(sshDetails)

      try {
        if (enabled) {
          await dokku.httpAuth.on(
            ssh,
            serviceDetails.name,
            username!,
            password!,
          )
        } else {
          await dokku.httpAuth.off(ssh, serviceDetails.name)
        }
        return { success: true }
      } finally {
        ssh.dispose()
      }
    }

    throw new Error('Server details not found')
  })

export const exposeDatabasePortAction = protectedClient
  .metadata({
    actionName: 'exposeDatabasePortAction',
  })
  .inputSchema(exposeDatabasePortSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, action } = clientInput
    const { payload, userTenant } = ctx

    const { project, type, ...serviceDetails } = await payload.findByID({
      collection: 'services',
      depth: 3,
      id,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    // A if check for getting all ssh keys & server details
    if (typeof project === 'object' && typeof project?.server === 'object') {
      const sshDetails = extractSSHDetails({ project })

      if (type === 'database' && serviceDetails.databaseDetails?.type) {
        const { exposedPorts } = serviceDetails?.databaseDetails

        try {
          const queueResponse = await addExposeDatabasePortQueue({
            databaseName: serviceDetails.name,
            databaseType: serviceDetails.databaseDetails?.type,
            sshDetails,
            serviceDetails: {
              previousPorts: exposedPorts ?? [],
              id: serviceDetails.id,
              action,
            },
            serverDetails: {
              id: project.server.id,
            },
            tenant: {
              slug: userTenant.tenant.slug,
            },
          })

          if (queueResponse.id) {
            return { success: true }
          }
        } catch (error) {
          let message = error instanceof Error ? error.message : ''
          throw new Error(message)
        }
      }
    }
  })

export const updateServiceDomainAction = protectedClient
  .metadata({
    actionName: 'updateServiceDomainAction',
  })
  .inputSchema(updateServiceDomainSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, domain, operation } = clientInput
    const {
      userTenant: { tenant },
      payload,
    } = ctx

    // Fetching service-details for showing previous details
    const {
      domains: servicePreviousDomains,
      project,
      tenant: docTenant,
    } = await payload.findByID({
      id,
      collection: 'services',
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Service')

    let updatedDomains = servicePreviousDomains ?? []

    const proxyDomainExists = updatedDomains.find(({ domain }) =>
      domain.endsWith(env.NEXT_PUBLIC_PROXY_DOMAIN_URL ?? ' '),
    )

    const duplicateWildCardDomain =
      !!proxyDomainExists &&
      domain.hostname.endsWith(env.NEXT_PUBLIC_PROXY_DOMAIN_URL ?? ' ')

    // throwing error if duplicate domain was added again
    // throwing error when more that 1 proxy domain is added!
    if (operation === 'add') {
      const domainExists = updatedDomains.find(
        updatedDomain => updatedDomain.domain === domain.hostname,
      )

      if (domainExists || duplicateWildCardDomain) {
        throw new Error(
          duplicateWildCardDomain
            ? `Wildcard domain already attached`
            : `${domain.hostname} already exists!`,
        )
      }
    }

    // capture the removed entry's Cloudflare custom-hostname id so the
    // queue can delete the CF-side record after the dokku removal
    const removedHostnameId =
      operation === 'remove'
        ? updatedDomains.find(d => d.domain === domain.hostname)
            ?.customHostnameId
        : undefined

    if (operation === 'remove') {
      // In remove case removing that particular domain
      updatedDomains = updatedDomains.filter(
        domainDetails => domainDetails.domain !== domain.hostname,
      )
    } else if (operation === 'set') {
      updatedDomains = [
        {
          domain: domain.hostname,
          default: true,
          autoRegenerateSSL: domain.autoRegenerateSSL,
          certificateType: domain.certificateType,
          synced: false,
        },
      ]
    } else {
      // in ADD case directly adding domain
      updatedDomains = [
        ...updatedDomains.map(updatedDomain =>
          domain?.default
            ? { ...updatedDomain, default: false }
            : updatedDomain,
        ),
        {
          domain: domain.hostname,
          default: domain.default ?? false,
          autoRegenerateSSL: domain.autoRegenerateSSL,
          certificateType: domain.certificateType,
          synced: false,
        },
      ]
    }

    await payload.update({
      id,
      data: {
        domains: updatedDomains,
      },
      collection: 'services',
      depth: 3,
    })

    // for add operation we're not syncing domain as domain verification process not done!
    if (operation !== 'add') {
      syncServiceDomainAction({
        id,
        domain: {
          ...domain,
          customHostnameId: removedHostnameId ?? undefined,
        },
        operation,
      })
    }

    revalidatePath(
      `/${tenant.slug}/dashboard/project/${typeof project === 'object' ? project.id : project}/service/${id}`,
    )

    return { success: true }
  })

export const regenerateSSLAction = protectedClient
  .metadata({
    actionName: 'regenerateSSLAction',
  })
  .inputSchema(regenerateSSLSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, email } = clientInput
    const { payload } = ctx

    const { project, ...serviceDetails } = await payload.findByID({
      collection: 'services',
      depth: 3,
      id,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    if (typeof project === 'object' && typeof project?.server === 'object') {
      const sshDetails = extractSSHDetails({ project })

      const response = await addLetsencryptRegenerateQueueQueue({
        sshDetails,
        serverDetails: {
          id: project?.server?.id,
          hostname: project.server.hostname ?? '',
        },
        serviceDetails: {
          name: serviceDetails.name,
          email,
        },
      })

      if (response.id) {
        return { success: true }
      }
    }
  })

export const syncServiceDomainAction = protectedClient
  .metadata({
    actionName: 'syncServiceDomainAction',
  })
  .inputSchema(updateServiceDomainSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, domain, operation } = clientInput
    const { payload, userTenant } = ctx

    const { project, variables, ...serviceDetails } = await payload.findByID({
      id,
      collection: 'services',
      depth: 3,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )

    if (typeof project === 'object' && typeof project.server === 'object') {
      const sshDetails = extractSSHDetails({ project })
      const isProxyDomain = domain.hostname.endsWith(
        env.NEXT_PUBLIC_PROXY_DOMAIN_URL ?? ' ',
      )

      const queueResponse = await addManageServiceDomainQueue({
        serviceDetails: {
          action: operation,
          domain: domain.hostname,
          name: serviceDetails.name,
          certificateType: isProxyDomain ? 'none' : domain.certificateType,
          autoRegenerateSSL: isProxyDomain ? false : domain.autoRegenerateSSL,
          customHostnameId: domain.customHostnameId,
          id,
          variables: variables ?? [],
        },
        sshDetails,
        serverDetails: {
          id: project.server.id,
          hostname: project.server.hostname ?? '',
          tailscalePrivateIp: project.server.tailscalePrivateIp ?? '',
        },
        updateEnvironmentVariables: domain.default,
        tenantDetails: {
          slug: userTenant.tenant.slug,
        },
      })

      if (queueResponse.id) {
        return { success: true }
      }
    }
  })

export const markDefaultServiceDomainAction = protectedClient
  .metadata({
    actionName: 'markDefaultServiceDomainAction',
  })
  .inputSchema(markDefaultServiceDomainSchema)
  .action(async ({ ctx, clientInput }) => {
    // 1. update domain as default
    const { payload, userTenant } = ctx
    const { serviceId, defaultDomain } = clientInput
    const serviceDetails = await payload.findByID({
      collection: 'services',
      id: serviceId,
    })
    assertTenantOwnership(
      serviceDetails.tenant,
      ctx.userTenant.tenant.id,
      'Service',
    )
    const domainsList = serviceDetails?.domains ?? []

    const updatedService = await payload.update({
      collection: 'services',
      id: serviceId,
      data: {
        domains: domainsList.map(domain => ({
          ...domain,
          default: domain.domain === defaultDomain,
        })),
      },
      depth: 3,
    })

    // 2. trigger updateEnvironment variables queue
    if (
      typeof updatedService?.project === 'object' &&
      typeof updatedService?.project?.server === 'object'
    ) {
      const sshDetails = extractSSHDetails({ project: updatedService.project })
      const queueResponse = await addUpdateEnvironmentVariablesQueue({
        sshDetails,
        serverDetails: {
          id: updatedService.project.server.id,
        },
        serviceDetails: {
          id: serviceId,
          name: serviceDetails.name,
          noRestart: false,
          previousVariables: [],
          variables: serviceDetails.variables ?? [],
        },
        tenantDetails: {
          slug: userTenant.tenant.slug,
        },
      })

      if (queueResponse.id) {
        return { success: true }
      }
    }

    throw new Error('Failed to mark domain as default, please try again')
  })

export const updateVolumesAction = protectedClient
  .metadata({ actionName: 'updateVolumesAction' })
  .inputSchema(updateVolumesSchema)
  .action(async ({ ctx, clientInput }) => {
    const {
      payload,
      userTenant: { tenant },
    } = ctx
    const { id, volumes } = clientInput

    const existingService = await payload.findByID({
      collection: 'services',
      id,
    })
    assertTenantOwnership(existingService.tenant, tenant.id, 'Service')

    const updatedService = await payload.update({
      collection: 'services',
      id: id,
      depth: 3,
      data: {
        volumes: volumes,
      },
    })

    const project = updatedService.project
    if (
      updatedService &&
      typeof project === 'object' &&
      typeof project?.server === 'object'
    ) {
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
  })

// Horizontal scaling: set process scale (replicas)
export const scaleServiceAction = protectedClient
  .metadata({ actionName: 'scaleServiceAction' })
  .inputSchema(scaleServiceSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, scaleArgs } = clientInput
    const { payload, userTenant } = ctx

    const {
      project,
      name,
      tenant: docTenant,
    } = await payload.findByID({
      collection: 'services',
      id,
      depth: 3,
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Service')

    const sshDetails = extractSSHDetails({ project })
    const serverId = getServerIdFromProject(project)
    const tenantSlug =
      typeof userTenant?.tenant?.slug === 'string' ? userTenant.tenant.slug : ''

    const queueResponse = await addScaleAppQueue({
      sshDetails,
      appName: name,
      scaleArgs,
      serverId,
      tenantSlug,
    })

    return { success: true, queued: true, jobId: queueResponse.id }
  })

// Fetch current process scale/status
export const fetchServiceScaleStatusAction = protectedClient
  .metadata({ actionName: 'fetchServiceScaleStatusAction' })
  .inputSchema(fetchServiceScaleStatusSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, parse = true } = clientInput
    const { payload } = ctx

    const {
      project,
      name,
      tenant: docTenant,
    } = await payload.findByID({
      collection: 'services',
      id,
      depth: 3,
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Service')

    const sshDetails = extractSSHDetails({ project })

    let ssh: NodeSSH | null = null

    try {
      ssh = await dynamicSSH(sshDetails)

      const result = await dokku.process.psScale(ssh, name, undefined, parse)

      if (parse) {
        return { success: true, scale: result.parsed }
      } else {
        return { success: true, output: result.stdout }
      }
    } finally {
      if (ssh) ssh.dispose()
    }
  })

// Vertical scaling: set resource limits
export const setServiceResourceLimitAction = protectedClient
  .metadata({ actionName: 'setServiceResourceLimitAction' })
  .inputSchema(setServiceResourceLimitSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, resourceArgs, processType } = clientInput
    const { payload, userTenant } = ctx

    const {
      project,
      name,
      tenant: docTenant,
    } = await payload.findByID({
      collection: 'services',
      id,
      depth: 3,
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Service')

    const sshDetails = extractSSHDetails({ project })
    const serverId = getServerIdFromProject(project)
    const tenantSlug =
      typeof userTenant?.tenant?.slug === 'string' ? userTenant.tenant.slug : ''

    const queueResponse = await addResourceAppQueue({
      sshDetails,
      appName: name,
      resourceArgs,
      processType,
      serverId,
      tenantSlug,
      action: 'limit',
    })

    return { success: true, queued: true, jobId: queueResponse.id }
  })

// Vertical scaling: set resource reservations
export const setServiceResourceReserveAction = protectedClient
  .metadata({ actionName: 'setServiceResourceReserveAction' })
  .inputSchema(setServiceResourceReserveSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, resourceArgs, processType } = clientInput
    const { payload, userTenant } = ctx

    const {
      project,
      name,
      tenant: docTenant,
    } = await payload.findByID({
      collection: 'services',
      id,
      depth: 3,
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Service')

    const sshDetails = extractSSHDetails({ project })
    const serverId = getServerIdFromProject(project)
    const tenantSlug =
      typeof userTenant?.tenant?.slug === 'string' ? userTenant.tenant.slug : ''

    const queueResponse = await addResourceAppQueue({
      sshDetails,
      appName: name,
      resourceArgs,
      processType,
      serverId,
      tenantSlug,
      action: 'reserve',
    })

    return { success: true, queued: true, jobId: queueResponse.id }
  })

// Fetch current resource status
export const fetchServiceResourceStatusAction = protectedClient
  .metadata({ actionName: 'fetchServiceResourceStatusAction' })
  .inputSchema(fetchServiceResourceStatusSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id } = clientInput
    const { payload } = ctx

    const {
      project,
      name,
      tenant: docTenant,
    } = await payload.findByID({
      collection: 'services',
      id,
      depth: 3,
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Service')

    const sshDetails = extractSSHDetails({ project })

    let ssh: NodeSSH | null = null

    try {
      ssh = await dynamicSSH(sshDetails)

      const result = await dokku.resource.report(ssh, name)

      return { success: true, resource: result.parsed }
    } finally {
      if (ssh) ssh.dispose()
    }
  })

// Clear resource limits
export const clearServiceResourceLimitAction = protectedClient
  .metadata({ actionName: 'clearServiceResourceLimitAction' })
  .inputSchema(clearServiceResourceLimitSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, processType } = clientInput
    const { payload, userTenant } = ctx

    const {
      project,
      name,
      tenant: docTenant,
    } = await payload.findByID({
      collection: 'services',
      id,
      depth: 3,
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Service')

    const sshDetails = extractSSHDetails({ project })
    const serverId = getServerIdFromProject(project)
    const tenantSlug =
      typeof userTenant?.tenant?.slug === 'string' ? userTenant.tenant.slug : ''

    const queueResponse = await addResourceAppQueue({
      sshDetails,
      appName: name,
      resourceArgs: [],
      processType,
      serverId,
      tenantSlug,
      action: 'limitClear',
    })

    return { success: true, queued: true, jobId: queueResponse.id }
  })

// Clear resource reservations
export const clearServiceResourceReserveAction = protectedClient
  .metadata({ actionName: 'clearServiceResourceReserveAction' })
  .inputSchema(clearServiceResourceReserveSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id, processType } = clientInput
    const { payload, userTenant } = ctx

    const {
      project,
      name,
      tenant: docTenant,
    } = await payload.findByID({
      collection: 'services',
      id,
      depth: 3,
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Service')

    const sshDetails = extractSSHDetails({ project })
    const serverId = getServerIdFromProject(project)
    const tenantSlug =
      typeof userTenant?.tenant?.slug === 'string' ? userTenant.tenant.slug : ''

    const queueResponse = await addResourceAppQueue({
      sshDetails,
      appName: name,
      resourceArgs: [],
      processType,
      serverId,
      tenantSlug,
      action: 'reserveClear',
    })

    return { success: true, queued: true, jobId: queueResponse.id }
  })

export const checkServerResourcesAction = protectedClient
  .metadata({ actionName: 'checkServerResourcesAction' })
  .inputSchema(checkServerResourcesSchema)
  .action(async ({ ctx, clientInput }) => {
    const { payload } = ctx
    const { serverId, serviceType } = clientInput

    const server = await payload.findByID({
      collection: 'servers',
      id: serverId,
    })
    assertTenantOwnership(server.tenant, ctx.userTenant.tenant.id, 'Server')

    const sshDetails = extractSSHDetails({ server })
    const ssh = await dynamicSSH(sshDetails)

    const result = await checkServerResources(ssh, { serviceType })

    ssh.dispose()

    return result
  })

export const getServiceNginxConfigAction = protectedClient
  .metadata({ actionName: 'getServiceNginxConfigAction' })
  .inputSchema(getServiceNginxConfigSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id } = clientInput
    const { payload } = ctx

    const {
      project,
      name,
      tenant: docTenant,
    } = await payload.findByID({
      collection: 'services',
      id,
      depth: 3,
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Service')

    const sshDetails = extractSSHDetails({ project })

    let ssh: NodeSSH | null = null

    try {
      ssh = await dynamicSSH(sshDetails)

      const result = await dokku.proxy.nginx.report({
        ssh,
        appName: name,
      })

      return result
    } finally {
      if (ssh) ssh.dispose()
    }
  })

export const setServiceNginxConfigAction = protectedClient
  .metadata({ actionName: 'setServiceNginxConfigSchema' })
  .inputSchema(setServiceNginxConfigSchema)
  .action(async ({ clientInput, ctx }) => {
    const { key, value, serviceId } = clientInput
    const { payload } = ctx

    const {
      project,
      name,
      type,
      tenant: docTenant,
    } = await payload.findByID({
      collection: 'services',
      id: serviceId,
      depth: 3,
    })
    assertTenantOwnership(docTenant, ctx.userTenant.tenant.id, 'Service')

    const sshDetails = extractSSHDetails({ project })

    let ssh: NodeSSH | null = null

    try {
      ssh = await dynamicSSH(sshDetails)

      const result = await dokku.proxy.nginx.set({
        ssh,
        appName: name,
        key,
        value,
      })

      // Restarting app after configuration got updated
      if (
        typeof project === 'object' &&
        (type === 'docker' || type === 'app')
      ) {
        await addRestartAppQueue({
          sshDetails,
          serviceDetails: {
            id: serviceId,
            name,
          },
          serverDetails: {
            id: extractID(project.server),
          },
        })
      }

      return result
    } finally {
      if (ssh) ssh.dispose()
    }
  })

// Migrates a database service's data to another server (#408). Creates a
// new database service in the target project and queues
// export → transfer → import. The source database is left running; apps
// keep pointing at it until their env vars are re-linked.
export const migrateDatabaseAction = protectedClient
  .metadata({ actionName: 'migrateDatabaseAction' })
  .inputSchema(migrateDatabaseSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serviceId, targetProjectId, targetDatabaseName } = clientInput
    const {
      payload,
      user,
      userTenant: { tenant },
    } = ctx

    const service = await payload.findByID({
      collection: 'services',
      id: serviceId,
      depth: 2,
    })

    const serviceTenantId =
      typeof service.tenant === 'object' ? service.tenant?.id : service.tenant
    if (!serviceTenantId || serviceTenantId !== tenant.id) {
      throw new Error('Service not found')
    }

    if (service.type !== 'database' || !service.databaseDetails?.type) {
      throw new Error('Only database services can be migrated')
    }

    const sourceProject =
      typeof service.project === 'object' ? service.project : null
    if (!sourceProject) {
      throw new Error('Service has no project')
    }

    const targetProject = await payload.findByID({
      collection: 'projects',
      id: targetProjectId,
      depth: 2,
    })

    const projectTenantId =
      typeof targetProject.tenant === 'object'
        ? targetProject.tenant?.id
        : targetProject.tenant
    if (!projectTenantId || projectTenantId !== tenant.id) {
      throw new Error('Target project not found')
    }

    const sourceServerId = extractID(sourceProject.server)
    const targetServerId = extractID(targetProject.server)

    if (sourceServerId === targetServerId) {
      throw new Error(
        'Target project is on the same server — nothing to migrate',
      )
    }

    const sourceServer = await payload.findByID({
      collection: 'servers',
      id: sourceServerId,
      depth: 1,
    })
    const targetServer = (await payload.findByID({
      collection: 'servers',
      id: targetServerId,
      depth: 1,
    })) as ServerType

    if (!targetServer.version || targetServer.version === 'not-installed') {
      throw new Error('Dokku is not installed on the target server')
    }

    const databaseType = service.databaseDetails.type
    const finalName = await getUniqueName(async name => {
      const { totalDocs } = await payload.count({
        collection: 'services',
        where: {
          and: [
            { name: { equals: name } },
            { 'tenant.slug': { equals: tenant.slug } },
          ],
        },
      })
      return totalDocs > 0
    }, `${targetProject.name}-${targetDatabaseName}`)

    const targetService = await payload.create({
      collection: 'services',
      data: {
        name: finalName,
        type: 'database',
        project: targetProjectId,
        tenant: tenant.id,
        databaseDetails: {
          type: databaseType,
        },
        description: `Migrated from ${service.name} (server ${sourceServer.name ?? sourceServerId})`,
      },
    })

    const deployment = await payload.create({
      collection: 'deployments',
      data: {
        service: targetService.id,
        status: 'queued',
      },
    })

    const { addDatabaseMigrateQueue } = await import(
      '@/queues/database/migrate'
    )
    await addDatabaseMigrateQueue({
      sourceServiceId: service.id,
      sourceDatabaseName: service.name,
      databaseType,
      sourceServerId,
      targetServerId,
      targetProjectId,
      targetDatabaseName: finalName,
      targetServiceId: targetService.id,
      targetDeploymentId: deployment.id,
      sourceSshDetails: extractSSHDetails({ server: sourceServer }),
      targetSshDetails: extractSSHDetails({ server: targetServer }),
      tenant: { slug: tenant.slug },
      userId: user.id,
    })

    const tenantSlug = extractTenantSlug(targetProject.tenant)
    if (tenantSlug) {
      revalidatePath(`/${tenantSlug}/dashboard/project/${targetProjectId}`)
    }

    return { success: true, service: targetService, deployment }
  })
