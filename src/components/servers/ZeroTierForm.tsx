'use client'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  CheckCircle,
  Copy,
  Dices,
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

import { generateTailscaleHostname } from '@/actions/server'
import { checkServerConnection, createServerAction } from '@/actions/server'
import {
  authorizeZerotierMemberAction,
  getZerotierMembersAction,
  zerotierConfiguredAction,
} from '@/actions/zerotier'
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

// ZeroTier members join with `zerotier-cli join <networkId>` and must then
// be authorized — either via the Central API (when configured) or manually
// in the ZeroTier Central UI. The server record uses the standard SSH
// fields pointed at the assigned mesh IP, same as NetBird.
const zerotierFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  description: z.string().optional(),
  hostname: z.string().min(1, 'Hostname is required'),
  username: z.string().min(1, 'Username is required'),
  sshKey: z.string().min(1, 'SSH key is required'),
  port: z.number().min(1).max(65535),
  networkId: z.string().optional(),
  peerIp: z.string().optional(),
})

type ZeroTierFormData = z.infer<typeof zerotierFormSchema>

interface ZtMember {
  nodeId: string
  name?: string
  authorized: boolean
  ipAssignments: string[]
}

const ZeroTierForm = ({ sshKeys }: { sshKeys: SshKey[] }) => {
  const [generatedCommands, setGeneratedCommands] = useState<string[]>([])
  const [apiConfigured, setApiConfigured] = useState(false)
  const [resolvedIp, setResolvedIp] = useState('')
  const [members, setMembers] = useState<ZtMember[]>([])
  const [showCreateServer, setShowCreateServer] = useState(false)

  const form = useForm<ZeroTierFormData>({
    resolver: zodResolver(zerotierFormSchema),
    defaultValues: {
      name: handleGenerateName(),
      description: '',
      username: 'root',
      sshKey: '',
      port: 22,
      networkId: '',
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

  const { execute: checkConfigured } = useAction(zerotierConfiguredAction, {
    onSuccess: ({ data }) => {
      setApiConfigured(Boolean(data?.configured))
      if (data?.networkId) {
        form.setValue('networkId', data.networkId)
      }
    },
  })

  useEffect(() => {
    checkConfigured()
  }, [])

  const buildCommands = (networkId: string) => [
    'curl -s https://install.zerotier.com | sudo bash',
    `sudo zerotier-cli join ${networkId}`,
  ]

  const handleGenerateCommands = () => {
    const networkId = form.getValues('networkId')?.trim()
    if (!networkId) {
      toast.error('Enter a ZeroTier network ID first')
      return
    }
    setGeneratedCommands(buildCommands(networkId))
    toast.success('Join commands generated')
  }

  const { execute: fetchMembers, isPending: isFetchingMembers } = useAction(
    getZerotierMembersAction,
    {
      onSuccess: ({ data }) => {
        const list = data?.members ?? []
        setMembers(list)
        const pending = list.filter(m => !m.authorized)
        if (pending.length === 0) {
          toast.info(
            'No unauthorized members — run the join command on the server, then refresh',
          )
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError || 'Failed to list ZeroTier members')
      },
    },
  )

  const { execute: authorizeMember, isPending: isAuthorizing } = useAction(
    authorizeZerotierMemberAction,
    {
      onSuccess: ({ data }) => {
        const member = data?.member
        const ip = member?.ipAssignments?.[0]
        if (member?.authorized && ip) {
          form.setValue('peerIp', ip)
          setResolvedIp(ip)
          toast.success(`Member authorized — mesh IP ${ip}`)
        } else {
          toast.error('Member authorized but no IP assigned yet — retry')
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError || 'Failed to authorize member')
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
    if (!ip?.trim()) errors.push('Peer IP (authorize the member first)')
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
        setMembers([])
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
  const unauthorizedMembers = members.filter(m => !m.authorized)

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
                  The member is named after this hostname once authorized
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
                  Used to SSH into the server over the ZeroTier mesh IP
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
          {/* Network + join commands */}
          <div className='bg-muted/30 rounded-lg border p-4'>
            <div className='flex items-center gap-2'>
              <Network className='text-muted-foreground h-4 w-4' />
              <p className='text-foreground text-sm font-medium'>
                ZeroTier Network
              </p>
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {apiConfigured
                ? 'Network ID is read from this instance’s configuration'
                : 'Enter your 16-character network ID — the member will still need authorization in ZeroTier Central or via a configured API token'}
            </p>

            <div className='mt-3 flex items-center gap-2'>
              <FormField
                control={form.control}
                name='networkId'
                render={({ field }) => (
                  <FormItem className='flex-1'>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='e.g. 8056c2e21c000001'
                        className='rounded-sm font-mono text-xs'
                        disabled={apiConfigured}
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
                onClick={handleGenerateCommands}
                className='shrink-0'
              >
                Generate Commands
              </Button>
            </div>
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
                Execute these on your server to install ZeroTier and join the
                network
              </p>

              <div className='space-y-3'>
                {generatedCommands.map((command, index) => (
                  <div key={index} className='space-y-2'>
                    <div className='flex items-center justify-between'>
                      <p className='text-foreground text-xs font-medium'>
                        Step {index + 1}:{' '}
                        {index === 0 ? 'Install ZeroTier' : 'Join the network'}
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

          {/* Authorize member */}
          <div className='bg-muted/30 rounded-lg border p-4'>
            <div className='flex items-center justify-between gap-3'>
              <div className='flex-1'>
                <div className='flex items-center gap-2'>
                  <LocateFixed className='text-muted-foreground h-4 w-4' />
                  <p className='text-foreground text-sm font-medium'>
                    Authorize Member
                  </p>
                </div>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {apiConfigured
                    ? 'After the server joins, find and authorize it here'
                    : 'No API token configured — authorize the member in ZeroTier Central, then enter its assigned IP below'}
                  {resolvedIp ? ` — resolved: ${resolvedIp}` : ''}
                </p>
              </div>
              {apiConfigured && (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => fetchMembers()}
                  disabled={isFetchingMembers}
                  className='shrink-0'
                >
                  {isFetchingMembers ? (
                    <>
                      <RefreshCw className='mr-2 h-3 w-3 animate-spin' />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className='mr-2 h-3 w-3' />
                      Refresh Members
                    </>
                  )}
                </Button>
              )}
            </div>

            {unauthorizedMembers.length > 0 && (
              <div className='mt-3 space-y-2'>
                {unauthorizedMembers.map(member => (
                  <div
                    key={member.nodeId}
                    className='bg-background flex items-center justify-between rounded border p-2'
                  >
                    <code className='text-xs'>{member.nodeId}</code>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      disabled={isAuthorizing}
                      onClick={() =>
                        authorizeMember({
                          nodeId: member.nodeId,
                          name: form.getValues('hostname'),
                        })
                      }
                    >
                      <CheckCircle className='mr-1 h-3 w-3' />
                      Authorize
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className='mt-3'>
              <FormField
                control={form.control}
                name='peerIp'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='text-xs'>
                      Mesh IP (auto-filled after authorization, or enter
                      manually)
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='e.g. 10.121.15.42'
                        className='rounded-sm font-mono text-xs'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                  Verify SSH connectivity over the ZeroTier network
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

export default ZeroTierForm
