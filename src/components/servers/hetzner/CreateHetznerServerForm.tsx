'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, Dices, RefreshCw } from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { getCloudProvidersAccountsAction } from '@/actions/cloud'
import {
  createHetznerServerAction,
  listHetznerImagesAction,
  listHetznerLocationsAction,
  listHetznerServerTypesAction,
} from '@/actions/cloud/hetzner'
import { createHetznerServerSchema } from '@/actions/cloud/hetzner/validator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { handleGenerateName } from '@/lib/generateName'
import { CloudProviderAccount, SshKey } from '@/payload-types'

interface Location {
  name: string
  city: string
  country: string
}

interface ServerTypeOption {
  name: string
  description: string
  cores: number
  memory: number
  disk: number
  architecture: string
}

interface ImageOption {
  id: number
  name: string
  description: string
}

const CreateHetznerServerForm = ({
  sshKeys,
  formType,
  onSuccess,
}: {
  sshKeys: SshKey[]
  formType?: 'create' | 'update'
  onSuccess?: (data: any) => void
}) => {
  const [accounts, setAccounts] = useState<CloudProviderAccount[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [serverTypes, setServerTypes] = useState<ServerTypeOption[]>([])
  const [images, setImages] = useState<ImageOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)

  const form = useForm<z.infer<typeof createHetznerServerSchema>>({
    resolver: zodResolver(createHetznerServerSchema),
    defaultValues: {
      name: handleGenerateName(),
      description: '',
      accountId: '',
      sshKeyId: '',
      location: '',
      serverType: '',
      image: 'ubuntu-24.04',
    },
  })

  const accountId = form.watch('accountId')

  const { execute: fetchAccounts } = useAction(
    getCloudProvidersAccountsAction,
    {
      onSuccess: ({ data }) => {
        setAccounts(data ?? [])
        if (data?.length === 1) {
          form.setValue('accountId', data[0].id)
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError || 'Failed to load Hetzner accounts')
      },
    },
  )

  useEffect(() => {
    fetchAccounts({ type: 'hetzner' })
  }, [])

  const { executeAsync: fetchLocations } = useAction(listHetznerLocationsAction)
  const { executeAsync: fetchServerTypes } = useAction(
    listHetznerServerTypesAction,
  )
  const { executeAsync: fetchImages } = useAction(listHetznerImagesAction)

  useEffect(() => {
    if (!accountId) return

    const load = async () => {
      setLoadingOptions(true)
      try {
        const [locs, types, imgs] = await Promise.all([
          fetchLocations({ accountId }),
          fetchServerTypes({ accountId }),
          fetchImages({ accountId }),
        ])

        setLocations((locs?.data ?? []) as Location[])
        setServerTypes((types?.data ?? []) as ServerTypeOption[])
        setImages((imgs?.data ?? []) as ImageOption[])
      } catch {
        toast.error('Failed to load Hetzner options — check the API token')
      } finally {
        setLoadingOptions(false)
      }
    }

    load()
  }, [accountId])

  const { execute: createServer, isPending: isCreating } = useAction(
    createHetznerServerAction,
    {
      onSuccess: ({ data }) => {
        if (data?.success && data.server) {
          toast.success(`Server "${data.server.name}" provisioned`)
          onSuccess?.(data)
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError || 'Failed to create Hetzner server')
      },
    },
  )

  if (accounts.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No Hetzner Cloud accounts connected yet. Connect one under
          Integrations → Hetzner Cloud first.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(values => createServer(values))}
        className='w-full space-y-6'
      >
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Server Name</FormLabel>
              <div className='flex w-full items-center space-x-2'>
                <FormControl>
                  <Input {...field} className='w-full' />
                </FormControl>
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  onClick={() => form.setValue('name', handleGenerateName())}
                  title='Generate unique name'
                >
                  <Dices className='h-4 w-4' />
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='description'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} className='rounded-sm' />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='accountId'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hetzner Account</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select account' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {accounts.map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField
            control={form.control}
            name='location'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={loadingOptions || locations.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          loadingOptions ? 'Loading…' : 'Select location'
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {locations.map(loc => (
                      <SelectItem key={loc.name} value={loc.name}>
                        {loc.name} — {loc.city}, {loc.country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='serverType'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Server Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={loadingOptions || serverTypes.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          loadingOptions ? 'Loading…' : 'Select type'
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {serverTypes.map(type => (
                      <SelectItem key={type.name} value={type.name}>
                        {type.name} — {type.cores} vCPU / {type.memory} GB /{' '}
                        {type.disk} GB ({type.architecture})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField
            control={form.control}
            name='image'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Image</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={loadingOptions}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select image' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {images.length > 0 ? (
                      images.map(image => (
                        <SelectItem key={image.id} value={image.name}>
                          {image.description || image.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value='ubuntu-24.04'>Ubuntu 24.04</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
                <p className='text-muted-foreground mt-1 text-xs'>
                  Dokku supports Ubuntu/Debian — pick a supported release
                </p>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='sshKeyId'
            render={({ field }) => (
              <FormItem>
                <FormLabel>SSH Key</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select an SSH key' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {sshKeys.map(key => (
                      <SelectItem key={key.id} value={key.id}>
                        {key.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
                <p className='text-muted-foreground mt-1 text-xs'>
                  Uploaded to Hetzner automatically if missing
                </p>
              </FormItem>
            )}
          />
        </div>

        <Alert>
          <AlertDescription className='text-xs'>
            The server is created via the Hetzner API and registered here. Once
            it&apos;s reachable, install Dokku from the server page to finish
            onboarding.
          </AlertDescription>
        </Alert>

        <div className='flex w-full items-center justify-end'>
          <Button type='submit' disabled={isCreating || loadingOptions}>
            {isCreating ? (
              <>
                <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
                Provisioning…
              </>
            ) : (
              <>
                <CheckCircle className='mr-2 h-4 w-4' />
                Create Server
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}

export default CreateHetznerServerForm
