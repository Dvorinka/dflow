import { Brush } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useParams } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { cleanupServerAction, setServerAutoCleanupAction } from '@/actions/server'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/check-box'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const AGE_OPTIONS = [
  { label: 'Older than 24 hours', value: 24 },
  { label: 'Older than 7 days', value: 168 },
  { label: 'Older than 30 days', value: 720 },
]

const CleanupServerDialog = ({
  children,
  initialAutoCleanup = false,
}: {
  children: ReactNode
  initialAutoCleanup?: boolean
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [olderThanHours, setOlderThanHours] = useState<number>(168)
  const [pruneVolumes, setPruneVolumes] = useState<boolean>(false)
  const [repeatDaily, setRepeatDaily] = useState<boolean>(initialAutoCleanup)
  const params = useParams<{ serverId: string }>()
  const { execute, isPending } = useAction(cleanupServerAction, {
    onSuccess: ({ data }) => {
      if (data?.success) {
        setIsOpen(false)
        toast.info('Server cleanup queued', {
          description: 'This may take a few minutes, check server logs',
          duration: 8000,
        })
      }
    },
    onError: ({ error }) => {
      toast.error(`Failed to queue server cleanup: ${error.serverError}`)
    },
  })
  const { execute: saveAutoCleanup, isPending: isSaving } = useAction(
    setServerAutoCleanupAction,
    {
      onError: ({ error }) => {
        toast.error(`Failed to save schedule: ${error.serverError}`)
      },
    },
  )

  const busy = isPending || isSaving

  const handleRun = () => {
    // Persist the schedule first so automatic runs reuse these settings
    saveAutoCleanup({
      serverId: params.serverId,
      enabled: repeatDaily,
      olderThanHours,
      pruneVolumes,
    })
    execute({
      serverId: params.serverId,
      olderThanHours,
      pruneVolumes,
      dokkuCleanup: true,
    })
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={state => {
        if (busy) return
        setIsOpen(state)
      }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Brush className='h-5 w-5' />
            Cleanup Server
          </DialogTitle>
          <DialogDescription>
            Runs dokku cleanup and prunes unused Docker objects. Only items
            older than the selected age are removed.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1'>
            <span className='text-sm font-medium'>Remove items older than</span>
            <Select
              value={String(olderThanHours)}
              onValueChange={v => setOlderThanHours(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='flex items-start space-x-3'>
            <Checkbox
              id='prune-volumes'
              checked={pruneVolumes}
              onCheckedChange={checked => setPruneVolumes(Boolean(checked))}
              className='mt-0.5'
            />
            <div className='space-y-1'>
              <label
                htmlFor='prune-volumes'
                className='cursor-pointer text-sm leading-none font-medium'>
                Include unused volumes
              </label>
              <p className='text-muted-foreground text-xs'>
                Volumes may hold data. Only unused volumes older than the
                selected age are removed.
              </p>
            </div>
          </div>
          <div className='flex items-start space-x-3'>
            <Checkbox
              id='repeat-cleanup'
              checked={repeatDaily}
              onCheckedChange={checked => setRepeatDaily(Boolean(checked))}
              className='mt-0.5'
            />
            <div className='space-y-1'>
              <label
                htmlFor='repeat-cleanup'
                className='cursor-pointer text-sm leading-none font-medium'>
                Repeat automatically every day
              </label>
              <p className='text-muted-foreground text-xs'>
                Runs daily at 04:00 with these settings. Uncheck to run once.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant='secondary' disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button disabled={busy} isLoading={busy} onClick={handleRun}>
            Run Cleanup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CleanupServerDialog
