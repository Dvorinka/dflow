import { Database, FolderGit2, Layers, Server as ServerIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Project, Service } from '@/payload-types'
import { ServerType } from '@/payload-types-overrides'

const getProjectServices = (project: Project): Service[] => {
  const services = (project as { services?: unknown }).services
  if (Array.isArray(services)) return services as Service[]
  if (services && typeof services === 'object' && 'docs' in services) {
    return (services as { docs: Service[] }).docs ?? []
  }
  return []
}

// Workspace overview metrics derived from data already on the page (#369)
export const DashboardMetricsStrip = ({
  servers,
  projects,
}: {
  servers: ServerType[]
  projects: Project[]
}) => {
  const connected = servers.filter(
    s => s.connection?.status === 'success',
  ).length
  const services = projects.flatMap(getProjectServices)
  const databases = services.filter(s => s.type === 'database').length

  const metrics = [
    {
      label: 'Servers',
      value: `${connected}/${servers.length} connected`,
      icon: ServerIcon,
    },
    { label: 'Projects', value: String(projects.length), icon: FolderGit2 },
    { label: 'Services', value: String(services.length), icon: Layers },
    { label: 'Databases', value: String(databases), icon: Database },
  ]

  if (!servers.length && !projects.length) return null

  return (
    <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
      {metrics.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardContent className='flex items-center gap-3 py-4'>
            <Icon className='text-muted-foreground h-5 w-5' />
            <div>
              <p className='text-muted-foreground text-xs'>{label}</p>
              <p className='text-lg font-semibold'>{value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
