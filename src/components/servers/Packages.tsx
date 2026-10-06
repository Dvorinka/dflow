'use client'

import Loader from '../Loader'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { useAction } from 'next-safe-action/hooks'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { updateDokkuAction, updateRailpackAction } from '@/actions/server'
import updateRailpack from '@/lib/axios/updateRailpack'
import { isVersionNewer } from '@/lib/version'
import { packageVersions } from '@/lib/packageVersions'
import { ServerType } from '@/payload-types-overrides'

const Packages = ({
  railpack,
  dokkuVersion,
  serverId,
}: {
  railpack: ServerType['railpack']
  dokkuVersion: ServerType['version']
  serverId: ServerType['id']
}) => {
  const [latestVersion, setLatestVersion] = useState<string>('')

  useEffect(() => {
    const fetchLatestVersion = async () => {
      const latestVersion = await updateRailpack()
      setLatestVersion(latestVersion)
    }

    fetchLatestVersion()
  }, [])

  const { execute: updateRailpackExecution, isPending: isUpdating } = useAction(
    updateRailpackAction,
    {
      onSuccess: data => {
        if (data.data?.success) {
          toast.success(data.data.message)
        } else {
          toast.info(data.data?.message)
        }
      },
      onError: error => {
        toast.error(error.error.serverError)
      },
    },
  )

  const { execute: updateDokkuExecution, isPending: isUpdatingDokku } =
    useAction(updateDokkuAction, {
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success(data.message ?? 'Dokku update queued')
        } else {
          toast.info(data?.message ?? 'Dokku update not queued')
        }
      },
      onError: ({ error }) => {
        toast.error(`Failed to update dokku: ${error.serverError}`)
      },
    })

  const dokkuBehind =
    !!dokkuVersion &&
    dokkuVersion !== 'not-installed' &&
    isVersionNewer(packageVersions.dokku, dokkuVersion)

  return (
    <Card>
      <CardHeader>
        <CardTitle className='font-medium'>Update Packages</CardTitle>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='flex items-center justify-between'>
          <div className='flex items-start gap-1.5'>
            <div className='flex h-8 w-8 items-center justify-center rounded-md bg-muted text-lg font-bold'>
              D
            </div>
            <div className='flex flex-col gap-0.5'>
              <div className='text-lg font-semibold'>
                Dokku
                {dokkuVersion && (
                  <span className='text-xs text-muted-foreground'>
                    installed: {dokkuVersion} | recommended:{' '}
                    {packageVersions.dokku}
                  </span>
                )}
              </div>
              <p className='text-sm text-muted-foreground'>
                Re-runs the installer at the recommended version to update in
                place.
              </p>
            </div>
          </div>

          <Button
            variant='outline'
            disabled={isUpdatingDokku || !dokkuBehind}
            isLoading={isUpdatingDokku}
            onClick={() => updateDokkuExecution({ serverId })}>
            {isUpdatingDokku
              ? 'Updating...'
              : dokkuBehind
                ? 'Update to recommended'
                : 'Up to date'}
          </Button>
        </div>

        <div className='flex items-center justify-between'>
          <div className='flex items-start gap-1.5'>
            <Image
              src={'/images/railpack.png'}
              alt='Railpack'
              width={32}
              height={32}
            />
            <div className='flex flex-col gap-0.5'>
              <div className='text-lg font-semibold'>
                Railpack
                {railpack && (
                  <span className='text-xs text-muted-foreground'>
                    installed: {railpack}
                    {latestVersion ? ` | recommended: ${latestVersion}` : ''}
                  </span>
                )}
              </div>
              <p className='text-sm text-muted-foreground'>
                This is the version of Railpack installed on your server.
              </p>
            </div>
          </div>

          <Button
            variant='outline'
            disabled={
              isUpdating ||
              !railpack ||
              !latestVersion ||
              !isVersionNewer(latestVersion, railpack)
            }
            onClick={() =>
              railpack &&
              updateRailpackExecution({ serverId, railpackVersion: railpack })
            }>
            {isUpdating ? (
              <Loader className='h-4 w-4' />
            ) : !latestVersion ? (
              'Checking...'
            ) : railpack && isVersionNewer(latestVersion, railpack) ? (
              `Update to recommended`
            ) : (
              'Up to date'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default Packages
