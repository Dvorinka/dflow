'use client'

import { Boxes, ChevronDown, Loader2, Plus } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  createEnvironmentAction,
  getEnvironmentsAction,
} from '@/actions/environment'
import { getServersWithFieldsAction } from '@/actions/server'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/check-box'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Env = {
  id: string
  name: string
  projectName: string
  isRoot: boolean
  server: { id: string; name: string } | null
}

const EnvironmentSwitcher = ({
  projectId,
  organisationSlug,
}: {
  projectId: string
  organisationSlug: string
}) => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [envs, setEnvs] = useState<Env[]>([])
  const [name, setName] = useState('')
  const [serverId, setServerId] = useState('')
  const [copyFromId, setCopyFromId] = useState('')
  const [cloneData, setCloneData] = useState(false)
  const [servers, setServers] = useState<{ id: string; name: string }[]>([])

  const { execute: load } = useAction(getEnvironmentsAction, {
    onSuccess: ({ data }) => data && setEnvs(data.environments),
  })

  const { execute: loadServers } = useAction(getServersWithFieldsAction, {
    onSuccess: ({ data }) =>
      data && setServers(data as { id: string; name: string }[]),
  })

  const { execute: create, isPending } = useAction(createEnvironmentAction, {
    onSuccess: ({ data }) => {
      if (!data?.environment) return
      if (data.warnings?.length) {
        data.warnings.forEach(w => toast.warning(w))
      }
      toast.success(`Environment "${data.environment.name}" created`)
      setOpen(false)
      setName('')
      setCopyFromId('')
      setCloneData(false)
      router.push(
        `/${organisationSlug}/dashboard/project/${data.environment.id}`,
      )
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Failed to create environment')
    },
  })

  useEffect(() => {
    load({ projectId })
  }, [projectId])

  const current = envs.find(e => e.id === projectId)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground -ml-1 h-7 gap-1 px-2 font-normal'>
            <Boxes className='h-3.5 w-3.5' />
            {current?.name ?? 'production'}
            <ChevronDown className='h-3.5 w-3.5 opacity-60' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-56'>
          <DropdownMenuLabel>Environments</DropdownMenuLabel>
          {envs.map(env => (
            <DropdownMenuItem
              key={env.id}
              onSelect={() =>
                router.push(
                  `/${organisationSlug}/dashboard/project/${env.id}`,
                )
              }>
              <span className='flex-1 truncate'>{env.name}</span>
              {env.server && (
                <span className='text-muted-foreground ml-2 truncate text-xs'>
                  {env.server.name}
                </span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              loadServers({ fields: { name: true } })
              setOpen(true)
            }}>
            <Plus className='mr-2 h-3.5 w-3.5' />
            New environment
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New environment</DialogTitle>
            <DialogDescription>
              Create an isolated environment for this project. Optionally clone
              services — including database contents — from an existing
              environment.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4'>
            <div className='space-y-1.5'>
              <Label htmlFor='env-name'>Name</Label>
              <Input
                id='env-name'
                placeholder='staging'
                value={name}
                onChange={e => setName(e.target.value.toLowerCase())}
              />
            </div>

            <div className='space-y-1.5'>
              <Label>Server</Label>
              <Select value={serverId} onValueChange={setServerId}>
                <SelectTrigger>
                  <SelectValue placeholder='Same as production' />
                </SelectTrigger>
                <SelectContent>
                  {servers.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-1.5'>
              <Label>Copy services from</Label>
              <Select value={copyFromId} onValueChange={setCopyFromId}>
                <SelectTrigger>
                  <SelectValue placeholder='Empty environment' />
                </SelectTrigger>
                <SelectContent>
                  {envs.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {copyFromId && (
              <label className='flex items-center gap-2 text-sm'>
                <Checkbox
                  checked={cloneData}
                  onCheckedChange={v => setCloneData(v === true)}
                />
                Copy database contents (runs in the background)
              </label>
            )}
          </div>

          <DialogFooter>
            <Button
              disabled={!name.trim() || isPending}
              onClick={() =>
                create({
                  projectId,
                  name: name.trim(),
                  ...(serverId ? { serverId } : {}),
                  ...(copyFromId ? { copyFromProjectId: copyFromId } : {}),
                  cloneData,
                })
              }>
              {isPending && (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              )}
              Create environment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default EnvironmentSwitcher
