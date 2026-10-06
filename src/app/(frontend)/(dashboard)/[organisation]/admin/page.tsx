import {
  Database,
  FolderGit2,
  Layers,
  Server as ServerIcon,
  Users,
  UserPlus,
  History,
  CircleX,
  DatabaseBackup,
} from 'lucide-react'
import { Suspense } from 'react'

import { getAdminMetricsAction } from '@/actions/admin'
import AccessDeniedAlert from '@/components/AccessDeniedAlert'
import { Card, CardContent } from '@/components/ui/card'
import { DashboardSkeleton } from '@/components/skeletons/DashboardSkeletons'

import LayoutClient from '../layout.client'

const Metrics = async () => {
  const result = await getAdminMetricsAction({})

  if (result?.serverError) {
    return <AccessDeniedAlert error={result.serverError} />
  }

  const metrics = result?.data
  if (!metrics) return null

  const cards = [
    { label: 'Total Users', value: metrics.users, icon: Users },
    { label: 'New Users (30d)', value: metrics.newUsers, icon: UserPlus },
    { label: 'Servers', value: metrics.servers, icon: ServerIcon },
    { label: 'Projects', value: metrics.projects, icon: FolderGit2 },
    { label: 'Services', value: metrics.services, icon: Layers },
    { label: 'Databases', value: metrics.databases, icon: Database },
    {
      label: 'Queued Deployments',
      value: metrics.queuedDeployments,
      icon: History,
    },
    {
      label: 'Failed Deployments',
      value: metrics.failedDeployments,
      icon: CircleX,
    },
    { label: 'Backups', value: metrics.backups, icon: DatabaseBackup },
  ]

  return (
    <div className='grid grid-cols-2 gap-3 lg:grid-cols-3'>
      {cards.map(({ label, value, icon: Icon }) => (
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

const AdminPage = () => {
  return (
    <LayoutClient>
      <section className='space-y-6'>
        <h2 className='text-2xl font-semibold tracking-tight'>
          Platform Metrics
        </h2>
        <Suspense fallback={<DashboardSkeleton />}>
          <Metrics />
        </Suspense>
      </section>
    </LayoutClient>
  )
}

export default AdminPage
