'use client'

import { Plus } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { installCustomPluginAction } from '@/actions/plugin'
import { installCustomPluginSchema } from '@/actions/plugin/validator'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { zodResolver } from '@hookform/resolvers/zod'

const formSchema = installCustomPluginSchema.omit({ serverId: true })

const InstallCustomPluginDialog = ({ serverId }: { serverId: string }) => {
  const [open, setOpen] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      pluginName: '',
      pluginURL: '',
    },
  })

  const { execute, isPending } = useAction(installCustomPluginAction, {
    onSuccess: ({ data }) => {
      if (data?.success) {
        setOpen(false)
        form.reset()
        toast.info('Job queued', {
          description: 'Queued job to install custom plugin',
        })
      }
    },
    onError: ({ error }) => {
      toast.error(`Failed to install plugin: ${error.serverError}`)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={state => {
        if (isPending) return
        setOpen(state)
        if (!state) form.reset()
      }}>
      <DialogTrigger asChild>
        <Button variant='outline'>
          <Plus size={14} />
          Custom Plugin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install custom plugin</DialogTitle>
          <DialogDescription>
            Install any dokku plugin from its git repository. It appears
            under Custom Plugins after sync.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(values =>
              execute({ ...values, serverId }),
            )}
            className='space-y-4'>
            <FormField
              control={form.control}
              name='pluginName'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plugin name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder='my-plugin' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='pluginURL'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Git URL</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder='https://github.com/user/dokku-plugin.git'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type='submit'
                disabled={isPending}
                isLoading={isPending}>
                Install
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default InstallCustomPluginDialog
