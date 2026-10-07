const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g
const TS_RE =
  /^(?:(\d{4}-\d{2}-\d{2})[T ])?(\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*(?:Z|UTC|GMT)?\s*(?:\[[^\]]*\])?\s*:?\s*/

export type Severity = 'error' | 'warn' | 'info' | 'debug' | 'plain'

export interface LogRow {
  id: number
  timestamp: string
  severity: Severity
  message: string
}

const MAX_ROWS = 3000

let rowSeq = 0

export const parseLogLine = (raw: string): Omit<LogRow, 'id'> | null => {
  const line = raw.replace(ANSI_RE, '').replace(/\r/g, '')
  if (!line.trim()) return null

  let timestamp = ''
  let message = line
  const tsMatch = line.match(TS_RE)
  if (tsMatch) {
    timestamp = `${tsMatch[1] ?? ''} ${tsMatch[2]}`.trim()
    message = line.slice(tsMatch[0].length) || ' '
  }

  let severity: Severity = 'plain'
  if (
    /\b(ERROR|FATAL|CRITICAL|SEVERE|PANIC|failed|exit code [1-9])\b/i.test(
      message,
    )
  ) {
    severity = 'error'
  } else if (/\b(WARN|WARNING)\b/i.test(message)) {
    severity = 'warn'
  } else if (/\b(DEBUG|TRACE)\b/i.test(message)) {
    severity = 'debug'
  } else if (/\b(INFO|LOG|NOTICE)\b/i.test(message)) {
    severity = 'info'
  }

  return { timestamp, severity, message }
}

export const toRows = (lines: string[]): LogRow[] =>
  lines
    // SSE chunks may carry several lines (or partial tails) — explode first
    .flatMap(line => `${line}`.split('\n'))
    .map(line => {
      const parsed = parseLogLine(line)
      return parsed ? { ...parsed, id: rowSeq++ } : null
    })
    .filter((row): row is LogRow => row !== null)
    .slice(-MAX_ROWS)
