'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form'
import { Input } from '../ui/input'
import { MultiSelect } from '../ui/multi-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Textarea } from '../ui/textarea'
import { useAction } from 'next-safe-action/hooks'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
  updateEC2InstanceAction,
  upgradeEC2InstanceTypeAction,
} from '@/actions/cloud/aws'
import { instanceTypes } from '@/lib/constants'
import { SecurityGroup, Server } from '@/payload-types'

type UpdateEC2InstanceFormValues = {
  name: string
  description: string
  securityGroupIds: string[]
}

type UpdateEC2InstanceFormProps = {
  server: Server
  securityGroups?: SecurityGroup[]
  onSuccess?: () => void
}

const UpdateEC2InstanceForm = ({
  server,
  securityGroups = [],
}: UpdateEC2InstanceFormProps) => {
  // Convert security groups from the server to the expected format
  const getInitialSecurityGroups = () => {
    if (!server.awsEc2Details?.securityGroups) return []

    return Array.isArray(server.awsEc2Details.securityGroups)
      ? server.awsEc2Details.securityGroups.map(sg =>
          typeof sg === 'string' ? sg : sg.id,
        )
      : []
  }

  // Initialize form with defaults from server
  const form = useForm<UpdateEC2InstanceFormValues>({
    defaultValues: {
      name: server.name || '',
      description: server.description || '',
      securityGroupIds: getInitialSecurityGroups(),
    },
  })

  const [resizeType, setResizeType] = useState('')

  // Use the useAction hook for the update action
  const { execute: updateEC2Instance, isPending: updatingEC2Instance } =
    useAction(updateEC2InstanceAction, {
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('EC2 instance updated successfully')
        }
      },
      onError: ({ error }) => {
        toast.error(`Failed to update EC2 instance: ${error.serverError}`)
      },
    })

  const { execute: resizeInstance, isPending: resizingInstance } = useAction(
    upgradeEC2InstanceTypeAction,
    {
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success(`Instance resized to ${resizeType}`)
          setResizeType('')
        }
      },
      onError: ({ error }) => {
        toast.error(`Failed to resize instance: ${error.serverError}`)
      },
    },
  )

  const onSubmit = (values: UpdateEC2InstanceFormValues) => {
    updateEC2Instance({
      serverId: server.id,
      instanceId: server.awsEc2Details?.instanceId || '',
      accountId: (typeof server.cloudProviderAccount === 'object'
        ? server.cloudProviderAccount?.id
        : server.cloudProviderAccount) as string,
      name: values.name,
      description: values.description,
      securityGroupsIds: values.securityGroupIds,
    })
  }

  // Filter security groups to make sure we only show valid ones
  const filteredSecurityGroups = securityGroups.filter(sg => sg.id)

  // Format timestamp to readable date
  const formatDate = (timestamp: string | undefined | null) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp).toLocaleString()
  }

  // Get security group details
  const getSecurityGroupDetails = () => {
    if (!server.awsEc2Details?.securityGroups) return []

    return Array.isArray(server.awsEc2Details.securityGroups)
      ? server.awsEc2Details.securityGroups.map(sg => {
          if (typeof sg === 'string') {
            const foundGroup = securityGroups.find(group => group.id === sg)
            return (
              foundGroup || {
                id: sg,
                name: sg,
                description: 'Unknown security group',
              }
            )
          }
          return sg
        })
      : []
  }

  return (
    <div className='bg-muted/30 space-y-6 rounded p-4'>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
          {/* Basic Information - Editable */}
          <div className='space-y-2'>
            <h3 className='text-lg font-medium'>Basic Information</h3>

            <div className='space-y-4'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Server Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter server name' {...field} />
                    </FormControl>
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
                      <Textarea
                        placeholder='Enter server description'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Security Section - Editable and Non-editable fields */}
          <div className='space-y-2'>
            <h3 className='text-lg font-medium'>Security</h3>

            {/* SSH Key - Non-editable */}
            <FormItem>
              <FormLabel>SSH Key</FormLabel>
              <div className='flex items-center space-x-2'>
                <div className='flex-1'>
                  <Input
                    value={
                      typeof server.sshKey === 'string'
                        ? server.sshKey
                        : server.sshKey?.name || 'N/A'
                    }
                    disabled
                    className='bg-muted'
                  />
                </div>
              </div>
              <p className='text-muted-foreground mt-1 text-xs'>
                SSH keys cannot be updated after instance creation
              </p>
            </FormItem>

            {/* Security Groups */}
            <FormField
              control={form.control}
              name='securityGroupIds'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Security Groups</FormLabel>
                  <div className='flex items-center space-x-2'>
                    <div className='flex-1'>
                      <MultiSelect
                        options={(filteredSecurityGroups || [])?.map(
                          ({ name, id }) => ({
                            label: name,
                            value: id,
                          }),
                        )}
                        onValueChange={field.onChange}
                        defaultValue={field.value || []}
                        placeholder={
                          !filteredSecurityGroups ||
                          filteredSecurityGroups.length === 0
                            ? 'No security groups available'
                            : 'Select security groups'
                        }
                        className='w-full'
                      />
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Accordion for detailed instance information - Read Only */}
          <Accordion type='single' collapsible className='w-full'>
            <AccordionItem value='instance-details'>
              <AccordionTrigger className='text-lg font-medium'>
                Instance Details
              </AccordionTrigger>
              <AccordionContent>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <FormLabel>Instance ID</FormLabel>
                    <Input
                      value={server.awsEc2Details?.instanceId || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>

                  <div>
                    <FormLabel>Region</FormLabel>
                    <Input
                      value={server.awsEc2Details?.region || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>
                </div>

                <div className='mt-4 grid grid-cols-2 gap-4'>
                  <div>
                    <FormLabel>Instance Type</FormLabel>
                    <Input
                      value={server.awsEc2Details?.instanceType || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>

                  <div>
                    <FormLabel>Public IP Address</FormLabel>
                    <Input
                      value={
                        server.awsEc2Details?.publicIpAddress ||
                        server.ip ||
                        'N/A'
                      }
                      disabled
                      className='bg-muted'
                    />
                  </div>
                </div>

                <div className='mt-4 grid grid-cols-2 gap-4'>
                  <div>
                    <FormLabel>Private IP Address</FormLabel>
                    <Input
                      value={server.awsEc2Details?.privateIpAddress || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>

                  <div>
                    <FormLabel>Key Name</FormLabel>
                    <Input
                      value={server.awsEc2Details?.keyName || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>
                </div>

                <div className='mt-4 grid grid-cols-2 gap-4'>
                  <div>
                    <FormLabel>AMI ID</FormLabel>
                    <Input
                      value={server.awsEc2Details?.imageId || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>

                  <div>
                    <FormLabel>Architecture</FormLabel>
                    <Input
                      value={server.awsEc2Details?.architecture || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>
                </div>

                <div className='mt-4 grid grid-cols-2 gap-4'>
                  <div>
                    <FormLabel>State</FormLabel>
                    <Input
                      value={server.awsEc2Details?.state || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>

                  <div>
                    <FormLabel>Disk Size</FormLabel>
                    <Input
                      value={
                        server.awsEc2Details?.diskSize
                          ? `${server.awsEc2Details.diskSize} GB`
                          : 'N/A'
                      }
                      disabled
                      className='bg-muted'
                    />
                  </div>
                </div>

                <div className='mt-4 grid grid-cols-2 gap-4'>
                  <div>
                    <FormLabel>Launch Time</FormLabel>
                    <Input
                      value={formatDate(server.awsEc2Details?.launchTime)}
                      disabled
                      className='bg-muted'
                    />
                  </div>

                  <div>
                    <FormLabel>Username</FormLabel>
                    <Input
                      value={server.username || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value='network-details'>
              <AccordionTrigger className='text-lg font-medium'>
                Network Details
              </AccordionTrigger>
              <AccordionContent>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <FormLabel>VPC ID</FormLabel>
                    <Input
                      value={server.awsEc2Details?.vpcId || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>

                  <div>
                    <FormLabel>Subnet ID</FormLabel>
                    <Input
                      value={server.awsEc2Details?.subnetId || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>
                </div>

                <div className='mt-4 grid grid-cols-2 gap-4'>
                  <div>
                    <FormLabel>Public DNS Name</FormLabel>
                    <Input
                      value={server.awsEc2Details?.publicDnsName || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>

                  <div>
                    <FormLabel>Private DNS Name</FormLabel>
                    <Input
                      value={server.awsEc2Details?.privateDnsName || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>
                </div>

                <div className='mt-4'>
                  <FormLabel>SSH Port</FormLabel>
                  <Input
                    value={server?.port?.toString() || '22'}
                    disabled
                    className='bg-muted'
                  />
                </div>

                {server.domains && server.domains.length > 0 && (
                  <div className='mt-4'>
                    <FormLabel>Domains</FormLabel>
                    <div className='mt-1 flex flex-wrap gap-2'>
                      {server.domains.map((domain, index) => (
                        <Badge
                          key={index}
                          variant={domain.default ? 'default' : 'outline'}>
                          {domain.domain} {domain.default && '(Default)'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value='metadata'>
              <AccordionTrigger className='text-lg font-medium'>
                Instance Metadata
              </AccordionTrigger>
              <AccordionContent>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <FormLabel>Created At</FormLabel>
                    <Input
                      value={formatDate(server.createdAt)}
                      disabled
                      className='bg-muted'
                    />
                  </div>

                  <div>
                    <FormLabel>Last Updated</FormLabel>
                    <Input
                      value={formatDate(server.updatedAt)}
                      disabled
                      className='bg-muted'
                    />
                  </div>
                </div>

                <div className='mt-4 grid grid-cols-2 gap-4'>
                  <div>
                    <FormLabel>Provider</FormLabel>
                    <Input
                      value={server.provider.toUpperCase() || 'N/A'}
                      disabled
                      className='bg-muted'
                    />
                  </div>

                  <div>
                    <FormLabel>Onboarded</FormLabel>
                    <Input
                      value={server.onboarded ? 'Yes' : 'No'}
                      disabled
                      className='bg-muted'
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Resize (#365): stop → modify type → start. Separate action
              because it takes the instance offline briefly. */}
          <div className='space-y-2'>
            <h3 className='text-lg font-medium'>Resize Instance</h3>
            <p className='text-muted-foreground text-xs'>
              AWS stops the instance while the type is applied and starts it
              again — expect a few minutes of downtime.
            </p>
            <div className='flex items-center gap-2'>
              <div className='flex-1'>
                <Select value={resizeType} onValueChange={setResizeType}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={`Current: ${server.awsEc2Details?.instanceType || 'unknown'}`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {instanceTypes.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={
                      resizingInstance ||
                      !resizeType ||
                      resizeType === server.awsEc2Details?.instanceType
                    }>
                    {resizingInstance ? 'Resizing...' : 'Resize'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Resize instance to {resizeType}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      The instance is stopped while AWS applies the new type,
                      then started automatically. Services are unavailable
                      during the stop/start window.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        resizeInstance({
                          serverId: server.id,
                          instanceType: resizeType,
                        })
                      }>
                      Resize
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className='flex justify-end space-x-2 pt-4'>
            <Button type='submit' disabled={updatingEC2Instance}>
              {updatingEC2Instance ? 'Updating...' : 'Update Instance'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

export default UpdateEC2InstanceForm
