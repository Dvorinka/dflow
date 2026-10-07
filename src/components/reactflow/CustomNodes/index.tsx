import { ServiceNode } from '../types'
import { Handle, Position } from '@xyflow/react'
import { Clock, Hammer, Moon, Package2 } from 'lucide-react'
import { JSX, useEffect, useState } from 'react'

import { serviceIcon } from '@/components/service/serviceIcon'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getSessionValue } from '@/lib/auth/getSessionValue'
import { useArchitectureContext } from '@/providers/ArchitectureProvider'

const statusLine: Record<
  string,
  { label: string; color: string; icon?: JSX.Element }
> = {
  success: { label: 'Online', color: '#4ade80' },
  building: { label: 'Building', color: '#facc15', icon: <Hammer size={13} /> },
  queued: { label: 'Queued', color: '#facc15', icon: <Clock size={13} /> },
  failed: { label: 'Failed', color: '#f87171' },
  sleeping: {
    label: 'Sleeping',
    color: '#4ade80',
    icon: <Moon size={13} />,
  },
  none: { label: 'No deployment', color: '#71717a', icon: <Moon size={13} /> },
  disabled: { label: 'Node disabled', color: '#71717a' },
}

const CustomNode = ({
  data,
  menuOptions,
}: {
  data: ServiceNode & { onClick?: () => void; disableNode?: boolean }
  menuOptions?: (node: any) => React.ReactNode
}) => {
  const deployment = data?.deployments?.[0]
  const isDisabled = !!data.disableNode

  const [nodeId, setNodeId] = useState<string | null>()
  useEffect(() => {
    const nodeId = getSessionValue('nodeId')
    setNodeId(nodeId)
  }, [])

  const architectureContext = function useSafeArchitectureContext() {
    try {
      return useArchitectureContext()
    } catch (e) {
      return null
    }
  }

  const subtitle =
    data?.domains?.[0]?.domain ||
    data?.githubSettings?.repository ||
    data?.gitlabSettings?.repository ||
    data?.giteaSettings?.repository ||
    data?.bitbucketSettings?.repository ||
    data?.azureSettings?.repository ||
    data?.dockerDetails?.url ||
    (data?.type === 'database' ? data?.databaseDetails?.type : undefined)

  const statusKey = isDisabled
    ? 'disabled'
    : deployment?.status === 'success'
      ? 'success'
      : deployment?.status === 'building'
        ? 'building'
        : deployment?.status === 'queued'
          ? 'queued'
          : deployment?.status === 'failed'
            ? 'failed'
            : 'none'

  const status = statusLine[statusKey]

  const StatusLine = () => (
    <div className='flex items-center gap-1.5'>
      {status.icon ? (
        <span style={{ color: status.color }}>{status.icon}</span>
      ) : (
        <span
          className='h-[7px] w-[7px] rounded-full'
          style={{ background: status.color }}
        />
      )}
      <span className='text-sm' style={{ color: status.color }}>
        {status.label}
      </span>
    </div>
  )

  return (
    <div className='w-64 cursor-pointer'>
      <Handle
        type='source'
        style={{
          opacity: 0,
          width: 10,
          height: 10,
          pointerEvents: 'none',
        }}
        position={Position.Left}
      />

      <Card
        onClick={() => {
          if (architectureContext()?.isDeploying || isDisabled) {
            return
          }

          data?.onClick?.()
        }}
        className={`relative z-10 h-full min-h-20 backdrop-blur-md ${
          isDisabled
            ? 'cursor-not-allowed opacity-70'
            : nodeId === data.id
              ? 'bg-primary/5 border-primary shadow-md'
              : 'hover:border-primary/50 hover:bg-primary/5 cursor-pointer hover:shadow-md'
        }`}>
        {/* {menuOptions && menuOptions(data)} */}
        <CardHeader className='w-64 flex-row justify-between gap-0 pb-2'>
          <div className='flex min-w-0 items-center gap-x-3'>
            <span className='shrink-0'>{serviceIcon(data)}</span>

            <div className='min-w-0 flex-1'>
              <CardTitle
                className='line-clamp-1 text-[15px] font-semibold'
                title={data.displayName ? data.displayName : data.name}>
                {data.displayName ? data.displayName : data.name}
              </CardTitle>
              {subtitle && (
                <p
                  className='text-muted-foreground line-clamp-1 text-xs'
                  title={subtitle}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className='pt-0 pb-3'>
          <StatusLine />
        </CardContent>
      </Card>
      {data.volumes && data.volumes.length > 0 && (
        <div className='bg-muted/30 text-muted-foreground z-0 -mt-6 w-full items-start gap-x-2 rounded-md border px-2 pt-8 pb-2 text-sm backdrop-blur-xs'>
          <div className='flex items-center justify-between gap-x-2'>
            <div className='inline-flex items-center gap-x-2 overflow-hidden'>
              <span className='shrink-0'>
                <Package2 size={16} />
              </span>

              <span className='truncate break-all'>
                {data.volumes[0].containerPath}
              </span>
            </div>

            {data.volumes.length > 1 && (
              <span className='text-primary-foreground justify-end whitespace-nowrap'>
                +{data.volumes.length - 1}
              </span>
            )}
          </div>
        </div>
      )}

      <Handle
        type='target'
        style={{
          opacity: 0,
          width: 10,
          height: 10,
          pointerEvents: 'none',
        }}
        position={Position.Right}
      />
    </div>
  )
}

export default CustomNode
