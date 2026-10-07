'use client'

import LayoutClient from '../layout.client'
import { Link } from 'lucide-react'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

import IntegrationsList from '@/components/Integrations/IntegrationsList'
import { IntegrationsSkeleton } from '@/components/skeletons/IntegrationsSkeleton'

const GitHubDrawer = dynamic(
  () => import('@/components/Integrations/GithubDrawer'),
  {
    ssr: false,
  },
)
const AWSDrawer = dynamic(() => import('@/components/Integrations/AWSDrawer'), {
  ssr: false,
})

const HetznerDrawer = dynamic(
  () => import('@/components/Integrations/HetznerDrawer'),
  { ssr: false },
)

const DockerRegistryDrawer = dynamic(
  () => import('@/components/Integrations/DockerRegistryDrawer'),
  { ssr: false },
)

const SuspendedIntegrationsPage = () => {
  return (
    <>
      <IntegrationsList />

      <GitHubDrawer />
      <AWSDrawer />
      <HetznerDrawer />
      <DockerRegistryDrawer />
    </>
  )
}

const IntegrationsPage = () => {
  return (
    <LayoutClient>
      <section>
        <div className='inline-flex items-center gap-2 text-2xl font-semibold'>
          <Link />
          <h3>Integrations</h3>
        </div>

        <Suspense fallback={<IntegrationsSkeleton />}>
          <SuspendedIntegrationsPage />
        </Suspense>
      </section>
    </LayoutClient>
  )
}

export default IntegrationsPage
