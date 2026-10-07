import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseLogLine, toRows } from '../src/components/service/logParse'

describe('parseLogLine', () => {
  it('returns null for blank and whitespace lines', () => {
    assert.equal(parseLogLine(''), null)
    assert.equal(parseLogLine('   '), null)
    assert.equal(parseLogLine('\n'), null)
  })

  it('strips ANSI escape sequences', () => {
    const row = parseLogLine('\x1b[32mgreen text\x1b[0m')
    assert.ok(row)
    assert.equal(row.message, 'green text')
  })

  it('parses ISO timestamps', () => {
    const row = parseLogLine('2026-10-07T20:17:15.837Z started')
    assert.equal(row?.timestamp, '2026-10-07 20:17:15')
    assert.equal(row?.message, 'started')
  })

  it('parses postgres timestamps with process id', () => {
    const row = parseLogLine(
      '2026-10-07 20:17:15.837 UTC [53] LOG:  database system is ready',
    )
    assert.equal(row?.timestamp, '2026-10-07 20:17:15')
    assert.equal(row?.severity, 'info')
    assert.equal(row?.message, 'LOG:  database system is ready')
  })

  it('parses bare HH:MM:SS timestamps', () => {
    const row = parseLogLine('20:17:15 hello')
    assert.equal(row?.timestamp, '20:17:15')
    assert.equal(row?.message, 'hello')
  })

  it('leaves non-timestamped lines intact', () => {
    const row = parseLogLine('plain output message')
    assert.equal(row?.timestamp, '')
    assert.equal(row?.message, 'plain output message')
    assert.equal(row?.severity, 'plain')
  })

  it('classifies error markers case-insensitively', () => {
    assert.equal(
      parseLogLine('FATAL:  password authentication failed')?.severity,
      'error',
    )
    assert.equal(parseLogLine('Error: connection refused')?.severity, 'error')
    assert.equal(
      parseLogLine('process exited with exit code 1')?.severity,
      'error',
    )
    assert.equal(
      parseLogLine('initdb: warning: enabling "trust" auth')?.severity,
      'warn',
    )
    assert.equal(parseLogLine('NOTICE: table created')?.severity, 'info')
    assert.equal(parseLogLine('DEBUG: checkpoint')?.severity, 'debug')
  })

  it('does not misclassify words containing markers', () => {
    // "errorful" should not match \bERROR\b
    assert.equal(parseLogLine('the errorful plan')?.severity, 'plain')
  })
})

describe('toRows', () => {
  it('explodes newline-joined SSE chunks into separate rows', () => {
    const rows = toRows(['line one\nline two\nline three'])
    assert.equal(rows.length, 3)
    assert.equal(rows[0].message, 'line one')
    assert.equal(rows[2].message, 'line three')
  })

  it('drops blank segments inside chunks', () => {
    const rows = toRows(['a\n\nb'])
    assert.equal(rows.length, 2)
  })

  it('assigns sequential ids', () => {
    const rows = toRows(['x', 'y'])
    assert.ok(rows[0].id < rows[1].id)
  })

  it('caps the buffer at 3000 rows', () => {
    const rows = toRows(Array.from({ length: 3100 }, (_, i) => `line ${i}`))
    assert.equal(rows.length, 3000)
    assert.equal(rows.at(-1)?.message, 'line 3099')
  })
})
