'use client'

import { Button } from '../ui/button'
import { format, formatDistanceToNow } from 'date-fns'
import { Rocket, ServerCog, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { toast } from 'sonner'

import { cancelDeploymentAction } from '@/actions/deployment'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Deployment } from '@/payload-types'

const DeploymentTerminal = dynamic(() => import('./DeploymentTerminal'), {
  ssr: false,
})

const statusColor: Record<string, string> = {
  success: '#4ade80',
  building: '#facc15',
  queued: '#facc15',
  failed: '#f87171',
}

const DeploymentList = ({
  deployments,
  serverId,
  serviceId,
}: {
  deployments: (string | Deployment)[]
  serviceId: string
  serverId: string
}) => {
  const filteredDeployments = deployments.filter(
    deployment => typeof deployment !== 'string',
  )
  const router = useRouter()

  const { execute: cancelDeployment, isPending: isCancelling } = useAction(
    cancelDeploymentAction,
    {
      onSuccess: ({ data }) => {
        if (data?.success) {
          toast.success('Deployment cancelled')
          router.refresh()
        }
      },
      onError: ({ error }) => {
        toast.error(`Failed to cancel deployment: ${error.serverError}`)
        router.refresh()
      },
    },
  )

  return (
    <section className='space-y-4'>
      <div className='mb-4 flex items-center gap-1.5'>
        <Rocket />
        <h4 className='text-lg font-semibold'>Deployments</h4>
      </div>
      {filteredDeployments.length ? (
        <div className='divide-y divide-border rounded-md border border-border'>
          {filteredDeployments?.map(deploymentDetails => {
            const { id, status, createdAt, logs } = deploymentDetails
            const deployedLogs = Array.isArray(logs) ? logs : []

            return (
              <div
                key={id}
                className='hover:bg-muted/40 flex w-full items-center justify-between px-4 py-3 text-sm'>
                <div className='flex items-center gap-5'>
                  <span
                    className='w-20 text-xs font-semibold tracking-wide uppercase'
                    style={{
                      color: status ? statusColor[status] : undefined,
                    }}>
                    {status}
                  </span>

                  <div>
                    <p className='text-foreground'>{`# ${id.slice(0, 8)}`}</p>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <time className='text-muted-foreground text-xs'>
                            {`${formatDistanceToNow(new Date(createdAt), {
                              addSuffix: true,
                            })}`}
                          </time>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {format(new Date(createdAt), 'LLL d, yyyy h:mm a')}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                <div className='flex items-center gap-2'>
                  <DeploymentTerminal
                    logs={deployedLogs}
                    deployment={deploymentDetails}
                    serverId={serverId}
                    serviceId={serviceId}
                    live={status === 'building' || status === 'queued'}>
                    <Button variant='outline' size='sm'>
                      View logs
                    </Button>
                  </DeploymentTerminal>

                  {/* Only queued deployments can be cancelled; building holds
                      open SSH sessions that can't be killed safely (#279) */}
                  {status === 'queued' && (
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={isCancelling}
                      isLoading={isCancelling}
                      onClick={() => cancelDeployment({ deploymentId: id })}>
                      <X size={14} />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className='bg-muted/10 rounded-2xl border p-8 text-center shadow-xs'>
          <div className='grid min-h-[40vh] place-items-center'>
            <div>
              <div className='bg-muted mx-auto flex h-16 w-16 items-center justify-center rounded-full'>
                <ServerCog className='text-muted-foreground h-8 w-8 animate-pulse' />
              </div>

              <div className='my-4 space-y-1'>
                <h3 className='text-foreground text-xl font-semibold'>
                  No Deployments Found
                </h3>
                <p className='text-muted-foreground text-base'>
                  You haven’t added any deployments yet.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default DeploymentList
