'use client'

import XTermTerminal from '../XTermTerminal'
import { SquareTerminal } from 'lucide-react'
import React, { useEffect, useRef } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import useXterm from '@/hooks/use-xterm'
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
  const eventSourceRef = useRef<EventSource>(null)
  const previousLogsRef = useRef(false)
  const { terminalRef, writeLog, terminalInstance } = useXterm()

  useEffect(() => {
    // Finished deployments render persisted logs below; only live ones
    // need the SSE stream (which replays Redis history first, #311)
    if (!live || !terminalInstance) {
      return
    }

    const eventSource = new EventSource(
      `/api/server-events?serviceId=${serviceId}&serverId=${serverId}&deploymentId=${deploymentId}`,
    )

    eventSource.onmessage = event => {
      const data = JSON.parse(event.data) ?? {}
      const logs = data?.logs ?? []
      const updatedPreviousLogs = previousLogsRef.current

      if (data?.message) {
        const formattedLog = `${data?.message}`
        writeLog({ message: formattedLog })
      }

      if (!!logs?.length && !updatedPreviousLogs) {
        logs.forEach((log: any) => {
          writeLog({ message: `${log}` })
        })

        previousLogsRef.current = true
      }
    }

    eventSourceRef.current = eventSource

    return () => {
      eventSource.close()
    }
  }, [terminalInstance, live, serviceId, serverId, deploymentId, writeLog])

  useEffect(() => {
    if (!live && !!logs.length && terminalInstance) {
      if (terminalRef.current) {
        logs.forEach(log => {
          writeLog({ message: `${log}` })
        })
      }
    }
  }, [terminalInstance, logs, writeLog, live, terminalRef])

  return <XTermTerminal ref={terminalRef} />
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
