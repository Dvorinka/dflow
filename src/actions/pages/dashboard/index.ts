'use server'

import { protectedClient } from '@/lib/safe-action'

export const getProjectsAndServers = protectedClient
  .metadata({
    actionName: 'getProjectsAndServers',
  })
  .action(async ({ ctx }) => {
    const {
      user,
      payload,
      userTenant: { tenant, role },
    } = ctx

    const [serversRes, projectsRes] = await Promise.all([
      payload.find({
        collection: 'servers',
        pagination: false,
        where: {
          and: [
            {
              'tenant.slug': {
                equals: tenant.slug,
              },
            },
            ...(role?.servers?.readLimit === 'createdByUser'
              ? [
                  {
                    createdBy: {
                      equals: user?.id,
                    },
                  },
                ]
              : []),
          ],
        },

        select: {
          name: true,
          connection: true,
          onboarded: true,
          plugins: true,
        },
      }),
      payload.find({
        collection: 'projects',
        depth: 1,
        where: {
          and: [
            {
              'tenant.slug': {
                equals: tenant.slug,
              },
            },
            {
              hidden: {
                not_equals: true,
              },
            },
            // child environment projects show inside their parent's
            // environment switcher, not as separate cards (#358)
            {
              parent: {
                exists: false,
              },
            },
            ...(role?.projects?.readLimit === 'createdByUser'
              ? [
                  {
                    createdBy: {
                      equals: user?.id,
                    },
                  },
                ]
              : []),
          ],
        },
        pagination: false,
        sort: '-createdAt',
        joins: {
          services: {
            limit: 1000,
          },
        },
      }),
    ])

    return { serversRes, projectsRes }
  })
