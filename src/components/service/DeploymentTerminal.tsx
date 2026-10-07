'use client'

import { SquareTerminal } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

import LogTable from '@/components/service/LogTable'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Deployment } from '@/payload-types'

const TerminalContent = ({
  logs,
  serviceId,
  serverId,
  deploymentId,
  live,
}: {
  serviceId: string
  serverId: string
  logs: unknown[]
  deploymentId: string
  live: boolean
}) => {
  const previousLogsRef = useRef(false)
  const tailRef = useRef('')
  const [lines, setLines] = useState<string[]>([])
  const [streaming, setStreaming] = useState<boolean | undefined>(undefined)
  const [status, setStatus] = useState('')

  useEffect(() => {
    // Finished deployments render persisted logs below; only live ones
    // need the SSE stream (which replays Redis history first, #311)
    if (!live) {
      return
    }

    const eventSource = new EventSource(
      `/api/server-events?serviceId=${serviceId}&serverId=${serverId}&deploymentId=${deploymentId}`,
    )

    eventSource.onmessage = event => {
      let data: { message?: unknown; logs?: unknown[] } = {}
      try {
        data = JSON.parse(event.data) ?? {}
      } catch {
        data = { message: event.data }
      }
      const replayed = data?.logs ?? []
      const updatedPreviousLogs = previousLogsRef.current

      setStreaming(true)

      if (data?.message) {
        const text = tailRef.current + `${data.message}`
        const parts = text.split('\n')
        tailRef.current = parts.pop() ?? ''
        if (parts.length) {
          setLines(previous => [...previous.slice(-2999), ...parts])
        }
      }

      if (!!replayed?.length && !updatedPreviousLogs) {
        setLines(previous => [
          ...replayed.map((log: unknown) => `${log}`),
          ...previous,
        ])
        previousLogsRef.current = true
      }
    }

    eventSource.onerror = () => {
      setStreaming(false)
    }

    return () => {
      eventSource.close()
    }
  }, [live, serviceId, serverId, deploymentId])

  useEffect(() => {
    if (!live && !!logs.length) {
      setLines(logs.map(log => `${log}`))
      setStreaming(undefined)
      setStatus('')
    }
  }, [logs, live])

  return (
    <div className='flex h-[60vh] flex-col'>
      <LogTable
        lines={lines}
        streaming={live ? streaming : undefined}
        status={status}
        emptyTitle='No deployment logs'
        emptyDescription='This deployment has not produced any log output.'
      />
    </div>
  )
}

const DeploymentTerminal = ({
  children,
  deployment,
  serviceId,
  serverId,
  logs,
  live,
}: {
  children: React.ReactNode
  deployment: Deployment
  serviceId: string
  serverId: string
  logs: unknown[]
  live: boolean
}) => {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className='w-full max-w-5xl'>
        <DialogHeader>
          <DialogTitle className='mb-2 flex items-center gap-2'>
            <SquareTerminal />
            Deployment Logs
          </DialogTitle>

          <DialogDescription className='sr-only'>
            These are deployment logs of {deployment.id}
          </DialogDescription>
        </DialogHeader>

        <TerminalContent
          serverId={serverId}
          serviceId={serviceId}
          logs={logs}
          deploymentId={deployment.id}
          live={live}
        />
      </DialogContent>
    </Dialog>
  )
}

export default DeploymentTerminal
