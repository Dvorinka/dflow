'use client'

import AccessDeniedAlert from '../AccessDeniedAlert'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { Link } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { parseAsString, useQueryState } from 'nuqs'
import { useEffect } from 'react'

import { getCloudProvidersAccountsAction } from '@/actions/cloud'
import GithubIntegrationsLoading from '@/components/Integrations/GithubIntegrationsLoading'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { integrationsList } from '@/lib/ui/integrationList'

import CloudProvidersList from './CloudProvidersList'
import HetznerAccountForm from './hetzner/HetznerAccountForm'

const HetznerDrawer = () => {
  const [activeSlide, setActiveSlide] = useQueryState(
    'active',
    parseAsString.withDefault(''),
  )

  const { execute, isPending, result } = useAction(
    getCloudProvidersAccountsAction,
  )

  const integration = integrationsList.find(
    integration => integration.slug === 'hetzner',
  )

  useEffect(() => {
    if (activeSlide === 'hetzner' && !result?.data) {
      execute({ type: 'hetzner' })
    }
  }, [activeSlide, result.data])

  const icon = integration ? (
    <div className='mb-2 flex size-14 items-center justify-center rounded-md border'>
      <div className='relative'>
        <integration.icon className='size-8 blur-lg saturate-200' />
        <integration.icon className='absolute inset-0 size-8' />
      </div>
    </div>
  ) : null

  return (
    <Sheet
      open={activeSlide === 'hetzner'}
      onOpenChange={state => {
        setActiveSlide(state ? 'hetzner' : '')
      }}
    >
      <SheetContent className='flex w-full flex-col justify-between sm:max-w-lg'>
        <SheetHeader className='text-left'>
          <SheetTitle className='flex w-full items-center gap-3 text-base'>
            {icon} Integration Settings
          </SheetTitle>

          <p className='pt-4 font-semibold'>{integration?.label}</p>
          <SheetDescription className='mt-0!'>
            {integration?.description}
          </SheetDescription>
        </SheetHeader>

        {isPending ? (
          <GithubIntegrationsLoading />
        ) : result?.serverError ? (
          <ScrollArea className='grow'>
            <AccessDeniedAlert error={result?.serverError} />
          </ScrollArea>
        ) : result.data ? (
          <ScrollArea className='grow'>
            <CloudProvidersList accounts={result.data} refetch={execute} />
          </ScrollArea>
        ) : null}

        <SheetFooter>
          <HetznerAccountForm refetch={execute}>
            <Button>
              <Link />
              Connect account
            </Button>
          </HetznerAccountForm>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export default HetznerDrawer
