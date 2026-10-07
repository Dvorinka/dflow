import { z } from 'zod'

import { supportedPluginsSchema } from '@/actions/plugin/validator'

export type PluginListType = {
  value: z.infer<typeof supportedPluginsSchema>
  githubURL: string
  category: 'database' | 'domain' | 'messageQueue' | 'utility'
  hasConfig?: boolean
}

export const pluginList: PluginListType[] = [
  {
    category: 'database',
    value: 'mongo',
    githubURL: 'https://github.com/dokku/dokku-mongo.git',
  },
  {
    category: 'database',
    value: 'postgres',
    githubURL: 'https://github.com/dokku/dokku-postgres.git',
  },
  {
    category: 'database',
    value: 'mariadb',
    githubURL: 'https://github.com/dokku/dokku-mariadb.git',
  },
  {
    category: 'database',
    value: 'redis',
    githubURL: 'https://github.com/dokku/dokku-redis.git',
  },
  {
    category: 'database',
    value: 'mysql',
    githubURL: 'https://github.com/dokku/dokku-mysql.git',
  },
  {
    category: 'database',
    value: 'clickhouse',
    githubURL: 'https://github.com/dokku/dokku-clickhouse.git',
  },
  {
    category: 'domain',
    value: 'letsencrypt',
    githubURL: 'https://github.com/dokku/dokku-letsencrypt.git',
    hasConfig: true,
  },
  {
    category: 'messageQueue',
    value: 'rabbitmq',
    githubURL: 'https://github.com/dokku/dokku-rabbitmq.git',
  },
  {
    category: 'database',
    value: 'couchdb',
    githubURL: 'https://github.com/dokku/dokku-couchdb.git',
  },
  {
    category: 'database',
    value: 'elasticsearch',
    githubURL: 'https://github.com/dokku/dokku-elasticsearch.git',
  },
  {
    category: 'database',
    value: 'meilisearch',
    githubURL: 'https://github.com/dokku/dokku-meilisearch.git',
  },
  {
    category: 'database',
    value: 'memcached',
    githubURL: 'https://github.com/dokku/dokku-memcached.git',
  },
  {
    category: 'database',
    value: 'rethinkdb',
    githubURL: 'https://github.com/dokku/dokku-rethinkdb.git',
  },
  {
    category: 'database',
    value: 'omnisci',
    githubURL: 'https://github.com/dokku/dokku-omnisci.git',
  },
  {
    category: 'database',
    value: 'solr',
    githubURL: 'https://github.com/dokku/dokku-solr.git',
  },
  {
    category: 'database',
    value: 'typesense',
    githubURL: 'https://github.com/dokku/dokku-typesense.git',
  },
  {
    category: 'messageQueue',
    value: 'nats',
    githubURL: 'https://github.com/dokku/dokku-nats.git',
  },
  {
    category: 'utility',
    value: 'pushpin',
    githubURL: 'https://github.com/dokku/dokku-pushpin.git',
  },
  {
    category: 'utility',
    value: 'http-auth',
    githubURL: 'https://github.com/dokku/dokku-http-auth.git',
  },
  {
    category: 'utility',
    value: 'maintenance',
    githubURL: 'https://github.com/dokku/dokku-maintenance.git',
  },
  {
    category: 'utility',
    value: 'copy-files-to-image',
    githubURL: 'https://github.com/dokku/dokku-copy-files-to-image.git',
  },
  {
    category: 'utility',
    value: 'cron-restart',
    githubURL: 'https://github.com/dokku/dokku-cron-restart.git',
  },
  {
    category: 'domain',
    value: 'redirect',
    githubURL: 'https://github.com/dokku/dokku-redirect.git',
  },
  {
    category: 'utility',
    value: 'registry',
    githubURL: 'https://github.com/dokku/dokku-registry.git',
  },
  {
    category: 'utility',
    value: 'graphite',
    githubURL: 'https://github.com/dokku/dokku-graphite.git',
  },
  {
    category: 'utility',
    value: 'scheduler-kubernetes',
    githubURL: 'https://github.com/dokku/dokku-scheduler-kubernetes.git',
  },
  {
    category: 'utility',
    value: 'scheduler-nomad',
    githubURL: 'https://github.com/dokku/dokku-scheduler-nomad.git',
  },
]
