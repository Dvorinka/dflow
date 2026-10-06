'use client'

import { Construction, LockKeyhole } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  getMaintenanceStatusAction,
  toggleHttpAuthAction,
  toggleMaintenanceAction,
} from '@/actions/service'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Service } from '@/payload-types'

// Maintenance mode + HTTP basic auth for app services (#425)
const AppAccessControls = ({ service }: { service: Service }) => {
  const [maintenance, setMaintenance] = useState<boolean | null>(null)
  const [httpUser, setHttpUser] = useState('')
  const [httpPass, setHttpPass] = useState('')
  const [httpEnabled, setHttpEnabled] = useState(false)

  const { execute: fetchStatus } = useAction(getMaintenanceStatusAction, {
    onSuccess: ({ data }) => {
      if (data?.success) setMaintenance(data.enabled)
    },
  })

  useEffect(() => {
    if (service.type === 'app' || service.type === 'docker') {
      fetchStatus({ id: service.id })
    }
  }, [service.id, service.type, fetchStatus])

  const { execute: toggleMaintenance, isPending: isTogglingMaintenance } =
    useAction(toggleMaintenanceAction, {
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('Maintenance mode updated')
          fetchStatus({ id: service.id })
        }
      },
      onError: ({ error }) => {
        toast.error(`Failed to update maintenance mode: ${error.serverError}`)
      },
    })

  const { execute: toggleHttpAuth, isPending: isTogglingHttpAuth } = useAction(
    toggleHttpAuthAction,
    {
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('HTTP auth updated')
          if (!httpEnabled) {
            setHttpUser('')
            setHttpPass('')
          }
          setHttpEnabled(!httpEnabled)
        }
      },
      onError: ({ error }) => {
        toast.error(`Failed to update HTTP auth: ${error.serverError}`)
      },
    },
  )

  if (service.type !== 'app' && service.type !== 'docker') return null

  return (
    <Card>
      <CardContent className='space-y-4 pt-6'>
        <div className='flex items-center justify-between'>
          <div className='flex items-start gap-3'>
            <div className='bg-muted flex h-10 w-10 items-center justify-center rounded-md'>
              <Construction className='text-muted-foreground h-5 w-5' />
            </div>
            <div className='flex-1'>
              <h3 className='font-semibold'>Maintenance Mode</h3>
              <p className='text-muted-foreground text-sm'>
                Serve a maintenance page for all requests
              </p>
            </div>
          </div>
          <Switch
            checked={maintenance ?? false}
            disabled={maintenance === null || isTogglingMaintenance}
            onCheckedChange={enabled =>
              toggleMaintenance({ id: service.id, enabled })
            }
          />
        </div>

        <div className='flex items-center justify-between gap-3'>
          <div className='flex items-start gap-3'>
            <div className='bg-muted flex h-10 w-10 items-center justify-center rounded-md'>
              <LockKeyhole className='text-muted-foreground h-5 w-5' />
            </div>
            <div className='flex-1'>
              <h3 className='font-semibold'>HTTP Basic Auth</h3>
              <p className='text-muted-foreground text-sm'>
                Protect the app with a username and password
              </p>
            </div>
          </div>
          {httpEnabled ? (
            <Button
              variant='outline'
              disabled={isTogglingHttpAuth}
              isLoading={isTogglingHttpAuth}
              onClick={() =>
                toggleHttpAuth({ id: service.id, enabled: false })
              }>
              Disable
            </Button>
          ) : (
            <div className='flex gap-2'>
              <Input
                value={httpUser}
                onChange={e => setHttpUser(e.target.value)}
                placeholder='Username'
                className='w-32'
              />
              <Input
                value={httpPass}
                onChange={e => setHttpPass(e.target.value)}
                placeholder='Password'
                type='password'
                className='w-32'
              />
              <Button
                variant='secondary'
                disabled={
                  isTogglingHttpAuth || !httpUser.trim() || !httpPass
                }
                isLoading={isTogglingHttpAuth}
                onClick={() =>
                  toggleHttpAuth({
                    id: service.id,
                    enabled: true,
                    username: httpUser.trim(),
                    password: httpPass,
                  })
                }>
                Enable
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default AppAccessControls
