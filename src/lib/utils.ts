import { type ClassValue, clsx } from 'clsx'
import crypto from 'crypto'
import { twMerge } from 'tailwind-merge'
import { z } from 'zod'

import { createServiceSchema } from '@/actions/service/validator'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type DatabaseType = Exclude<
  z.infer<typeof createServiceSchema>['databaseType'],
  undefined
>

export function parseDatabaseInfo({
  stdout,
  dbType,
}: {
  stdout: string
  dbType: DatabaseType
}) {
  const lines = stdout.split('\n').map(line => line.trim())
  const data: {
    type: DatabaseType
    connectionUrl?: string
    username?: string
    password?: string
    host?: string
    port?: string
    status?: 'running' | 'missing' | 'exited'
    version?: string
    databaseName?: string
  } = { type: dbType }

  for (const line of lines) {
    if (line.startsWith('Dsn:')) {
      const dsn = line.split('Dsn:')[1].trim()
      data.connectionUrl = dsn

      switch (dbType) {
        case 'mongo': {
          const regex = /mongodb:\/\/(.*?):(.*?)@(.*?):(.*?)\/(.*)/
          const match = dsn.match(regex)
          if (match) {
            data.username = match[1]
            data.password = match[2]
            data.host = match[3]
            data.port = match[4]
            data.databaseName = match[5]
          }
          break
        }

        case 'postgres': {
          const regex = /postgres:\/\/(.*?):(.*?)@(.*?):(.*?)\/(.*)/
          const match = dsn.match(regex)
          if (match) {
            data.username = match[1]
            data.password = match[2]
            data.host = match[3]
            data.port = match[4]
            data.databaseName = match[5]
          }
          break
        }

        case 'mysql':
        case 'mariadb': {
          const regex = /mysql:\/\/(.*?):(.*?)@(.*?):(.*?)\/(.*)/
          const match = dsn.match(regex)
          if (match) {
            data.username = match[1]
            data.password = match[2]
            data.host = match[3]
            data.port = match[4]
            data.databaseName = match[5]
          }
          break
        }

        case 'redis': {
          const regex = /redis:\/\/(.*?):(.*?)@(.*?):(.*)/
          const match = dsn.match(regex)
          if (match) {
            data.username = match[1]
            data.password = match[2]
            data.host = match[3]
            data.port = match[4]
          }
          break
        }

        case 'clickhouse': {
          const regex = /clickhouse:\/\/(?:(.*?):(.*?)@)?(.*?):(\d+)(?:\/(.*))?/
          const match = dsn.match(regex)
          if (match) {
            data.username = match[1]
            data.password = match[2]
            data.host = match[3]
            data.port = match[4]
            data.databaseName = match[5] ?? '' // optional database
          }
          break
        }

        default:
          console.warn('Unknown database type:', dbType)
      }
    } else if (line.startsWith('Status:')) {
      const status = line.split('Status:')[1].trim()
      if (status === 'running' || status === 'missing' || status === 'exited') {
        data.status = status
      }
    } else if (line.startsWith('Version:')) {
      data.version = line.split('Version:')[1].trim()
    }
  }

  return data
}

export function parseDatabaseUrl(url: string): {
  type: DatabaseType
  username?: string
  password?: string
  host?: string
  port?: string
  databaseName?: string
} {
  let dbType: DatabaseType

  if (url.startsWith('postgres://') || url.startsWith('postgresql://'))
    dbType = 'postgres'
  else if (
    url.startsWith('mongodb://') ||
    url.startsWith('mongodb+srv://')
  )
    dbType = 'mongo'
  else if (url.startsWith('mysql://')) dbType = 'mysql'
  else if (url.startsWith('mariadb://')) dbType = 'mariadb'
  else if (url.startsWith('redis://')) dbType = 'redis'
  else if (url.startsWith('clickhouse://')) dbType = 'clickhouse'
  else throw new Error('Unsupported or unrecognized database URL type.')

  const data: {
    type: DatabaseType
    username?: string
    password?: string
    host?: string
    port?: string
    databaseName?: string
  } = { type: dbType }

  switch (dbType) {
    case 'postgres':
    case 'mongo':
    case 'mysql':
    case 'mariadb':
    case 'clickhouse': {
      // Generic form: scheme://user:pass@host[:port]/name — tolerates
      // postgresql://, mongodb+srv:// and missing ports (SRV URIs).
      const regex = /.*:\/\/(.*?):(.*?)@([^:/]+)(?::(\d+))?\/(.*)/
      const match = url.match(regex)
      if (match) {
        data.username = match[1]
        data.password = match[2]
        data.host = match[3]
        data.port = match[4]
        data.databaseName = match[5]
      }
      break
    }

    case 'redis': {
      // Redis doesn't usually include database names (uses DB index)
      // redis://username:password@host:port (optional username)
      const regex = /redis:\/\/(?:(.*?):(.*?)@)?(.*?):(.*)/
      const match = url.match(regex)
      if (match) {
        data.username = match[1]
        data.password = match[2]
        data.host = match[3]
        data.port = match[4]
        data.databaseName = '' // Not typically present
      }
      break
    }
  }

  return data
}

// Inverse of parseDatabaseUrl — builds a connection URL from discrete
// fields for externally-managed databases (#412/#366).
export function buildConnectionUrl({
  type,
  host,
  port,
  username,
  password,
  databaseName,
}: {
  type: DatabaseType | string
  host: string
  port?: string
  username?: string
  password?: string
  databaseName?: string
}): string {
  const defaultPorts: Record<string, string> = {
    postgres: '5432',
    mongo: '27017',
    mysql: '3306',
    mariadb: '3306',
    redis: '6379',
    clickhouse: '9000',
  }

  const schemes: Record<string, string> = {
    postgres: 'postgresql',
    mongo: 'mongodb',
    mysql: 'mysql',
    mariadb: 'mysql',
    redis: 'redis',
    clickhouse: 'clickhouse',
  }

  const scheme = schemes[type] ?? type
  const resolvedPort = port || defaultPorts[type] || ''
  const auth = username
    ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
    : password
      ? `:${encodeURIComponent(password)}@`
      : ''
  const path = databaseName ? `/${databaseName}` : ''

  return `${scheme}://${auth}${host}${resolvedPort ? `:${resolvedPort}` : ''}${path}`
}

export function generateRandomString({
  length = 4,
  charset = '',
}: {
  length: number
  charset?: string
}) {
  const chars = charset || 'abcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.randomBytes(length)

  return Array.from(values)
    .map(v => chars.charAt(v % chars.length))
    .join('')
    .toLowerCase()
}
