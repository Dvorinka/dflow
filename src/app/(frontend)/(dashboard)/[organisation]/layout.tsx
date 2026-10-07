import Link from 'next/link'
import { redirect } from 'next/navigation'
import React, { Suspense } from 'react'

import { getGithubStarsAction } from '@/actions/github'
import Banner from '@/components/Banner'
import CommandPalette from '@/components/CommandPalette'
import DocSidebar from '@/components/DocSidebar'
import GithubStars from '@/components/GithubStars'
import Logo from '@/components/Logo'
import ToggleTheme from '@/components/ToggleTheme'
import Bubble from '@/components/bubble'
import { NavUser } from '@/components/nav-user'
import { NavUserSkeleton } from '@/components/skeletons/DashboardLayoutSkeleton'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import BubbleProvider from '@/providers/BubbleProvider'
import Provider from '@/providers/Provider'
import TerminalProvider from '@/providers/TerminalProvider'

interface PageProps {
  params: Promise<{
    organisation: string
  }>
  children: React.ReactNode
}

const NavUserSuspended = async () => {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/sign-in')
  }

  return <NavUser user={user} />
}

const DashboardLayoutInner = async ({
  params,
}: {
  params: PageProps['params']
}) => {
  const result = await getGithubStarsAction()
  const organisationSlug = (await params).organisation

  return (
    <div className='bg-background sticky top-0 z-50 w-full'>
      <div className='mx-auto flex w-full max-w-6xl items-center justify-between p-4'>
        <div className='flex min-h-9 items-center gap-2 text-2xl font-semibold'>
          <Link
            href={`/${organisationSlug}/dashboard`}
            className='flex items-center gap-1'>
            <Logo showText />
          </Link>

          {/* Breadcrumb placeholders */}
          <div id='projectName' />
          <div id='serviceName' className='-ml-2' />
          <div id='serverName' className='-ml-4' />
        </div>

        <div className='flex items-center gap-x-4'>
          <CommandPalette />

          <GithubStars githubStars={result?.data?.stars} />

          <ToggleTheme />

          <Suspense fallback={<NavUserSkeleton />}>
            <NavUserSuspended />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default async function OrganisationLayout({
  children,
  params,
}: PageProps) {
  return (
    <Provider>
      <TerminalProvider>
        <BubbleProvider>
          <Banner />
          <div className='relative flex h-screen w-full flex-col overflow-hidden'>
            {/* Main content area - will shrink when terminal is embedded */}
            <div
              id='main-content'
              className='flex flex-1 overflow-hidden transition-all duration-300'>
              <div className='flex-1 overflow-y-auto'>
                <DashboardLayoutInner params={params} />
                {children}
              </div>
              <DocSidebar />
            </div>

            {/* Terminal container - will be positioned at bottom */}
            <div id='embedded-terminal-container' />
          </div>
          <Bubble />
        </BubbleProvider>
      </TerminalProvider>
    </Provider>
  )
}
