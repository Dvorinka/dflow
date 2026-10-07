'use client'

import { Badge } from '../ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import {
  ChevronDown,
  Cloud,
  DatabaseBackup,
  History,
  Server,
  Trash2,
} from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import React, { useState } from 'react'
import { toast } from 'sonner'

import {
  externalBackupAction,
  internalBackupAction,
  internalDbDeleteAction,
  internalRestoreAction,
  scheduleExternalBackupAction,
  unscheduleExternalBackupAction,
} from '@/actions/dbBackup'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { databaseOptions } from '@/lib/constants'
import { Backup as BackupType, Service } from '@/payload-types'

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

type ScheduleFreq = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

type ScheduleFields = {
  freq: ScheduleFreq
  minute: number
  time: string
  weekday: number
  monthDay: number
}

const pad = (n: number) => String(n).padStart(2, '0')

const parseInitialSchedule = (cron: string): ScheduleFields => {
  const base: ScheduleFields = {
    freq: 'custom',
    minute: 0,
    time: '03:00',
    weekday: 0,
    monthDay: 1,
  }
  const f = cron.trim().split(/\s+/)
  if (f.length !== 5 || !/^\d{1,2}$/.test(f[0])) return base
  const [m, h, dom, , dow] = f
  const minute = parseInt(m, 10)
  if (/^\d{1,2}$/.test(h) && dom === '*' && dow === '*')
    return { ...base, freq: 'daily', time: toTimeField(minute, h) }
  if (/^\d{1,2}$/.test(h) && dom === '*' && /^\d$/.test(dow))
    return {
      ...base,
      freq: 'weekly',
      time: toTimeField(minute, h),
      weekday: parseInt(dow, 10),
    }
  if (/^\d{1,2}$/.test(h) && /^\d{1,2}$/.test(dom) && dow === '*')
    return {
      ...base,
      freq: 'monthly',
      time: toTimeField(minute, h),
      monthDay: parseInt(dom, 10),
    }
  if (h === '*' && dom === '*' && dow === '*')
    return { ...base, freq: 'hourly', minute }
  return base
}

const toTimeField = (minute: number, hour: string) =>
  `${pad(parseInt(hour, 10))}:${pad(minute)}`

const cronFromFields = (f: ScheduleFields): string => {
  const [h = '3', m = '0'] = f.time.split(':')
  switch (f.freq) {
    case 'hourly':
      return `${f.minute} * * * *`
    case 'weekly':
      return `${parseInt(m, 10)} ${parseInt(h, 10)} * * ${f.weekday}`
    case 'monthly':
      return `${parseInt(m, 10)} ${parseInt(h, 10)} ${f.monthDay} * *`
    default:
      return `${parseInt(m, 10)} ${parseInt(h, 10)} * * *`
  }
}

const describeFields = (f: ScheduleFields): string => {
  switch (f.freq) {
    case 'hourly':
      return `Every hour at minute :${pad(f.minute)}`
    case 'weekly':
      return `Every ${WEEKDAYS[f.weekday]} at ${f.time}`
    case 'monthly':
      return `Day ${f.monthDay} of every month at ${f.time}`
    default:
      return `Every day at ${f.time}`
  }
}

const ScheduleBuilder = ({
  value,
  onChange,
}: {
  value: string
  onChange: (cron: string) => void
}) => {
  const [fields, setFields] = useState<ScheduleFields>(() =>
    parseInitialSchedule(value),
  )

  const update = (patch: Partial<ScheduleFields>) => {
    const next = { ...fields, ...patch }
    setFields(next)
    if (next.freq !== 'custom') onChange(cronFromFields(next))
  }

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-2'>
          <Label>Frequency</Label>
          <Select
            value={fields.freq}
            onValueChange={v => update({ freq: v as ScheduleFreq })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='hourly'>Hourly</SelectItem>
              <SelectItem value='daily'>Daily</SelectItem>
              <SelectItem value='weekly'>Weekly</SelectItem>
              <SelectItem value='monthly'>Monthly</SelectItem>
              <SelectItem value='custom'>Custom (cron)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {fields.freq === 'hourly' && (
          <div className='space-y-2'>
            <Label>At minute</Label>
            <Input
              type='number'
              min={0}
              max={59}
              value={fields.minute}
              onChange={e =>
                update({
                  minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                })
              }
            />
          </div>
        )}

        {fields.freq === 'weekly' && (
          <div className='space-y-2'>
            <Label>Day</Label>
            <Select
              value={String(fields.weekday)}
              onValueChange={v => update({ weekday: parseInt(v, 10) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d, i) => (
                  <SelectItem key={d} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {fields.freq === 'monthly' && (
          <div className='space-y-2'>
            <Label>Day of month</Label>
            <Input
              type='number'
              min={1}
              max={28}
              value={fields.monthDay}
              onChange={e =>
                update({
                  monthDay: Math.max(
                    1,
                    Math.min(28, Number(e.target.value) || 1),
                  ),
                })
              }
            />
          </div>
        )}

        {(fields.freq === 'daily' ||
          fields.freq === 'weekly' ||
          fields.freq === 'monthly') && (
          <div className='space-y-2'>
            <Label>Time</Label>
            <Input
              type='time'
              value={fields.time}
              onChange={e => update({ time: e.target.value || '03:00' })}
            />
          </div>
        )}
      </div>

      {fields.freq === 'custom' && (
        <div className='space-y-2'>
          <Label htmlFor='backup-cron'>Cron schedule</Label>
          <Input
            id='backup-cron'
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder='0 3 * * *'
          />
          <p className='text-muted-foreground text-xs'>
            Standard five-field cron — e.g. <code>0 3 * * *</code> daily at
            03:00, <code>0 3 * * 0</code> weekly on Sunday.
          </p>
        </div>
      )}

      <p className='text-muted-foreground text-xs'>
        {fields.freq === 'custom' ? (
          <>Custom expression — dokku runs whatever cron accepts.</>
        ) : (
          <>
            {describeFields(fields)} — <code>{value}</code> (server local time)
          </>
        )}
      </p>
    </div>
  )
}

export const IndividualBackup = ({
  backup,
  serviceId,
  showRestoreIcon = true,
  showDeleteIcon = true,
  databaseIcon: DatabaseIcon,
  databaseType,
}: {
  backup: BackupType
  serviceId: string
  showRestoreIcon?: boolean
  showDeleteIcon?: boolean
  databaseIcon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  databaseType?: string | null
}) => {
  const {
    execute: internalRestoreExecution,
    isPending: isInternalRestorePending,
  } = useAction(internalRestoreAction, {
    onExecute: () => {
      toast.loading('Restoring backup...', {
        id: 'restore-backup',
      })
    },
    onSuccess: ({ data }) => {
      if (data?.success) {
        toast.success('Added to queue', {
          id: 'restore-backup',
          description: 'Added backup restoration to queue',
        })
      }
    },
    onError: ({ error }) => {
      toast.error('Restore Failed', {
        id: 'restore-backup',
        description: error?.serverError,
      })
    },
  })

  const {
    execute: internalDeleteExecution,
    isPending: isInternalDeletePending,
  } = useAction(internalDbDeleteAction, {
    onExecute: () => {
      toast.loading('Deleting backup...', {
        id: 'delete-backup',
      })
    },
    onSuccess: ({ data }) => {
      if (data?.success) {
        toast.success('Added to queue', {
          id: 'delete-backup',
          description: 'Added backup deletion to queue',
        })
      }
    },
    onError: ({ error }) => {
      toast.error('Delete Failed', {
        id: 'delete-backup',
        description: error?.serverError,
      })
    },
  })

  const backupCreatedDate = new Date(backup.createdAt)

  const formattedDate = [
    backupCreatedDate.getUTCFullYear(),
    String(backupCreatedDate.getUTCMonth() + 1).padStart(2, '0'),
    String(backupCreatedDate.getUTCDate()).padStart(2, '0'),
    String(backupCreatedDate.getUTCHours()).padStart(2, '0'),
    String(backupCreatedDate.getUTCMinutes()).padStart(2, '0'),
    String(backupCreatedDate.getUTCSeconds()).padStart(2, '0'),
  ].join('-')

  return (
    <div className='flex items-center justify-between rounded-md border p-4'>
      <div className='flex items-center gap-2'>
        {DatabaseIcon ? (
          <DatabaseIcon className='stroke-muted-foreground h-4 w-4' />
        ) : (
          <DatabaseBackup size={16} className='stroke-muted-foreground' />
        )}
        <div className='text-sm font-medium'>{formattedDate}</div>
        {databaseType && (
          <Badge variant='outline' className='text-xs'>
            {databaseType}
          </Badge>
        )}
        <Badge
          className=''
          variant={
            backup.status === 'failed'
              ? 'destructive'
              : backup.status === 'in-progress'
                ? 'warning'
                : ('success' as 'success' | 'destructive' | 'warning')
          }>
          {backup.status}
        </Badge>
      </div>
      <div className='flex items-center gap-2'>
        {showRestoreIcon && (
          <Button
            variant='outline'
            // size='icon'
            disabled={isInternalRestorePending}
            onClick={() =>
              internalRestoreExecution({ backupId: backup.id, serviceId })
            }>
            {/* <History size={16} /> */}
            Restore
          </Button>
        )}
        {showDeleteIcon && (
          <Button
            variant='outline'
            size='icon'
            onClick={() => {
              internalDeleteExecution({
                backupId: backup.id,
                serviceId,
                databaseName: '',
                databaseType: '',
              })
            }}>
            <Trash2 size={16} />
          </Button>
        )}
      </div>
    </div>
  )
}

const Backup = ({
  databaseDetails,
  serviceId,
  backups,
  restorableBackups = [],
}: {
  databaseDetails: Service['databaseDetails']
  serviceId: string
  backups: BackupType[]
  restorableBackups?: BackupType[]
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false)
  const [restoreBackupId, setRestoreBackupId] = useState<string>('')
  const { execute: internalDBBackupExecution, isPending: isInternalDBPending } =
    useAction(internalBackupAction, {
      onExecute: () => {
        toast.loading('Creating backup...', {
          id: 'create-backup',
        })
      },
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('Added to queue', {
            id: 'create-backup',
            description: 'Added backup creation to queue',
          })
        }
      },
      onError: ({ error }) => {
        toast.error('Backup Failed', {
          id: 'create-backup',
          description: error?.serverError,
        })
      },
    })

  const isExternalProvider = databaseDetails?.provider === 'external'
  const [cronSchedule, setCronSchedule] = useState(
    databaseDetails?.backupSchedule ?? '0 3 * * *',
  )

  const { execute: externalBackupExecution, isPending: isExternalDBPending } =
    useAction(externalBackupAction, {
      onExecute: () => {
        toast.loading('Creating external backup...', { id: 'create-backup' })
      },
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('Added to queue', {
            id: 'create-backup',
            description: 'Backup will be dumped and uploaded to S3',
          })
        }
      },
      onError: ({ error }) => {
        toast.error('Backup Failed', {
          id: 'create-backup',
          description: error?.serverError,
        })
      },
    })

  const { execute: scheduleExecution, isPending: isScheduling } = useAction(
    scheduleExternalBackupAction,
    {
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('Backup schedule saved', {
            description: `External backups run on: ${cronSchedule}`,
          })
          setIsDialogOpen(false)
        }
      },
      onError: ({ error }) => {
        toast.error('Failed to save schedule', {
          description: error?.serverError,
        })
      },
    },
  )

  const { execute: unscheduleExecution, isPending: isUnscheduling } = useAction(
    unscheduleExternalBackupAction,
    {
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('Backup schedule removed')
          setIsDialogOpen(false)
        }
      },
      onError: ({ error }) => {
        toast.error('Failed to remove schedule', {
          description: error?.serverError,
        })
      },
    },
  )

  const { execute: restoreExistingExecution, isPending: isRestorePending } =
    useAction(internalRestoreAction, {
      onExecute: () => {
        toast.loading('Restoring backup...', {
          id: 'restore-existing-backup',
        })
      },
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('Added to queue', {
            id: 'restore-existing-backup',
            description: 'Added backup restoration to queue',
          })
          setRestoreBackupId('')
        }
      },
      onError: ({ error }) => {
        toast.error('Restore Failed', {
          id: 'restore-existing-backup',
          description: error?.serverError,
        })
      },
    })

  return (
    <>
      <div className='flex items-center justify-between'>
        <h2 className='flex items-center gap-2 text-2xl font-semibold'>
          <DatabaseBackup className='inline-block' />
          Backups
        </h2>
        <div className='flex items-center gap-2'>
          {!isExternalProvider && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant={'outline'}>
                  {databaseDetails?.backupSchedule
                    ? `Scheduled: ${databaseDetails.backupSchedule}`
                    : 'Create backup schedule'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configure backup schedule</DialogTitle>
                  <DialogDescription>
                    Recurring dumps uploaded to the configured S3 destination
                    via the dokku backup plugin.
                  </DialogDescription>
                </DialogHeader>

                <ScheduleBuilder
                  key={databaseDetails?.backupSchedule ?? 'unset'}
                  value={cronSchedule}
                  onChange={setCronSchedule}
                />

                <DialogFooter>
                  {databaseDetails?.backupSchedule && (
                    <Button
                      variant='destructive'
                      isLoading={isUnscheduling}
                      onClick={() =>
                        unscheduleExecution({ serviceId })
                      }>
                      Remove schedule
                    </Button>
                  )}
                  <Button
                    variant={'outline'}
                    onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    isLoading={isScheduling}
                    disabled={!cronSchedule}
                    onClick={() =>
                      scheduleExecution({ serviceId, schedule: cronSchedule })
                    }>
                    Save schedule
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {/* Both backup paths are dokku-based — not applicable to
              externally-managed databases (#412) */}
          {!isExternalProvider && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={'outline'}
                  disabled={
                    databaseDetails?.status !== 'running' ||
                    isInternalDBPending
                  }
                  className='flex items-center gap-2'>
                  Create Backup
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>

            <DropdownMenuContent align='end'>
              <DropdownMenuItem
                className='hover:text-background cursor-pointer'
                onClick={() =>
                  internalDBBackupExecution({
                    serviceId,
                  })
                }>
                <div
                  className='flex size-8 items-center justify-center'
                  aria-hidden='true'>
                  <Server size={16} className='opacity-60' />
                </div>
                <div>
                  <div className='text-sm font-medium'>Internal Backup</div>
                  <div className='text-xs opacity-60'>
                    Creates backup within the server
                  </div>
                </div>
              </DropdownMenuItem>
              {!isExternalProvider && (
                <DropdownMenuItem
                  className='hover:text-background cursor-pointer'
                  disabled={isExternalDBPending}
                  onClick={() => externalBackupExecution({ serviceId })}>
                  <div
                    className='flex size-8 items-center justify-center'
                    aria-hidden='true'>
                    <Cloud size={16} className='opacity-60' />
                  </div>
                  <div>
                    <div className='text-sm font-medium'>
                      External Backup (S3)
                    </div>
                    <div className='text-xs opacity-60'>
                      Dumps and uploads to the configured S3 endpoint
                    </div>
                  </div>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {backups.length === 0 ? (
        <div className='flex h-72 flex-col items-center justify-center'>
          <DatabaseBackup className='stroke-muted-foreground' />
          <div>No Backups</div>
          <p className='text-muted-foreground font-light'>
            This service's volumes do not have any backups available.
          </p>
        </div>
      ) : (
        <div className='mt-4 flex flex-col gap-2'>
          {backups.map(backup => (
            <IndividualBackup
              key={backup.id}
              backup={backup}
              serviceId={serviceId}
              databaseType={
                databaseDetails?.type ?? backup.databaseType ?? null
              }
            />
          ))}
        </div>
      )}

      {/* Restore into this (possibly newly created, #484) database from a
          sibling backup of the same type on the same server */}
      {restorableBackups.length > 0 && (
        <div className='mt-6 space-y-3 rounded-md border p-4'>
          <div>
            <h3 className='text-sm font-medium'>
              Restore from existing backup
            </h3>
            <p className='text-muted-foreground text-xs'>
              Seed this database from another {databaseDetails?.type} backup
              on the same server. Type is validated before restore.
            </p>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <Select
              value={restoreBackupId}
              onValueChange={setRestoreBackupId}>
              <SelectTrigger className='sm:max-w-md'>
                <SelectValue placeholder='Select a backup to restore' />
              </SelectTrigger>
              <SelectContent>
                {restorableBackups.map(backup => {
                  const sourceName =
                    typeof backup.service === 'string'
                      ? backup.service
                      : backup.service.name
                  return (
                    <SelectItem key={backup.id} value={backup.id}>
                      {backup.backupName ?? backup.id} — {sourceName} (
                      {new Date(backup.createdAt).toLocaleString()})
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Button
              disabled={!restoreBackupId || isRestorePending}
              isLoading={isRestorePending}
              onClick={() =>
                restoreExistingExecution({
                  backupId: restoreBackupId,
                  serviceId,
                })
              }>
              Restore selected
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

export default Backup

export const BackupDetails = ({ data }: { data: BackupType[] }) => {
  const grouped = data.reduce(
    (acc, backup) => {
      let projectName = ''
      let serviceName = ''

      if (typeof backup.service === 'string') {
        projectName = 'Deleted Project/Service'
        serviceName = backup.service
      } else {
        projectName =
          typeof backup.service !== 'string'
            ? backup.service.project &&
              typeof backup.service.project !== 'string'
              ? backup.service.project.name || 'Unknown Project'
              : 'Unknown Project'
            : 'Unknown Project'
        serviceName =
          typeof backup.service !== 'string'
            ? backup.service.name
            : backup.service
      }

      if (!acc[projectName]) acc[projectName] = {}
      if (!acc[projectName][serviceName]) acc[projectName][serviceName] = []

      acc[projectName][serviceName].push(backup)
      return acc
    },
    {} as Record<string, Record<string, BackupType[]>>,
  )

  return (
    <div className='space-y-4'>
      {Object.entries(grouped).map(([projectName, services]) => (
        <div key={projectName} className='rounded-xl border p-6 shadow-sm'>
          <h4 className='mb-4 text-2xl font-semibold'>{projectName}</h4>
          <div className='space-y-6'>
            {Object.entries(services).map(([serviceName, backups]) => {
              // Survives service deletion: type is denormalized on the
              // backup itself (#483)
              const groupType =
                backups.find(b => b.databaseType)?.databaseType ??
                (typeof backups[0]?.service === 'string'
                  ? null
                  : backups[0]?.service.databaseDetails?.type ?? null)
              const isDeleted = projectName === 'Deleted Project/Service'
              return (
                <div key={serviceName}>
                  <h5 className='text-muted-foreground mb-2 flex items-center gap-2 text-lg font-medium'>
                    {isDeleted ? `Deleted service (${serviceName})` : serviceName}
                    {groupType && (
                      <Badge variant='outline' className='text-xs'>
                        {groupType}
                      </Badge>
                    )}
                  </h5>
                  <ul className='space-y-3'>
                    {backups.map(backup => {
                      const backupType =
                        backup.databaseType ??
                        (typeof backup.service === 'string'
                          ? null
                          : backup.service.databaseDetails?.type ?? null)
                      const DatabaseIcon = databaseOptions?.find(
                        database => database.value === backupType,
                      )?.icon

                      return (
                        <IndividualBackup
                          key={backup.id}
                          showRestoreIcon={false}
                          showDeleteIcon={false}
                          backup={backup}
                          databaseIcon={DatabaseIcon}
                          databaseType={backupType}
                          serviceId={
                            typeof backup.service === 'string'
                              ? backup.service
                              : backup.service.id
                          }
                        />
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {Object.keys(grouped).length === 0 && (
        <div className='bg-muted/20 rounded-lg border py-12 text-center'>
          <div className='grid min-h-[40vh] place-items-center'>
            <div className='max-w-md space-y-4 text-center'>
              <div className='bg-muted mx-auto flex h-16 w-16 items-center justify-center rounded-full'>
                <History className='text-muted-foreground h-8 w-8 animate-pulse' />
              </div>
              <h2 className='text-2xl font-semibold'>No Backups Found</h2>
              <p className='text-muted-foreground'>
                You don’t have any backups yet. Backups for your projects or
                services will appear here once they’re created.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
