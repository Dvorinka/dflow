'use client'

import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { useAction } from 'next-safe-action/hooks'
import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { getProjectsAndServers } from '@/actions/pages/dashboard'
import {
  exposeDatabasePortAction,
  migrateDatabaseAction,
} from '@/actions/service'
import { Server, Service } from '@/payload-types'

const DatabaseForm = ({
  service,
  server,
}: {
  service: Service
  server: Server | string
}) => {
  const { databaseDetails } = service
  const isPublic = !!databaseDetails?.exposedPorts?.length
  const connectionUrl = databaseDetails?.connectionUrl ?? ''
  const host = databaseDetails?.host ?? ''
  const port = databaseDetails?.port ?? ''
  const exposedPort = databaseDetails?.exposedPorts?.[0] ?? ''
  const deployments = service.deployments?.docs ?? []
  const hasDeployed = deployments?.some(
    deployment =>
      typeof deployment === 'object' && deployment.status === 'success',
  )

  const { execute, isPending, hasSucceeded, reset, input } = useAction(
    exposeDatabasePortAction,
    {
      onSuccess: ({ data, input }) => {
        if (data?.success) {
          toast.info('Added to queue', {
            description: `Added ${input.action === 'expose' ? 'database exposure' : 'un-exposing database'} to queue`,
          })
        }
      },
      onError: ({ error }) => {
        toast.error(`Failed to expose port: ${error.serverError}`, {
          duration: 5000,
        })
      },
    },
  )

  // --- Cross-server migration (#408) ---
  const [migrateOpen, setMigrateOpen] = useState(false)
  const [targetProjectId, setTargetProjectId] = useState('')
  const [targetName, setTargetName] = useState(service.name)

  const sourceServerId = typeof server === 'object' ? server.id : server

  const { execute: fetchTargets, result: targetsResult } = useAction(
    getProjectsAndServers,
    { onError: () => toast.error('Failed to load migration targets') },
  )

  const { execute: migrate, isPending: migrating } = useAction(
    migrateDatabaseAction,
    {
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('Database migration queued', {
            description:
              'Export → transfer → import runs in the background. Watch the new service deployments for progress.',
          })
          setMigrateOpen(false)
        }
      },
      onError: ({ error }) => {
        toast.error(`Migration failed: ${error.serverError}`, {
          duration: 5000,
        })
      },
    },
  )

  // Migration targets = tenant projects hosted on a different server
  const targetProjects = (targetsResult?.data?.projectsRes?.docs ?? []).filter(
    project => {
      const projectServerId =
        typeof project.server === 'object'
          ? (project.server as Server).id
          : project.server
      return projectServerId !== sourceServerId
    },
  )

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    execute({
      action: isPublic ? 'unexpose' : 'expose',
      id: service.id,
    })
  }

  useEffect(() => {
    if (hasSucceeded) {
      const ports = databaseDetails?.exposedPorts
      const action = input?.action

      if (action === 'expose' && !!ports?.length) {
        reset()
      } else if (action === 'unexpose' && !ports?.length) {
        reset()
      }
    }
  }, [hasSucceeded, service, input])

  const publicUrl =
    isPublic && typeof server === 'object'
      ? connectionUrl
          .replace(
            host,
            server.preferConnectionType === 'ssh'
              ? (server.ip ?? '')
              : (server.publicIp ?? ''),
          )
          .replace(port, exposedPort)
      : ''

  return (
    <>
      <div className='bg-muted/30 space-y-4 rounded p-4'>
        <h3 className='text-lg font-semibold'>Internal Credentials</h3>

        <form onSubmit={handleSubmit} className='w-full space-y-6'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>Username</Label>
              <Input disabled value={databaseDetails?.username ?? '-'} />
            </div>

            <div className='space-y-2'>
              <Label>Password</Label>
              <Input disabled value={databaseDetails?.password ?? '-'} />
            </div>
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>Port</Label>
              <Input disabled value={databaseDetails?.port ?? '-'} />
            </div>

            <div className='space-y-2'>
              <Label>Host</Label>
              <Input disabled value={databaseDetails?.host ?? '-'} />
            </div>
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>Internal connection url</Label>
              <Input disabled value={databaseDetails?.connectionUrl ?? '-'} />
            </div>

            <div className='space-y-2'>
              <Label>Public connection url</Label>

              <div className='flex gap-2'>
                <Input disabled value={isPublic ? publicUrl : '-'} />

                {hasDeployed && (
                  <Button
                    variant='outline'
                    disabled={isPending || hasSucceeded}
                    isLoading={isPending}
                    type='submit'>
                    {isPublic
                      ? input?.action === 'unexpose'
                        ? 'Un-exposing'
                        : 'Unexpose'
                      : input?.action === 'expose'
                        ? 'Exposing'
                        : 'Expose'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Cross-server migration (#408) */}
      <div className='bg-muted/30 space-y-2 rounded p-4'>
        <h3 className='text-lg font-semibold'>Migrate to another server</h3>
        <p className='text-muted-foreground text-sm'>
          Copies this database to a new database service on another server.
          The source keeps running — re-point dependent apps afterwards.
        </p>

        <Dialog
          open={migrateOpen}
          onOpenChange={open => {
            setMigrateOpen(open)
            if (open) fetchTargets()
          }}>
          <DialogTrigger asChild>
            <Button variant='outline' disabled={!hasDeployed}>
              Migrate
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Migrate {service.name}</DialogTitle>
              <DialogDescription>
                Creates a new {databaseDetails?.type} database in the chosen
                project and imports a dump of this database. Apps are not
                re-linked automatically.
              </DialogDescription>
            </DialogHeader>

            <div className='space-y-4 py-2'>
              <div className='space-y-2'>
                <Label>Target project (on another server)</Label>
                <Select
                  value={targetProjectId}
                  onValueChange={setTargetProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder='Select a project' />
                  </SelectTrigger>
                  <SelectContent>
                    {targetProjects.length === 0 && (
                      <SelectItem value='__none' disabled>
                        No projects on other servers
                      </SelectItem>
                    )}
                    {targetProjects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                        {typeof project.server === 'object' &&
                          ` — ${(project.server as Server).name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label>New database name</Label>
                <Input
                  value={targetName}
                  onChange={e => setTargetName(e.target.value)}
                  placeholder='database name'
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                disabled={
                  migrating || !targetProjectId || targetProjectId === '__none' || !targetName
                }
                isLoading={migrating}
                onClick={() =>
                  migrate({
                    serviceId: service.id,
                    targetProjectId,
                    targetDatabaseName: targetName,
                  })
                }>
                {migrating ? 'Queueing...' : 'Start migration'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}

export default DatabaseForm
