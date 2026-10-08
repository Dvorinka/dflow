'use client'

import { useEffect, useRef, useState } from 'react'

import LogTable from '@/components/service/LogTable'

const LogsTab = ({
  serverId,
  serviceId,
}: {
  serverId: string
  serviceId: string
}) => {
  const eventSourceRef = useRef<EventSource | null>(null)
  const tailRef = useRef('')
  const [lines, setLines] = useState<string[]>([])
  const [streaming, setStreaming] = useState<boolean | undefined>(undefined)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (eventSourceRef.current) {
      return
    }

    const eventSource = new EventSource(
      `/api/logs?serviceId=${serviceId}&serverId=${serverId}`,
    )

    eventSource.onmessage = event => {
      let data: {
        message?: unknown
        error?: unknown
        status?: unknown
        live?: unknown
      } = {}
      try {
        data = JSON.parse(event.data) ?? {}
      } catch {
        data = { message: event.data }
      }

      if (data?.error) {
        setStreaming(false)
        setStatus(`${data.error}`)
        return
      }

      // Connection lifecycle messages are status, not log rows
      if (data?.status) {
        setStatus(`${data.status}`)
        if (data.live) {
          setStreaming(true)
        }
        return
      }

      if (data?.message) {
        const message = `${data.message}`

        // Chunks split mid-line; hold the partial tail for the next chunk
        const text = tailRef.current + message
        const parts = text.split('\n')
        tailRef.current = parts.pop() ?? ''
        if (parts.length) {
          setLines(previous => [...previous.slice(-2999), ...parts])
        }
      }
    }

    eventSource.onerror = () => {
      setStreaming(false)
    }

    eventSourceRef.current = eventSource

    // On component unmount close the event source
    return () => {
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [serviceId, serverId])

  return <LogTable lines={lines} streaming={streaming} status={status} />
}

export default LogsTab
