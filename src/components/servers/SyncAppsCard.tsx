'use client'

import { ArrowLeftRight, RefreshCw } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'

import { syncServerAppsAction } from '@/actions/server'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Read-only drift report between dokku apps and dFlow services (#417)
const SyncAppsCard = ({ serverId }: { serverId: string }) => {
  const { execute, result, isPending } = useAction(syncServerAppsAction, {
    onError: ({ error }) => {
      toast.error(`Failed to sync apps: ${error.serverError}`)
    },
  })

  const data = result?.data
  const missingInDflow = data?.missingInDflow ?? []
  const missingOnServer = data?.missingOnServer ?? []
  const inSync =
    data?.success && !missingInDflow.length && !missingOnServer.length

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between pb-4'>
        <CardTitle className='flex items-center gap-2 text-base font-medium'>
          <ArrowLeftRight className='h-4 w-4' />
          Dokku Sync
        </CardTitle>
        <Button
          variant='outline'
          size='sm'
          disabled={isPending}
          isLoading={isPending}
          onClick={() => execute({ serverId })}>
          {!isPending && <RefreshCw className='h-4 w-4' />}
          Sync
        </Button>
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className='text-muted-foreground text-sm'>
            Compare dokku apps on this server with dFlow services to spot
            drift.
          </p>
        ) : inSync ? (
          <Alert variant='default'>
            <AlertTitle>In sync</AlertTitle>
            <AlertDescription>
              All {data.dokkuApps.length} dokku app(s) match dFlow services.
            </AlertDescription>
          </Alert>
        ) : (
          <div className='space-y-3'>
            {missingInDflow.length > 0 && (
              <div className='space-y-1'>
                <p className='text-sm font-medium'>
                  On server, missing in dFlow
                </p>
                <div className='flex flex-wrap gap-1'>
                  {missingInDflow.map(name => (
                    <Badge key={name} variant='warning'>
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {missingOnServer.length > 0 && (
              <div className='space-y-1'>
                <p className='text-sm font-medium'>
                  In dFlow, missing on server
                </p>
                <div className='flex flex-wrap gap-1'>
                  {missingOnServer.map(name => (
                    <Badge key={name} variant='destructive'>
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default SyncAppsCard
