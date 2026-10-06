'use client'

import { HardDrive, RefreshCw, Trash2 } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  attachDanglingVolumeAction,
  deleteDanglingVolumeAction,
  getDanglingVolumesAction,
} from '@/actions/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type DanglingVolume = { name: string; path: string; size: string | null }
type VolumeService = { id: string; name: string }

// Scan for storage left behind by deleted apps, delete it, or attach it to
// another service (#492)
const DanglingVolumesCard = ({ serverId }: { serverId: string }) => {
  const [attachTarget, setAttachTarget] = useState<DanglingVolume | null>(null)
  const [serviceId, setServiceId] = useState<string>('')
  const [containerPath, setContainerPath] = useState<string>('')

  const { execute: scan, result, isPending } = useAction(
    getDanglingVolumesAction,
    {
      onError: ({ error }) => {
        toast.error(`Failed to scan volumes: ${error.serverError}`)
      },
    },
  )
  const { execute: remove, isPending: isDeleting } = useAction(
    deleteDanglingVolumeAction,
    {
      onSuccess: () => {
        toast.success('Volume deleted')
        scan({ serverId })
      },
      onError: ({ error }) => {
        toast.error(`Failed to delete volume: ${error.serverError}`)
      },
    },
  )
  const { execute: attach, isPending: isAttaching } = useAction(
    attachDanglingVolumeAction,
    {
      onSuccess: () => {
        toast.success('Volume attached, remount queued')
        setAttachTarget(null)
        setServiceId('')
        setContainerPath('')
        scan({ serverId })
      },
      onError: ({ error }) => {
        toast.error(`Failed to attach volume: ${error.serverError}`)
      },
    },
  )

  const data = result?.data
  const volumes = (data?.volumes ?? []) as DanglingVolume[]
  const services = (data?.services ?? []) as VolumeService[]
  const scanned = !!data?.success

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between pb-4'>
        <CardTitle className='flex items-center gap-2 text-base font-medium'>
          <HardDrive className='h-4 w-4' />
          Dangling Volumes
        </CardTitle>
        <Button
          variant='outline'
          size='sm'
          disabled={isPending}
          isLoading={isPending}
          onClick={() => scan({ serverId })}>
          {!isPending && <RefreshCw className='h-4 w-4' />}
          Scan
        </Button>
      </CardHeader>
      <CardContent>
        {!scanned ? (
          <p className='text-muted-foreground text-sm'>
            Find storage left behind by deleted apps. Attach a volume to
            another service or delete it permanently.
          </p>
        ) : !volumes.length ? (
          <p className='text-muted-foreground text-sm'>
            No dangling volumes found.
          </p>
        ) : (
          <ul className='space-y-2'>
            {volumes.map(volume => (
              <li
                key={volume.name}
                className='flex items-center justify-between gap-2 rounded-md border p-3 text-sm'>
                <div className='min-w-0'>
                  <p className='truncate font-medium'>{volume.name}</p>
                  <p className='text-muted-foreground text-xs'>
                    {volume.path}
                    {volume.size ? ` — ${volume.size}` : ''}
                  </p>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  <Badge variant='warning'>dangling</Badge>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      setAttachTarget(volume)
                      setServiceId('')
                      setContainerPath('')
                    }}>
                    Attach
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-destructive h-8 w-8 p-0'
                    disabled={isDeleting}
                    onClick={() => remove({ serverId, name: volume.name })}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={!!attachTarget}
        onOpenChange={state => {
          if (!state) setAttachTarget(null)
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach {attachTarget?.name}</DialogTitle>
            <DialogDescription>
              Mount this storage into another service on this server.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-1'>
              <span className='text-sm font-medium'>Service</span>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger>
                  <SelectValue placeholder='Select a service' />
                </SelectTrigger>
                <SelectContent>
                  {services.map(service => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1'>
              <span className='text-sm font-medium'>Container path</span>
              <Input
                value={containerPath}
                onChange={e => setContainerPath(e.target.value)}
                placeholder='/data'
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!serviceId || !containerPath || isAttaching}
              isLoading={isAttaching}
              onClick={() =>
                attachTarget &&
                attach({
                  serverId,
                  serviceId,
                  name: attachTarget.name,
                  containerPath,
                })
              }>
              Attach volume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default DanglingVolumesCard
