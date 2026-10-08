'use client'

import {
  CircleCheckBig,
  CircleX,
  Clock,
  ListTodo,
  Loader,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  createPlaybookAction,
  deletePlaybookAction,
  getAnsibleExecutionsAction,
  getPlaybooksAction,
  runAnsiblePlaybookAction,
} from '@/actions/ansible'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { AnsibleExecution, AnsiblePlaybook } from '@/payload-types'

const statusBadge = (status?: string | null) => {
  switch (status) {
    case 'success':
      return (
        <Badge variant='success' className='gap-1 text-xs [&_svg]:size-3'>
          <CircleCheckBig /> Success
        </Badge>
      )
    case 'failed':
      return (
        <Badge variant='destructive' className='gap-1 text-xs [&_svg]:size-3'>
          <CircleX /> Failed
        </Badge>
      )
    case 'running':
      return (
        <Badge variant='info' className='gap-1 text-xs [&_svg]:size-3'>
          <Loader className='animate-spin' /> Running
        </Badge>
      )
    default:
      return (
        <Badge variant='secondary' className='gap-1 text-xs [&_svg]:size-3'>
          <Clock /> Queued
        </Badge>
      )
  }
}

const AnsiblePlaybooksCard = ({ serverId }: { serverId: string }) => {
  const [playbooks, setPlaybooks] = useState<AnsiblePlaybook[]>([])
  const [executions, setExecutions] = useState<AnsibleExecution[]>([])
  const [selected, setSelected] = useState<string>('')
  const [name, setName] = useState('')
  const [playbookText, setPlaybookText] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { execute: loadPlaybooks } = useAction(getPlaybooksAction, {
    onSuccess: ({ data }) => setPlaybooks(data ?? []),
  })
  const { execute: loadExecutions } = useAction(getAnsibleExecutionsAction, {
    onSuccess: ({ data }) => setExecutions(data ?? []),
  })

  const refresh = () => {
    loadPlaybooks()
    loadExecutions({ serverId })
  }

  useEffect(refresh, [serverId])

  const { execute: run, isPending: running } = useAction(
    runAnsiblePlaybookAction,
    {
      onSuccess: () => {
        toast.info('Playbook queued — output streams to the queue logs')
        setTimeout(refresh, 1500)
      },
      onError: ({ error }) =>
        toast.error(`Run failed: ${error.serverError}`),
    },
  )

  const { execute: create, isPending: creating } = useAction(
    createPlaybookAction,
    {
      onSuccess: () => {
        toast.success('Playbook saved')
        setDialogOpen(false)
        setName('')
        setPlaybookText('')
        refresh()
      },
      onError: ({ error }) =>
        toast.error(`Save failed: ${error.serverError}`),
    },
  )

  const { execute: remove } = useAction(deletePlaybookAction, {
    onSuccess: refresh,
    onError: ({ error }) =>
      toast.error(`Delete failed: ${error.serverError}`),
  })

  return (
    <Card>
      <CardHeader className='pb-4'>
        <CardTitle className='flex items-center justify-between text-base font-medium'>
          <span className='flex items-center gap-2'>
            <ListTodo className='h-4 w-4' />
            Ansible Playbooks
          </span>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size='sm' variant='outline'>
                <Plus className='h-4 w-4' /> New playbook
              </Button>
            </DialogTrigger>
            <DialogContent className='max-w-2xl'>
              <DialogHeader>
                <DialogTitle>New Playbook</DialogTitle>
                <DialogDescription className='sr-only'>
                  Create a reusable Ansible playbook
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-3'>
                <Input
                  placeholder='Playbook name'
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <Textarea
                  placeholder={'- hosts: servers\n  tasks:\n    - name: ...'}
                  value={playbookText}
                  onChange={e => setPlaybookText(e.target.value)}
                  rows={14}
                  className='font-mono text-xs'
                />
                <Button
                  className='w-full'
                  disabled={creating || !name.trim() || !playbookText.trim()}
                  isLoading={creating}
                  onClick={() =>
                    create({ name: name.trim(), playbook: playbookText })
                  }>
                  Save playbook
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <form
          className='flex gap-2'
          onSubmit={e => {
            e.preventDefault()
            if (selected) run({ playbookId: selected, serverId })
          }}>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className='flex-1'>
              <SelectValue placeholder='Select a playbook' />
            </SelectTrigger>
            <SelectContent>
              {playbooks.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type='submit' disabled={running || !selected} isLoading={running}>
            <Play className='h-4 w-4' /> Run
          </Button>
        </form>

        {playbooks.length > 0 && (
          <div className='space-y-1'>
            {playbooks.map(p => (
              <div
                key={p.id}
                className='flex items-center justify-between rounded-md border px-3 py-1.5 text-sm'>
                <span className='truncate'>{p.name}</span>
                <Button
                  size='sm'
                  variant='ghost'
                  className='text-destructive h-7 w-7 p-0'
                  onClick={() => remove({ playbookId: p.id })}>
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}

        {executions.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Playbook</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='text-right'>Output</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map(e => (
                <TableRow key={e.id}>
                  <TableCell className='font-medium'>
                    {typeof e.playbook === 'object' ? e.playbook.name : '—'}
                  </TableCell>
                  <TableCell>{statusBadge(e.status)}</TableCell>
                  <TableCell className='text-right'>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size='sm' variant='ghost' className='h-7 px-2 text-xs'>
                          View
                        </Button>
                      </DialogTrigger>
                      <DialogContent className='max-w-3xl'>
                        <DialogHeader>
                          <DialogTitle>
                            {typeof e.playbook === 'object'
                              ? e.playbook.name
                              : 'Playbook'}{' '}
                            output
                          </DialogTitle>
                          <DialogDescription className='sr-only'>
                            Ansible playbook execution output
                          </DialogDescription>
                        </DialogHeader>
                        <pre className='max-h-96 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap'>
                          {e.output || '(no output)'}
                          {e.exitCode != null && `\n[exit code: ${e.exitCode}]`}
                        </pre>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {playbooks.length === 0 && executions.length === 0 && (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            No playbooks yet — create one to run it on this server.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default AnsiblePlaybooksCard
