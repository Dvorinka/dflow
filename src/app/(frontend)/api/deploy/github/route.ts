import { Webhooks } from '@octokit/webhooks'
import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'

import { triggerDeployment } from '@/actions/deployment/deploy'

export async function POST(request: Request) {
  const headers = request.headers
  const signature = headers.get('x-hub-signature-256')
  const event = headers.get('x-github-event')

  const body = await request.json()

  const installationId = body.installation?.id
  const repositoryName = body?.repository?.name
  // push payloads carry ref; fork-sync payloads may not, in which case each
  // matching service deploys its own tracked branch (resolved per service)
  const branchName = body?.ref?.replace('refs/heads/', '')
  const matchAnyBranch = event === 'fork-sync' && !branchName

  const payload = await getPayload({ config: configPromise })

  if (!installationId) {
    return Response.json(
      {
        message: 'Github-app installation not done',
      },
      {
        status: 400,
      },
    )
  }

  const { docs } = await payload.find({
    collection: 'gitProviders',
    where: {
      'github.installationId': {
        equals: installationId,
      },
    },
    depth: 5,
  })

  const githubAppDetails = docs?.[0]
  const tenantSlug =
    githubAppDetails?.tenant && typeof githubAppDetails?.tenant === 'object'
      ? githubAppDetails?.tenant?.slug
      : ''

  // Checking if github-app is present or not
  if (!githubAppDetails?.id) {
    return Response.json(
      {
        message: 'Github-app not found',
      },
      {
        status: 404,
      },
    )
  }

  // Checking if the webhook request has signature
  if (!signature) {
    return Response.json(
      {
        message: 'Signature not found',
      },
      {
        status: 404,
      },
    )
  }

  // Checking if the github app installed or not
  if (!githubAppDetails?.github?.installationId) {
    return Response.json(
      {
        message: 'Github-app not installed',
      },
      {
        status: 400,
      },
    )
  }

  const webhooks = new Webhooks({
    secret: githubAppDetails.github?.webhookSecret ?? '',
  })

  const verified = await webhooks.verify(JSON.stringify(body), signature)

  // Verifying if it's a valid request or not
  if (!verified) {
    return Response.json(
      {
        message: 'Unauthenticated',
      },
      {
        status: 401,
      },
    )
  }

  const where: Where = matchAnyBranch
    ? {
        and: [
          {
            'githubSettings.repository': {
              equals: repositoryName,
            },
          },
          {
            provider: {
              equals: githubAppDetails.id,
            },
          },
        ],
      }
    : {
        and: [
          {
            'githubSettings.branch': {
              equals: branchName,
            },
          },
          {
            'githubSettings.repository': {
              equals: repositoryName,
            },
          },
          {
            provider: {
              equals: githubAppDetails.id,
            },
          },
        ],
      }

  const { docs: services } = await payload.find({
    collection: 'services',
    where,
  })

  // on push event triggering a deployment
  if (event === 'push') {
    for await (const service of services) {
      await triggerDeployment({
        serviceId: service.id,
        cache: 'no-cache',
        tenantSlug,
      })
    }
  }

  // fork-sync carries the same repo payload without branch scope; deploy
  // matching services on their tracked branches (#422)
  if (event === 'fork-sync') {
    for await (const service of services) {
      await triggerDeployment({
        serviceId: service.id,
        cache: 'no-cache',
        tenantSlug,
      })
    }
  }

  return Response.json(
    {
      message: 'Response received',
    },
    {
      status: 200,
    },
  )
}
