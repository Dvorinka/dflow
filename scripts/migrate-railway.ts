// Railway → dFlow project migrator (#409).
//
// Pulls a Railway project's services, environment variables, source
// references and domains via the Railway public GraphQL API, then
// recreates them as dFlow project + service records through the target
// instance's Payload REST API — works against cloud or self-hosted
// instances alike.
//
//   npx tsx scripts/migrate-railway.ts \
//     --railway-token <token> \
//     --project <railway-project-id-or-name> \
//     --environment production \
//     --dflow-url https://dflow.example.com \
//     --api-key <payload-api-key> \
//     --tenant <tenant-slug> \
//     --server <dflow-server-id> \
//     [--dry-run]
//
// The API key must belong to an *admin* user (users.enableAPIKey) — the
// projects/services collections gate CRUD on isAdmin. Generate one in
// the Payload admin under the target user's API Keys.
//
// Deliberately out of scope: provisioning. Services are created as
// records; databases still need a dokku `db:create` (do it from the
// service's dFlow page), and app services go live on the first deploy.
// Volume/disk data does not transfer — dump & restore manually.

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2'

const RAILWAY_INTERNAL_VARS = /^RAILWAY_/i

const DATABASE_IMAGES: Record<string, string> = {
  postgres: 'postgres',
  postgis: 'postgres',
  mysql: 'mysql',
  mariadb: 'mariadb',
  mongo: 'mongo',
  redis: 'redis',
  clickhouse: 'clickhouse',
  rabbitmq: 'rabbitmq',
}

type RailwayService = {
  id: string
  name: string
  source?: { image?: string | null; repo?: string | null }
  domains: string[]
  targetPort?: number | null
}

type RailwayProject = {
  id: string
  name: string
  services: RailwayService[]
  environmentId: string
}

const arg = (name: string, fallback?: string) => {
  const hit = process.argv.find(a => a === `--${name}`)
  if (hit) {
    const i = process.argv.indexOf(hit)
    return process.argv[i + 1]
  }
  const eq = process.argv.find(a => a.startsWith(`--${name}=`))
  return eq ? eq.split('=').slice(1).join('=') : fallback
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`)

const required = (name: string) => {
  const v = arg(name)
  if (!v) {
    console.error(`Missing required --${name}`)
    process.exit(1)
  }
  return v
}

async function railwayQuery<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Railway API ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(`Railway: ${json.errors[0].message}`)
  return json.data as T
}

async function fetchRailwayProject(token: string, projectRef: string, envName: string): Promise<RailwayProject> {
  // Resolve a name into an id when needed
  let projectId = projectRef
  if (!projectRef.includes('-')) {
    const data = await railwayQuery<{
      me: { projects: { edges: { node: { id: string; name: string } }[] } }
    }>(token, `query { me { projects { edges { node { id name } } } } }`, {})
    const match = data.me.projects.edges.find(
      e => e.node.name.toLowerCase() === projectRef.toLowerCase(),
    )
    if (!match) throw new Error(`Railway project "${projectRef}" not found`)
    projectId = match.node.id
  }

  const data = await railwayQuery<{
    project: {
      id: string
      name: string
      services: { edges: { node: { id: string; name: string } }[] }
      environments: { edges: { node: { id: string; name: string } }[] }
    }
  }>(
    token,
    `query ($id: String!) {
      project(id: $id) {
        id name
        services { edges { node { id name } } }
        environments { edges { node { id name } } }
      }
    }`,
    { id: projectId },
  )

  const env = data.project.environments.edges.find(
    e => e.node.name.toLowerCase() === envName.toLowerCase(),
  ) ?? data.project.environments.edges[0]
  if (!env) throw new Error('No environments on Railway project')

  const services: RailwayService[] = []
  for (const { node } of data.project.services.edges) {
    let svc: RailwayService = { id: node.id, name: node.name, domains: [] }
    try {
      const detail = await railwayQuery<{
        serviceInstance: {
          source?: { image?: string | null; repo?: string | null }
          domains?: {
            serviceDomains?: { domain: string }[]
            customDomains?: { domain: string }[]
          }
          networking?: {
            serviceDomains?: { targetPort?: number | null }[]
          }
        } | null
      }>(
        token,
        `query ($serviceId: String!, $environmentId: String!) {
          serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
            source { image repo }
            domains { serviceDomains { domain } customDomains { domain } }
            networking { serviceDomains { targetPort } }
          }
        }`,
        { serviceId: node.id, environmentId: env.node.id },
      )
      if (detail.serviceInstance) {
        svc.source = detail.serviceInstance.source ?? undefined
        svc.domains = [
          ...(detail.serviceInstance.domains?.serviceDomains ?? []),
          ...(detail.serviceInstance.domains?.customDomains ?? []),
        ].map(d => d.domain)
        svc.targetPort =
          detail.serviceInstance.networking?.serviceDomains?.[0]?.targetPort ??
          null
      }
    } catch (err) {
      console.warn(`  warn: could not fetch source/domains for ${node.name}: ${(err as Error).message}`)
    }
    services.push(svc)
  }

  return {
    id: data.project.id,
    name: data.project.name,
    services,
    environmentId: env.node.id,
  }
}

async function fetchRailwayVariables(
  token: string,
  projectId: string,
  environmentId: string,
  serviceId: string,
): Promise<Record<string, string>> {
  try {
    const data = await railwayQuery<{ variables: Record<string, string> }>(
      token,
      `query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
        variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
      }`,
      { projectId, environmentId, serviceId },
    )
    return Object.fromEntries(
      Object.entries(data.variables ?? {}).filter(
        ([k]) => !RAILWAY_INTERNAL_VARS.test(k),
      ),
    )
  } catch (err) {
    console.warn(`  warn: variables fetch failed for service ${serviceId}: ${(err as Error).message}`)
    return {}
  }
}

class DflowClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // Payload API-key auth: "<collection> API-Key <key>"
        Authorization: `users API-Key ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      throw new Error(`dFlow ${method} ${path} -> ${res.status}: ${await res.text()}`)
    }
    return (await res.json()) as T
  }

  async resolveTenantId(slug: string): Promise<string> {
    const data = await this.request<{ docs: { id: string }[] }>(
      'GET',
      `/tenants?where[slug][equals]=${encodeURIComponent(slug)}&limit=1`,
    )
    if (!data.docs.length) throw new Error(`Tenant "${slug}" not found on target`)
    return data.docs[0].id
  }

  async createProject(input: { name: string; server: string; tenant: string; description?: string }) {
    return this.request<{ doc: { id: string } }>('POST', '/projects', input)
  }

  async createService(input: Record<string, unknown>) {
    return this.request<{ doc: { id: string; name: string } }>('POST', '/services', input)
  }
}

function mapService(
  svc: RailwayService,
  vars: Record<string, string>,
  projectId: string,
  tenantId: string,
): { doc: Record<string, unknown>; needsManualDb: boolean } {
  const variables = Object.entries(vars).map(([key, value]) => ({ key, value }))
  const domains = svc.domains.map((domain, i) => ({
    domain,
    default: i === 0,
    synced: false,
    autoRegenerateSSL: false,
    certificateType: 'none',
  }))

  const image = svc.source?.image?.toLowerCase() ?? ''
  const dbMatch = Object.keys(DATABASE_IMAGES).find(k => image.includes(k))

  const base = {
    name: svc.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    project: projectId,
    tenant: tenantId,
    variables,
    domains,
  }

  if (dbMatch) {
    return {
      needsManualDb: true,
      doc: {
        ...base,
        type: 'database',
        databaseDetails: { type: DATABASE_IMAGES[dbMatch] },
      },
    }
  }

  if (svc.source?.image) {
    return {
      needsManualDb: false,
      doc: {
        ...base,
        type: 'docker',
        dockerDetails: {
          url: svc.source.image,
          // dokku needs at least one mapped port for web traffic; Railway's
          // first domain targetPort is the best hint, else 3000.
          ports: [
            {
              hostPort: svc.targetPort ?? 3000,
              containerPort: svc.targetPort ?? 3000,
              scheme: 'http',
            },
          ],
        },
      },
    }
  }

  // Git-source services → app type. repository/owner are split from the
  // "owner/repo" Railway value; gitToken stays empty (attach in the UI).
  const repo = svc.source?.repo ?? ''
  const [owner = '', ...rest] = repo.split('/')
  return {
    needsManualDb: false,
    doc: {
      ...base,
      type: 'app',
      githubSettings: {
        owner,
        repository: rest.join('/'),
        branch: 'main',
        buildPath: '/',
        port: svc.targetPort ?? 3000,
      },
    },
  }
}

async function main() {
  const dryRun = hasFlag('dry-run')
  const railwayToken = required('railway-token')
  const projectRef = required('project')
  const environment = arg('environment', 'production')!
  const dflowUrl = required('dflow-url').replace(/\/$/, '')
  const apiKey = required('api-key')
  const tenantSlug = required('tenant')
  const serverId = required('server')

  console.log(`Fetching Railway project "${projectRef}" (${environment})...`)
  const project = await fetchRailwayProject(railwayToken, projectRef, environment)
  console.log(`  ${project.services.length} service(s) found`)

  const dflow = new DflowClient(dflowUrl, apiKey)
  const tenantId = await dflow.resolveTenantId(tenantSlug)
  console.log(`Target tenant "${tenantSlug}" -> ${tenantId}`)

  if (dryRun) console.log('\n-- dry run, nothing will be written --\n')

  const summary: string[] = []
  let projectId = ''

  if (!dryRun) {
    const created = await dflow.createProject({
      name: project.name,
      server: serverId,
      tenant: tenantId,
      description: `Migrated from Railway project ${project.id}`,
    })
    projectId = created.doc.id
    console.log(`Created dFlow project "${project.name}" (${projectId})`)
  } else {
    console.log(`Would create project "${project.name}" on server ${serverId}`)
  }

  for (const svc of project.services) {
    const vars = await fetchRailwayVariables(
      railwayToken,
      project.id,
      project.environmentId,
      svc.id,
    )
    const { doc, needsManualDb } = mapService(svc, vars, projectId, tenantId)
    const label = `[${(doc as { type: string }).type}] ${svc.name}`

    if (dryRun) {
      console.log(`  would create ${label} — ${svc.domains.length} domain(s), ${doc.variables ? (doc.variables as unknown[]).length : 0} var(s)${needsManualDb ? ' (needs manual db provision)' : ''}`)
      continue
    }

    try {
      const created = await dflow.createService(doc)
      console.log(`  created ${label} (${created.doc.id})`)
      if (needsManualDb) {
        summary.push(`${svc.name}: database record created — provision it from the service page (dokku db:create) before linking`)
      }
      if (svc.domains.length) {
        summary.push(`${svc.name}: ${svc.domains.length} domain(s) imported unsynced — point DNS at the server, then sync domains`)
      }
    } catch (err) {
      console.error(`  FAILED ${label}: ${(err as Error).message}`)
      summary.push(`${svc.name}: FAILED — ${(err as Error).message}`)
    }
  }

  console.log('\n--- Migration summary ---')
  if (summary.length) summary.forEach(s => console.log(`  • ${s}`))
  console.log('  • Railway volumes/disks are not migrated — dump and restore data manually.')
  console.log('  • App services deploy on first git push / docker deploy from dFlow.')
  console.log('Done.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
