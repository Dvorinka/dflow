'use server'

import { assertTenantOwnership } from '@/lib/extractID'
import { protectedClient } from '@/lib/safe-action'

import { getServiceDetailsSchema } from './validator'

export const getServiceDetails = protectedClient
  .metadata({
    actionName: 'getServiceDetails',
  })
  .inputSchema(getServiceDetailsSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id } = clientInput
    const {
      userTenant: { tenant },
      payload,
    } = ctx

    const { docs: services } = await payload.find({
      collection: 'services',
      where: {
        and: [
          {
            id: {
              equals: id,
            },
          },
          {
            'project.hidden': {
              not_equals: true,
            },
          },
          {
            'tenant.slug': {
              equals: tenant.slug,
            },
          },
        ],
      },
      joins: {
        deployments: {
          count: true,
        },
      },
      depth: 3,
    })

    return services.at(0)
  })

export const getServiceDeploymentsBackups = protectedClient
  .metadata({
    actionName: 'getServiceDeploymentsBackups',
  })
  .inputSchema(getServiceDetailsSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id } = clientInput
    const {
      payload,
      userTenant: { tenant },
    } = ctx

    const [{ docs: services }, { docs: deployments }] = await Promise.all([
      payload.find({
        collection: 'services',
        where: {
          and: [
            {
              id: {
                equals: id,
              },
            },
            {
              'project.hidden': {
                not_equals: true,
              },
            },
            {
              'tenant.slug': {
                equals: tenant.slug,
              },
            },
          ],
        },
      }),
      payload.find({
        collection: 'deployments',
        pagination: false,
        where: {
          service: {
            equals: id,
          },
        },
      }),
    ])

    const service = services.at(0)

    return { service, deployments }
  })

export const getDeploymentsAction = protectedClient
  .metadata({
    actionName: 'getDeploymentsAction',
  })
  .inputSchema(getServiceDetailsSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id } = clientInput

    const { payload } = ctx

    const { docs: deployments } = await payload.find({
      collection: 'deployments',
      pagination: false,
      where: {
        service: {
          equals: id,
        },
      },
      depth: 0,
    })

    return deployments
  })

export const getServiceBackups = protectedClient
  .metadata({
    actionName: 'getServiceBackups',
  })
  .inputSchema(getServiceDetailsSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id } = clientInput
    const { payload } = ctx

    const { docs: backups } = await payload.find({
      collection: 'backups',
      where: {
        service: {
          equals: id,
        },
      },
    })

    return backups
  })

// Backups that can seed this (possibly newly created, #484) database:
// same server, same database type, successful, from other services.
export const getRestorableBackups = protectedClient
  .metadata({
    actionName: 'getRestorableBackups',
  })
  .inputSchema(getServiceDetailsSchema)
  .action(async ({ clientInput, ctx }) => {
    const { id } = clientInput
    const {
      payload,
      userTenant: { tenant },
    } = ctx

    const target = await payload.findByID({
      collection: 'services',
      id,
      depth: 2,
    })
    assertTenantOwnership(target.tenant, ctx.userTenant.tenant.id, 'Service')
    const targetType = target?.databaseDetails?.type ?? null
    const targetServerId =
      typeof target?.project === 'object' &&
      typeof target.project.server === 'object'
        ? target.project.server.id
        : typeof target?.project === 'object'
          ? target.project.server
          : null

    if (!targetType || !targetServerId) return []

    const { docs: backups } = await payload.find({
      collection: 'backups',
      pagination: false,
      sort: '-createdAt',
      where: {
        and: [
          { status: { equals: 'success' } },
          { databaseType: { equals: targetType } },
          { 'tenant.slug': { equals: tenant.slug } },
        ],
      },
      depth: 2,
    })

    // ponytail: in-code server match; Payload where can't join
    // backup -> service -> project -> server in one query.
    return backups.filter(backup => {
      if (typeof backup.service === 'string') return false
      if (backup.service.id === id) return false
      const project = backup.service.project
      if (typeof project !== 'object' || !project) return false
      const serverId =
        typeof project.server === 'object' ? project.server.id : project.server
      return serverId === targetServerId
    })
  })
