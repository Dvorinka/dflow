import { Database } from 'lucide-react'
import { JSX } from 'react'

import {
  Bitbucket,
  ClickHouse,
  Docker,
  Git,
  GitLab,
  Gitea,
  Github,
  MariaDB,
  MicrosoftAzure,
  MongoDB,
  MySQL,
  PostgreSQL,
  Redis,
} from '@/components/icons'
import { Service } from '@/payload-types'

type ServiceLike = Pick<Service, 'type'> &
  Partial<Pick<Service, 'databaseDetails' | 'providerType'>>

const databaseIcons: Record<
  NonNullable<NonNullable<Service['databaseDetails']>['type']>,
  (className: string) => JSX.Element
> = {
  postgres: cn => <PostgreSQL className={cn} />,
  mariadb: cn => <MariaDB className={cn} />,
  mongo: cn => <MongoDB className={cn} />,
  mysql: cn => <MySQL className={cn} />,
  redis: cn => <Redis className={cn} />,
  clickhouse: cn => <ClickHouse className={cn} />,
}

const providerTypeIcons: Record<
  NonNullable<Service['providerType']>,
  (className: string) => JSX.Element
> = {
  github: cn => <Github className={cn} />,
  gitlab: cn => <GitLab className={cn} />,
  bitbucket: cn => <Bitbucket className={cn} />,
  azureDevOps: cn => <MicrosoftAzure className={cn} />,
  gitea: cn => <Gitea className={cn} />,
}

export const serviceIcon = (
  service: ServiceLike,
  className = 'size-6',
): JSX.Element => {
  if (service.type === 'database' && service.databaseDetails?.type) {
    return databaseIcons[service.databaseDetails.type](className)
  }
  if (service.type === 'app' && service.providerType) {
    return providerTypeIcons[service.providerType](className)
  }
  if (service.type === 'docker') {
    return <Docker className={className} />
  }
  if (service.type === 'database') {
    return <Database className={className} />
  }
  return <Git className={className} />
}
