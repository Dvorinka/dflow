'use client'

import { Button } from '../ui/button'
import { Checkbox } from '../ui/check-box'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { useAction } from 'next-safe-action/hooks'
import { useRouter } from 'next/navigation'
import { Dispatch, SetStateAction, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { getProjectsAndServers } from '@/actions/pages/dashboard'
import { cloneServiceAction } from '@/actions/service'
import { Project, Service } from '@/payload-types'

interface CloneForm {
  projectId: string
  cloneData: boolean
}

const CloneServiceDialog = ({
  open,
  setOpen,
  service,
  project,
}: {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  service: Service
  project: Partial<Project>
}) => {
  const router = useRouter()
  const form = useForm<CloneForm>({
    defaultValues: { projectId: project.id ?? '', cloneData: false },
  })

  const {
    execute: fetchProjects,
    isPending: isLoadingProjects,
    result: projectsResult,
  } = useAction(getProjectsAndServers, {
    onError: ({ error }) => {
      toast.error(`Failed to load projects: ${error.serverError}`)
    },
  })

  const { execute: cloneService, isPending: isCloning } = useAction(
    cloneServiceAction,
    {
      onSuccess: ({ data }) => {
        setOpen(false)
        if (data?.warning) {
          toast.warning('Cloned with warnings', { description: data.warning })
        } else {
          toast.success('Service cloned')
        }
        if (data?.redirectUrl) router.push(data.redirectUrl)
      },
      onError: ({ error }) => {
        toast.error(`Clone failed: ${error.serverError}`)
      },
    },
  )

  useEffect(() => {
    if (open) {
      fetchProjects()
      form.reset({ projectId: project.id ?? '', cloneData: false })
    }
  }, [open])

  const projects = projectsResult?.data?.projectsRes?.docs ?? []
  const isDatabase = service.type === 'database'
  const isDokkuDb =
    isDatabase && service.databaseDetails?.provider !== 'external'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Clone Service</DialogTitle>
          <DialogDescription>
            Copy this service into another project — same or different server.
            Environment variables and build settings are carried over; domains
            are not.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(values =>
              cloneService({
                serviceId: service.id,
                projectId: values.projectId,
                cloneData: values.cloneData,
              }),
            )}
            className='space-y-6'>
            <FormField
              control={form.control}
              name='projectId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target project</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isLoadingProjects}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            isLoadingProjects
                              ? 'Fetching projects...'
                              : 'Select project'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            {typeof p.server === 'object' && p.server?.name
                              ? ` — ${p.server.name}`
                              : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isDokkuDb && (
              <FormField
                control={form.control}
                name='cloneData'
                render={({ field }) => (
                  <FormItem className='flex items-center gap-3 space-y-0'>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div>
                      <FormLabel>Copy database contents</FormLabel>
                      <p className='text-muted-foreground text-xs'>
                        Dumps the source database and imports it into the clone
                        (dokku export → import).
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button
                variant='outline'
                type='button'
                onClick={() => setOpen(false)}
                disabled={isCloning}>
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={!form.watch('projectId') || isCloning}
                isLoading={isCloning}>
                Clone
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default CloneServiceDialog
