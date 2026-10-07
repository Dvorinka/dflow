'use client'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Copy,
  Dices,
  Key,
  LocateFixed,
  Network,
  RefreshCw,
  Shield,
  Terminal,
} from 'lucide-react'
import { useAction } from 'next-safe-action/hooks'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  generateNetbirdSetupKeyAction,
  getNetbirdPeerAction,
  netbirdConfiguredAction,
} from '@/actions/netbird'
import { checkServerConnection, createServerAction } from '@/actions/server'
import { generateTailscaleHostname } from '@/actions/server'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { handleGenerateName } from '@/lib/generateName'
import { SshKey } from '@/payload-types'

// NetBird peers are plain SSH targets on the mesh IP — the server record
// uses the standard ssh connection fields, so no schema changes are
// needed. This form generates the enrolment commands, resolves the peer
// IP from the NetBird API once `netbird up` has run, then delegates to
// the same test/create actions as the public-IP path.
const netbirdFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  description: z.string().optional(),
  hostname: z.string().min(1, 'Hostname is required'),
  username: z.string().min(1, 'Username is required'),
  sshKey: z.string().min(1, 'SSH key is required'),
  port: z.number().min(1).max(65535),
  setupKey: z.string().optional(),
  peerIp: z.string().optional(),
})

type NetBirdFormData = z.infer<typeof netbirdFormSchema>

const NetBirdForm = ({ sshKeys }: { sshKeys: SshKey[] }) => {
  const [generatedCommands, setGeneratedCommands] = useState<string[]>([])
  const [apiConfigured, setApiConfigured] = useState(false)
  const [managementUrl, setManagementUrl] = useState<string | null>(null)
  const [resolvedIp, setResolvedIp] = useState<string>('')
  const [showCreateServer, setShowCreateServer] = useState(false)

  const form = useForm<NetBirdFormData>({
    resolver: zodResolver(netbirdFormSchema),
    defaultValues: {
      name: handleGenerateName(),
      description: '',
      username: 'root',
      sshKey: '',
      port: 22,
      setupKey: '',
      peerIp: '',
    },
  })

  const { executeAsync: generateHostName } = useAction(
    generateTailscaleHostname,
  )

  useEffect(() => {
    generateHostName()
      .then(result => {
        if (result?.data?.hostname) {
          form.setValue('hostname', result.data.hostname)
        }
      })
      .catch(() => {})
  }, [])

  const { execute: checkConfigured } = useAction(netbirdConfiguredAction, {
    onSuccess: ({ data }) => {
      setApiConfigured(Boolean(data?.configured))
      setManagementUrl(data?.managementUrl ?? null)
    },
  })

  useEffect(() => {
    checkConfigured()
  }, [])

  const buildCommands = (key: string) => {
    const hostname = form.getValues('hostname')
    const up = managementUrl
      ? `sudo netbird up --setup-key=${key} --hostname=${hostname || 'server'} --management-url=${managementUrl}`
      : `sudo netbird up --setup-key=${key} --hostname=${hostname || 'server'}`
    return ['curl -fsSL https://pkgs.netbird.io/install.sh | sh', up]
  }

  const { execute: generateSetupKey, isPending: isGenerating } = useAction(
    generateNetbirdSetupKeyAction,
    {
      onSuccess: ({ data }) => {
        if (data?.success && data.key) {
          form.setValue('setupKey', data.key)
          setGeneratedCommands(buildCommands(data.key))
          toast.success('NetBird setup key generated')
        } else {
          toast.error('Failed to generate setup key')
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError || 'Failed to generate setup key')
      },
    },
  )

  // Manual-key mode: user pastes a key created in their NetBird dashboard
  const handleUsePastedKey = () => {
    const key = form.getValues('setupKey')?.trim()
    if (!key) {
      toast.error('Paste a setup key first')
      return
    }
    setGeneratedCommands(buildCommands(key))
    toast.success('Commands generated from your setup key')
  }

  const { execute: resolvePeer, isPending: isResolving } = useAction(
    getNetbirdPeerAction,
    {
      onSuccess: ({ data }) => {
        if (data?.found && data.peer) {
          form.setValue('peerIp', data.peer.ip)
          setResolvedIp(data.peer.ip)
          toast.success(`Peer found: ${data.peer.dnsLabel} (${data.peer.ip})`)
        } else {
          toast.error(
            'Peer not found yet — run the commands on the server, wait a few seconds, and retry',
          )
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError || 'Failed to query NetBird peers')
      },
    },
  )

  const { execute: testConnection, isExecuting: isTestingConnection } =
    useAction(checkServerConnection, {
      onSuccess: ({ data }) => {
        if (data?.isConnected) {
          setShowCreateServer(true)
          toast.success('Connection test successful!')
        } else {
          toast.error(data?.error || 'Connection test failed')
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError || 'Connection test failed')
      },
    })

  const handleTestConnection = () => {
    const { username, sshKey, port, peerIp } = form.getValues()
    const ip = peerIp || resolvedIp

    const errors: string[] = []
    if (!ip?.trim()) errors.push('Peer IP (resolve the peer first)')
    if (!username?.trim()) errors.push('Username')
    if (!sshKey?.trim()) errors.push('SSH Key')
    if (!port) errors.push('Port')

    if (errors.length > 0) {
      toast.error(`Please fill in required fields: ${errors.join(', ')}`)
      return
    }

    const selectedSshKey = sshKeys.find(key => key.id === sshKey)
    if (!selectedSshKey?.privateKey) {
      toast.error('Selected SSH key does not have a private key')
      return
    }

    testConnection({
      connectionType: 'ssh',
      ip,
      port,
      username,
      privateKey: selectedSshKey.privateKey,
    })
  }

  const { execute: createServer, isPending: isCreatingServer } = useAction(
    createServerAction,
    {
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('Server created successfully!')
        }
      },
      onError: ({ error }) => {
        toast.error(`Failed to create server: ${error?.serverError}`)
      },
      onSettled: () => {
        form.reset()
        setGeneratedCommands([])
        setResolvedIp('')
        setShowCreateServer(false)
      },
    },
  )

  const handleCreateServer = () => {
    const { name, description, username, sshKey, port, peerIp } =
      form.getValues()
    createServer({
      name,
      description,
      ip: peerIp || resolvedIp,
      port,
      username,
      sshKey,
    })
  }

  const copyToClipboard = async (command: string, index: number) => {
    try {
      await navigator.clipboard.writeText(command)
      toast.success(`Command ${index + 1} copied to clipboard`)
    } catch {
      toast.error('Failed to copy command')
    }
  }

  const isGenerated = generatedCommands.length > 0

  return (
    <Form {...form}>
      <div className='w-full space-y-6'>
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
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

        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField
            control={form.control}
            name='hostname'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hostname (Auto-generated)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder='Generating unique hostname...'
                    className='bg-muted cursor-not-allowed rounded-sm'
                    readOnly
                    disabled
                  />
                </FormControl>
                <FormMessage />
                <p className='text-muted-foreground mt-1 text-xs'>
                  The peer registers under this name in your NetBird network
                </p>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='username'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder='Enter username'
                    className='rounded-sm'
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField
            control={form.control}
            name='sshKey'
            render={({ field }) => (
              <FormItem>
                <FormLabel>SSH Key</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
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
                  Used to SSH into the server over the NetBird mesh IP
                </p>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='port'
            render={({ field }) => (
              <FormItem>
                <FormLabel>SSH Port</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    {...field}
                    onChange={e => field.onChange(Number(e.target.value))}
                    className='rounded-sm'
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='space-y-4'>
          {/* Setup Key Section */}
          <div className='bg-muted/30 rounded-lg border p-4'>
            <div className='flex items-center justify-between gap-3'>
              <div className='flex-1'>
                <div className='flex items-center gap-2'>
                  <Key className='text-muted-foreground h-4 w-4' />
                  <p className='text-foreground text-sm font-medium'>
                    NetBird Setup Key
                  </p>
                </div>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {apiConfigured
                    ? 'Generate a one-off key via the NetBird API'
                    : 'Paste a setup key from your NetBird dashboard, or set NETBIRD_API_TOKEN to generate keys here'}
                </p>
              </div>

              {apiConfigured && (
                <Button
                  type='button'
                  disabled={isGenerating || isGenerated}
                  isLoading={isGenerating}
                  onClick={() =>
                    generateSetupKey({ hostname: form.getValues('hostname') })
                  }
                  className='shrink-0'
                >
                  <Key className='mr-2 h-3 w-3' />
                  Generate Key
                </Button>
              )}
            </div>

            {!apiConfigured && (
              <div className='mt-3 flex items-center gap-2'>
                <FormField
                  control={form.control}
                  name='setupKey'
                  render={({ field }) => (
                    <FormItem className='flex-1'>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder='Paste setup key'
                          className='rounded-sm font-mono text-xs'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type='button'
                  variant='outline'
                  disabled={isGenerated}
                  onClick={handleUsePastedKey}
                  className='shrink-0'
                >
                  Use Key
                </Button>
              </div>
            )}
          </div>

          {/* Generated Commands */}
          {isGenerated && (
            <div className='bg-muted/50 rounded-lg border p-4'>
              <div className='mb-3 flex items-center gap-2'>
                <Terminal className='text-muted-foreground h-4 w-4' />
                <p className='text-foreground text-sm font-medium'>
                  Generated Commands
                </p>
              </div>
              <p className='text-muted-foreground mb-4 text-xs'>
                Execute these commands on your server to install NetBird and
                join your network
              </p>

              <div className='space-y-3'>
                {generatedCommands.map((command, index) => (
                  <div key={index} className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <p className='text-foreground text-xs font-medium'>
                        Step {index + 1}:{' '}
                        {index === 0 ? 'Install NetBird' : 'Join the network'}
                      </p>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={() => copyToClipboard(command, index)}
                        className='h-6 px-2'
                      >
                        <Copy className='mr-1 h-3 w-3' />
                        Copy
                      </Button>
                    </div>
                    <pre className='bg-background text-foreground overflow-x-auto rounded border p-3 text-xs'>
                      <code>{command}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolve peer */}
          <div className='bg-muted/30 rounded-lg border p-4'>
            <div className='flex items-center justify-between gap-3'>
              <div className='flex-1'>
                <div className='flex items-center gap-2'>
                  <LocateFixed className='text-muted-foreground h-4 w-4' />
                  <p className='text-foreground text-sm font-medium'>
                    Resolve Peer IP
                  </p>
                </div>
                <p className='text-muted-foreground mt-1 text-xs'>
                  After the server joins, fetch its NetBird mesh IP
                  {resolvedIp ? ` — resolved: ${resolvedIp}` : ''}
                </p>
              </div>
              <Button
                type='button'
                variant='outline'
                onClick={() =>
                  resolvePeer({ hostname: form.getValues('hostname') })
                }
                disabled={isResolving || !isGenerated}
                className='shrink-0'
              >
                {isResolving ? (
                  <>
                    <RefreshCw className='mr-2 h-3 w-3 animate-spin' />
                    Resolving...
                  </>
                ) : (
                  <>
                    <Network className='mr-2 h-3 w-3' />
                    Resolve
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Test connection */}
          <div className='bg-muted/30 rounded-lg border p-4'>
            <div className='flex items-center justify-between gap-3'>
              <div className='flex-1'>
                <div className='flex items-center gap-2'>
                  <Shield className='text-muted-foreground h-4 w-4' />
                  <p className='text-foreground text-sm font-medium'>
                    Server Connection Test
                  </p>
                </div>
                <p className='text-muted-foreground mt-1 text-xs'>
                  Verify SSH connectivity over the NetBird network
                </p>
              </div>
              <Button
                type='button'
                variant='outline'
                onClick={handleTestConnection}
                disabled={
                  isTestingConnection ||
                  !(resolvedIp || form.getValues('peerIp'))
                }
                className='shrink-0'
              >
                {isTestingConnection ? (
                  <>
                    <RefreshCw className='mr-2 h-3 w-3 animate-spin' />
                    Testing...
                  </>
                ) : (
                  <>
                    <Shield className='mr-2 h-3 w-3' />
                    Test Connection
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className='flex w-full items-center justify-end'>
          <Button
            type='button'
            disabled={isCreatingServer || !showCreateServer}
            onClick={handleCreateServer}
          >
            Add Server
          </Button>
        </div>
      </div>
    </Form>
  )
}

export default NetBirdForm
