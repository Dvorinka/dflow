'use client'

import {
  ArrowDownToLine,
  ArrowUpToLine,
  Download,
  FileText,
  Pause,
  Play,
  Search,
} from 'lucide-react'
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import {
  type LogRow,
  type Severity,
  parseLogLine,
  toRows,
} from './logParse'

export { parseLogLine, toRows }
export type { LogRow, Severity }

const severityText: Record<Severity, string | undefined> = {
  error: '#e08a7c',
  warn: '#be7f4b',
  info: undefined,
  debug: undefined,
  plain: undefined,
}

const severityBar: Record<Severity, string> = {
  error: '#e08a7c',
  warn: '#be7f4b',
  info: '#346de7',
  debug: '#3f3f46',
  plain: 'transparent',
}

const timeZoneLabel = () => {
  const offset = -new Date().getTimezoneOffset() / 60
  return `GMT${offset >= 0 ? '+' : ''}${offset}`
}

const highlightSeverity = (message: string, severity: Severity) => {
  const match = message.match(
    /\b(ERROR|FATAL|CRITICAL|SEVERE|PANIC|WARN|WARNING|INFO|DEBUG|TRACE|LOG|NOTICE)\b/,
  )
  if (!match || match.index === undefined) {
    return <span style={{ color: severityText[severity] }}>{message}</span>
  }
  const color = severityText[severity]
  return (
    <>
      {message.slice(0, match.index)}
      <span style={{ color }}>{match[0]}</span>
      <span>{message.slice(match.index + match[0].length)}</span>
    </>
  )
}

const LogTable = ({
  lines,
  streaming,
  status,
  emptyTitle = 'No logs yet',
  emptyDescription = 'Logs will appear here once output is produced.',
}: {
  lines: string[]
  streaming?: boolean
  status?: string
  emptyTitle?: string
  emptyDescription?: string
}) => {
  const [filter, setFilter] = useState('')
  const [paused, setPaused] = useState(false)
  const [buffer, setBuffer] = useState<LogRow[]>([])
  const [heldLines, setHeldLines] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)

  const serialized = useMemo(() => {
    const source = paused ? heldLines : lines
    return toRows(source)
  }, [lines, paused, heldLines])

  useEffect(() => {
    if (paused) {
      setHeldLines(lines)
    }
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setBuffer(serialized)
  }, [serialized])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return buffer
    return buffer.filter(
      row =>
        row.message.toLowerCase().includes(q) ||
        row.timestamp.includes(q),
    )
  }, [buffer, filter])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    followRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el && followRef.current && !paused) {
      el.scrollTop = el.scrollHeight
    }
  }, [filtered.length, paused])

  const download = () => {
    const text = filtered
      .map(row => `${row.timestamp} ${row.message}`.trim())
      .join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs-${new Date().toISOString().slice(0, 19)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cell: CSSProperties = { display: 'flex', minWidth: 0 }

  return (
    <div className='relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-[#1a1922]'>
      {/* Toolbar */}
      <div className='flex items-center gap-2 border-b border-border px-2 py-1.5'>
        <div className='relative min-w-0 flex-1'>
          <Search className='text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2' />
          <Input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder='Filter and search logs'
            className='h-8 border-transparent bg-transparent pl-8 font-mono text-xs shadow-none focus-visible:ring-0 focus-visible:border-border'
          />
        </div>

        {streaming !== undefined && (
          <span className='text-muted-foreground flex items-center gap-1.5 px-1 text-xs'>
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                streaming ? 'animate-pulse bg-emerald-500' : 'bg-zinc-500',
              )}
            />
            {streaming ? 'Live' : 'Offline'}
          </span>
        )}

        {status && (
          <span className='text-muted-foreground max-w-48 truncate px-1 text-xs'>
            {status}
          </span>
        )}

        <button
          type='button'
          onClick={() => setPaused(value => !value)}
          title={paused ? 'Resume stream' : 'Pause stream'}
          className='text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1.5'>
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>

        <button
          type='button'
          onClick={download}
          title='Download logs'
          className='text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1.5'>
          <Download size={15} />
        </button>
      </div>

      {/* Column header */}
      <div
        className='text-muted-foreground grid border-b border-border px-3 py-1.5 font-mono text-[11px]'
        style={{ gridTemplateColumns: '172px 1fr' }}>
        <span>Time ({timeZoneLabel()})</span>
        <span className='pl-2'>Data</span>
      </div>

      {/* Rows */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className='relative min-h-0 flex-1 overflow-y-auto overscroll-contain font-mono text-xs leading-[18px]'>
        {filtered.length === 0 ? (
          <div className='flex h-full min-h-40 flex-col items-center justify-center gap-2 py-10 text-center'>
            <FileText className='text-muted-foreground/50 h-8 w-8' strokeWidth={1.5} />
            <p className='text-foreground text-sm font-semibold'>{emptyTitle}</p>
            <p className='text-muted-foreground max-w-64 text-xs'>
              {emptyDescription}
            </p>
          </div>
        ) : (
          filtered.map(row => (
            <div
              key={row.id}
              className='grid hover:bg-white/[0.04]'
              style={{ gridTemplateColumns: '172px 1fr' }}>
              <div
                className='flex items-stretch pr-2 pl-2 select-none'
                style={cell}>
                <span
                  className='mr-2 w-[3px] shrink-0 self-stretch rounded-full'
                  style={{ background: severityBar[row.severity] }}
                />
                <span className='truncate py-1 text-[#a1a0ab] tabular-nums'>
                  {row.timestamp || '—'}
                </span>
              </div>
              <div className='py-1 pr-3 pl-2 break-all whitespace-pre-wrap text-[#f7f7f8]'>
                {highlightSeverity(row.message, row.severity)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Scroll shortcuts */}
      <div className='absolute right-4 bottom-4 flex flex-col gap-1.5'>
        <button
          type='button'
          title='Scroll to top'
          onClick={() => {
            followRef.current = false
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className='bg-background/80 text-muted-foreground hover:text-foreground rounded-md border border-border p-1.5 backdrop-blur'>
          <ArrowUpToLine size={14} />
        </button>
        <button
          type='button'
          title='Scroll to bottom'
          onClick={() => {
            followRef.current = true
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: 'smooth',
            })
          }}
          className='bg-background/80 text-muted-foreground hover:text-foreground rounded-md border border-border p-1.5 backdrop-blur'>
          <ArrowDownToLine size={14} />
        </button>
      </div>
    </div>
  )
}

export default LogTable
