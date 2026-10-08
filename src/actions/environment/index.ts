'use server'

import { revalidatePath } from 'next/cache'

import {
  assertTenantOwnership,
  extractID,
  extractTenantSlug,
} from '@/lib/extractID'
import { protectedClient } from '@/lib/safe-action'
import { cloneService } from '@/lib/service/cloneService'
import { getUniqueName } from '@/lib/uniqueName'

import {
  createEnvironmentSchema,
  getEnvironmentsSchema,
} from './validator'

/**
 * Environments are modelled as child projects (#358): a project with
 * `parent` pointing at the root project. This reuses the whole existing
 * stack — per-env servers, service cloning incl. cross-server database
 * copies, deploys, domains and teardown — without new plumbing.
 */

export const getEnvironmentsAction = protectedClient
  .metadata({ actionName: 'getEnvironmentsAction' })
  .inputSchema(getEnvironmentsSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant } = ctx
    const { projectId } = clientInput

    const project = await payload.findByID({
      collection: 'projects',
      id: projectId,
      depth: 1,
    })
    assertTenantOwnership(project.tenant, userTenant.tenant.id, 'Project')

    const rootId = project.parent ? extractID(project.parent) : project.id

    const { docs: envs } = await payload.find({
      collection: 'projects',
      pagination: false,
      depth: 1,
      where: {
        and: [
          { 'tenant.slug': { equals: userTenant.tenant.slug } },
          { deletedAt: { exists: false } },
          {
            or: [{ id: { equals: rootId } }, { parent: { equals: rootId } }],
          },
        ],
      },
      sort: 'createdAt',
    })

    return {
      rootId,
      environments: envs.map(e => ({
        id: e.id,
        name: e.id === rootId ? 'production' : (e.environment ?? e.name),
        projectName: e.name,
        isRoot: e.id === rootId,
        server:
          typeof e.server === 'object'
            ? { id: e.server.id, name: e.server.name }
            : null,
      })),
    }
  })

export const createEnvironmentAction = protectedClient
  .metadata({ actionName: 'createEnvironmentAction' })
  .inputSchema(createEnvironmentSchema)
  .action(async ({ clientInput, ctx }) => {
    const { payload, userTenant, user } = ctx
    const { projectId, name, serverId, copyFromProjectId, cloneData } =
      clientInput
    const tenant = userTenant.tenant

    const root = await payload.findByID({
      collection: 'projects',
      id: projectId,
      depth: 2,
    })
    assertTenantOwnership(root.tenant, tenant.id, 'Project')

    if (root.parent) {
      throw new Error(
        'Create environments on the production project, not inside another environment',
      )
    }

    const server =
      serverId ??
      (typeof root.server === 'object' ? root.server.id : root.server)
    if (!server) {
      throw new Error('No server available for the environment')
    }

    if (serverId) {
      const serverDoc = await payload.findByID({
        collection: 'servers',
        id: serverId,
      })
      assertTenantOwnership(serverDoc.tenant, tenant.id, 'Server')
    }

    const projectName = await getUniqueName(async candidate => {
      const { totalDocs } = await payload.count({
        collection: 'projects',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { name: { equals: candidate } },
          ],
        },
      })
      return totalDocs > 0
    }, `${root.name}-${name}`.slice(0, 48))

    const child = await payload.create({
      collection: 'projects',
      data: {
        name: projectName,
        description: `${name} environment of ${root.name}`,
        server,
        parent: root.id,
        environment: name,
        tenant: tenant.id,
        createdBy: user.id,
      } as any,
      depth: 2,
      user,
    })

    // Optionally seed the environment with clones of another
    // environment's services — including database contents.
    const warnings: string[] = []
    if (copyFromProjectId) {
      const sourceProject = await payload.findByID({
        collection: 'projects',
        id: copyFromProjectId,
        depth: 2,
      })
      assertTenantOwnership(sourceProject.tenant, tenant.id, 'Project')

      const { docs: services } = await payload.find({
        collection: 'services',
        pagination: false,
        depth: 3,
        where: {
          and: [
            { project: { equals: copyFromProjectId } },
            { deletedAt: { exists: false } },
          ],
        },
      })

      for (const service of services) {
        try {
          const result = await cloneService({
            payload,
            user,
            tenant,
            source: service,
            targetProject: child,
            cloneData: cloneData ?? false,
          })
          if (result.warning) warnings.push(result.warning)
        } catch (error) {
          warnings.push(
            `${service.name}: ${error instanceof Error ? error.message : 'clone failed'}`,
          )
        }
      }
    }

    revalidatePath(
      `/${extractTenantSlug(tenant)}/dashboard/project/${root.id}`,
    )

    return {
      success: true,
      environment: { id: child.id, name, projectName },
      ...(warnings.length ? { warnings } : {}),
    }
  })
