'use client'

import { ComingSoonBadge } from '../ComingSoonBadge'
import SidebarToggleButton from '../SidebarToggleButton'
import { AlertCircle, ChevronLeft, Cloud, Server } from 'lucide-react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import {
  type inferParserType,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs'
import React, { useId } from 'react'

import ManualSetupTabs from '@/components/security/ManualSetupTabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cloudProvidersList } from '@/lib/ui/integrationList'
import { SecurityGroup, SshKey } from '@/payload-types'
import { ServerType } from '@/payload-types-overrides'

import CreateEC2InstanceForm from './CreateEC2InstanceForm'
import CreateHetznerServerForm from './hetzner/CreateHetznerServerForm'

const parser = parseAsStringLiteral(['cloud', 'manual']).withDefault('cloud')

type ServerSetupType = inferParserType<typeof parser>

interface ServerFormContentProps {
  type: ServerSetupType
  option: string
  sshKeys: SshKey[]
  securityGroups?: SecurityGroup[]
  server?: ServerType
  formType?: 'create' | 'update'
  onBack: () => void
  isOnboarding: boolean
}

interface ServerSetupWizardProps {
  type: ServerSetupType
  option: string
  setOption: (option: string) => void
  sshKeys: SshKey[]
  securityGroups?: SecurityGroup[]
  server?: ServerType
  formType?: 'create' | 'update'
  isOnboarding: boolean
}

interface ServerFormProps {
  sshKeys: SshKey[]
  securityGroups?: SecurityGroup[]
  server?: ServerType
  formType?: 'create' | 'update'
}

// Get the actual server type (handle cloud providers)
const getActualServerType = (
  serverType: string,
  serverOption: string,
): string => {
  if (serverType === 'cloud') {
    return serverOption // For cloud providers, use the option (aws, gcp, etc.)
  }
  return serverType // For manual, etc.
}

// Get provider name based on type and option
const getProviderName = (
  serverType: string,
  serverOption: string,
): string => {
  const actualType = getActualServerType(serverType, serverOption)

  switch (actualType) {
    case 'manual':
      return 'Manual Server Configuration'
    case 'aws':
      return 'Configure AWS Server'
    case 'hetzner':
      return 'Configure Hetzner Cloud Server'
    case 'gcp':
      return 'Configure Google Cloud Server'
    case 'azure':
      return 'Configure Azure Server'
    default:
      const provider = cloudProvidersList.find(p => p.slug === actualType)
      return provider
        ? `Configure ${provider.label} Server`
        : 'Configure Server'
  }
}

const ServerFormContent: React.FC<ServerFormContentProps> = ({
  type,
  option,
  sshKeys,
  securityGroups,
  server,
  formType,
  onBack,
  isOnboarding,
}) => {
  const router = useRouter()
  const { organisation } = useParams()

  // Early return if no type is provided
  if (!type) {
    return (
      <div className='space-y-6'>
        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='icon'
            onClick={onBack}
            className='h-8 w-8'>
            <ChevronLeft className='h-5 w-5' />
          </Button>
          <h2 className='text-xl font-semibold'>No Server Type Selected</h2>
        </div>
        <Card className='border shadow-xs'>
          <CardContent className='p-6'>
            <Alert variant='warning'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>
                Please select a server type to continue with the configuration.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleSuccess = (data: any) => {
    if (isOnboarding) {
      router.push('/onboarding/dokku-install')
    } else {
      router.push(`/${organisation}/servers/${data?.server.id}`)
    }
  }

  const validateRequiredData = (serverType: string, serverOption: string) => {
    const actualType = getActualServerType(serverType, serverOption)

    switch (actualType) {
      case 'gcp':
      case 'azure':
        return {
          isValid: false,
          message: `${getProviderName(serverType, serverOption)} is coming soon.`,
          action: 'Please select a different server type or try AWS for now.',
        }

      case 'aws':
      case 'manual':
      default:
        break
    }

    return { isValid: true }
  }

  const renderFormComponent = (serverType: string, serverOption: string) => {
    const actualType = getActualServerType(serverType, serverOption)

    const formContent = (() => {
      switch (actualType) {
        case 'aws':
          return (
            <CreateEC2InstanceForm
              sshKeys={sshKeys}
              securityGroups={securityGroups}
              formType={formType}
              onSuccess={handleSuccess}
            />
          )

        case 'hetzner':
          return (
            <CreateHetznerServerForm
              sshKeys={sshKeys}
              formType={formType}
              onSuccess={handleSuccess}
            />
          )

        case 'manual':
          return (
            <ManualSetupTabs
              sshKeys={sshKeys}
              server={server}
              formType={formType}
              onSuccess={handleSuccess}
            />
          )

        case 'gcp':
        case 'azure':
          return (
            <Alert variant='warning'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>
                <div className='space-y-2'>
                  <p className='font-medium'>
                    {getProviderName(serverType, serverOption)} is coming soon!
                  </p>
                  <p className='text-sm'>
                    We're working hard to bring you this integration. For now,
                    you can use AWS or manual configuration.
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )

        default:
          return (
            <Alert variant='warning'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>
                Configuration for {getProviderName(serverType, serverOption)} is
                not yet implemented. Please select a different server type.
              </AlertDescription>
            </Alert>
          )
      }
    })()

    return <div className='space-y-4'>{formContent}</div>
  }

  const providerName = getProviderName(type, option)
  const validation = validateRequiredData(type, option)

  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-2'>
        {type !== 'manual' && (
          <Button
            variant='ghost'
            size='icon'
            onClick={onBack}
            className='h-8 w-8'>
            <ChevronLeft className='h-5 w-5' />
          </Button>
        )}
        <h2 className='text-xl font-semibold'>{providerName}</h2>
      </div>

      {!validation.isValid ? (
        <Card className='border shadow-xs'>
          <CardContent className='p-6'>
            <div className='space-y-4'>
              <Alert variant='warning'>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>
                  <div className='space-y-2'>
                    <p className='font-medium'>{validation.message}</p>
                    <p className='text-sm'>{validation.action}</p>
                  </div>
                </AlertDescription>
              </Alert>

              <div className='flex justify-center'>
                <Button variant='outline' onClick={onBack} className='gap-2'>
                  <ChevronLeft className='h-4 w-4' />
                  Go Back to Selection
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : type === 'manual' && option === 'manual' ? (
        renderFormComponent(type, option)
      ) : (
        <Card className='border shadow-xs'>
          <CardContent className='p-6'>
            {renderFormComponent(type, option)}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

const ServerSetupWizard: React.FC<ServerSetupWizardProps> = ({
  type,
  setOption,
  option,
  isOnboarding,
  sshKeys,
  formType,
  securityGroups,
  server,
}) => {
  const id = useId()

  const handleBack = () => {
    setOption('')
  }

  if (type && option) {
    return (
      <ServerFormContent
        isOnboarding={isOnboarding}
        onBack={handleBack}
        option={option}
        sshKeys={sshKeys}
        type={type}
        formType={formType}
        securityGroups={securityGroups}
        server={server}
      />
    )
  }

  return type === 'cloud' ? (
    <Card className='border shadow-xs'>
      <CardHeader className='pb-0'>
        <CardTitle className='flex items-center text-lg font-medium'>
          Cloud Providers
          <SidebarToggleButton directory='servers' fileName='add-server' />
        </CardTitle>
      </CardHeader>
      <CardContent className='p-6'>
        <RadioGroup
          className='grid grid-cols-1 gap-6'
          value={option}
          onValueChange={(value: string) => {
            setOption(value)
          }}>
          {cloudProvidersList.map(provider => {
            const { label, Icon, live, slug } = provider

            return (
              <ComingSoonBadge position='top-right' hideBadge={live} key={slug}>
                <label
                  htmlFor={`${id}-${slug}`}
                  className={`relative flex w-full items-start rounded-md border ${
                    option === slug ? 'border-primary border-2' : 'border-input'
                  } p-4 transition-all duration-200 ${
                    !live
                      ? 'cursor-not-allowed opacity-60'
                      : 'hover:border-primary/50 cursor-pointer'
                  }`}>
                  <RadioGroupItem
                    value={slug}
                    id={`${id}-${slug}`}
                    disabled={!live}
                    className='sr-only'
                  />
                  <div className='flex grow items-center gap-4'>
                    <div className='bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full'>
                      {Icon && <Icon className='h-5 w-5' />}
                    </div>

                    <div>
                      <Label
                        htmlFor={`${id}-${slug}`}
                        className='cursor-pointer font-medium'>
                        {label}
                      </Label>
                    </div>
                  </div>
                </label>
              </ComingSoonBadge>
            )
          })}
        </RadioGroup>
      </CardContent>
    </Card>
  ) : type === 'manual' ? (
    <ServerFormContent
      isOnboarding={isOnboarding}
      onBack={handleBack}
      option={option}
      sshKeys={sshKeys}
      type={type}
      formType={formType}
      securityGroups={securityGroups}
      server={server}
    />
  ) : null
}

const ServerForm: React.FC<ServerFormProps> = ({
  sshKeys,
  securityGroups,
  server,
  formType,
}) => {
  const [type, setType] = useQueryState('type', parser)

  const [option, setOption] = useQueryState(
    'option',
    parseAsString.withDefault(''),
  )

  const pathName = usePathname()
  const isOnboarding = pathName.includes('onboarding')

  const handleCloudType = (type: ServerSetupType) => {
    setType(type)
    setOption('')
  }

  return (
    <section className='space-y-8'>
      {!isOnboarding && (
        <div className='flex items-center justify-between'>
          <div>
            <h2 className='text-2xl font-semibold'>
              Choose a Deployment Option
            </h2>
            <p className='text-muted-foreground mt-1'>
              Connect a cloud provider or add server details manually
            </p>
          </div>
        </div>
      )}
      <RadioGroup
        value={type ?? 'manual'}
        onValueChange={handleCloudType}
        className='grid grid-cols-1 gap-6 md:grid-cols-2'>
        <label
          htmlFor={'cloud'}
          className={`relative flex items-start rounded-md border ${
            type === 'cloud'
              ? 'border-primary/80 bg-primary/10'
              : 'border-input'
          } hover:border-primary/50 cursor-pointer p-4 transition-all duration-300`}>
          <RadioGroupItem value={'cloud'} id={'cloud'} className='sr-only' />

          <div className='flex grow items-center gap-4'>
            <div className='bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full'>
              <Cloud className='h-5 w-5' />
            </div>
            <div>
              <Label
                htmlFor='cloud'
                className='text-md cursor-pointer font-semibold'>
                Connect Cloud Provider
              </Label>
            </div>
          </div>
        </label>
        <label
          htmlFor={'manual'}
          className={`relative flex items-start rounded-md border ${
            type === 'manual'
              ? 'border-primary/80 bg-primary/10'
              : 'border-input'
          } hover:border-primary/50 cursor-pointer p-4 transition-all duration-300`}>
          <RadioGroupItem value={'manual'} id={'manual'} className='sr-only' />

          <div className='flex grow items-center gap-4'>
            <div className='bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full'>
              <Server className='h-5 w-5' />
            </div>
            <Label
              htmlFor='manual'
              className='text-md cursor-pointer font-semibold'>
              Add Server Manually
            </Label>
          </div>
        </label>
      </RadioGroup>
      <ServerSetupWizard
        isOnboarding={isOnboarding}
        sshKeys={sshKeys}
        formType={formType}
        securityGroups={securityGroups}
        type={type}
        setOption={setOption}
        option={option}
        server={server}
      />
    </section>
  )
}

export default ServerForm
