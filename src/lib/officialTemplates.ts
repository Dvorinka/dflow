import { Template as DFlowTemplate } from '@/lib/restSDK/types'

// Bundled official template catalog (#218). The upstream dflow.sh catalog
// is unmaintained, so the community fork ships its own definitions. These
// deploy through the normal template pipeline — keep entries to what it
// can express faithfully: single docker services, or docker apps linked to
// dokku databases via variables like {{ db.POSTGRES_URI }} /
// {{ db.MYSQL_URI }} / {{ db.MONGO_URI }} / {{ db.REDIS_URI }}, plus
// {{ secret(len, charset) }} generators. There is no docker-to-docker
// service discovery, so multi-container apps don't belong here yet.
export const OFFICIAL_TEMPLATES: DFlowTemplate[] = [
  {
    id: 'official:n8n',
    name: 'n8n',
    description:
      'Workflow automation — connect services with 400+ integrations',
    imageUrl: 'https://avatars.githubusercontent.com/u/45487711',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'docker',
        name: 'n8n',
        description: 'n8n workflow editor and runner',
        dockerDetails: {
          url: 'docker.n8n.io/n8nio/n8n:latest',
          ports: [{ hostPort: 5678, containerPort: 5678, scheme: 'http' }],
        },
        variables: [
          {
            key: 'N8N_ENCRYPTION_KEY',
            value:
              '{{ secret(32, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") }}',
          },
          { key: 'N8N_SECURE_COOKIE', value: 'false' },
        ],
        volumes: [
          {
            hostPath: '/var/lib/dokku/data/storage/n8n',
            containerPath: '/home/node/.n8n',
          },
        ],
      },
    ],
  },
  {
    id: 'official:minio',
    name: 'MinIO',
    description: 'S3-compatible object storage server',
    imageUrl: 'https://avatars.githubusercontent.com/u/695951',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'docker',
        name: 'minio',
        description: 'MinIO API (9000) + console (9001)',
        dockerDetails: {
          url: 'minio/minio:latest',
          ports: [
            { hostPort: 9000, containerPort: 9000, scheme: 'http' },
            { hostPort: 9001, containerPort: 9001, scheme: 'http' },
          ],
        },
        variables: [
          { key: 'MINIO_ROOT_USER', value: 'minioadmin' },
          {
            key: 'MINIO_ROOT_PASSWORD',
            value:
              '{{ secret(24, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") }}',
          },
        ],
        volumes: [
          {
            hostPath: '/var/lib/dokku/data/storage/minio',
            containerPath: '/data',
          },
        ],
      },
    ],
  },
  {
    id: 'official:langflow',
    name: 'Langflow',
    description: 'Visual framework for building LangChain and RAG pipelines',
    imageUrl: 'https://avatars.githubusercontent.com/u/118811013',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'docker',
        name: 'langflow',
        dockerDetails: {
          url: 'langflowai/langflow:latest',
          ports: [{ hostPort: 7860, containerPort: 7860, scheme: 'http' }],
        },
        volumes: [
          {
            hostPath: '/var/lib/dokku/data/storage/langflow',
            containerPath: '/app/langflow',
          },
        ],
      },
    ],
  },
  {
    id: 'official:wetty',
    name: 'WeTTY',
    description: 'Terminal in the browser over HTTP/HTTPS',
    imageUrl: 'https://avatars.githubusercontent.com/u/45932675',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'docker',
        name: 'wetty',
        dockerDetails: {
          url: 'wettyoss/wetty:latest',
          ports: [{ hostPort: 3000, containerPort: 3000, scheme: 'http' }],
        },
      },
    ],
  },
  {
    id: 'official:drawio',
    name: 'draw.io',
    description: 'Diagramming and whiteboard editor',
    imageUrl: 'https://avatars.githubusercontent.com/u/1769238',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'docker',
        name: 'drawio',
        dockerDetails: {
          url: 'jgraph/drawio:latest',
          ports: [{ hostPort: 8080, containerPort: 8080, scheme: 'http' }],
        },
      },
    ],
  },
  {
    id: 'official:portainer',
    name: 'Portainer',
    description: 'Container management UI for Docker',
    imageUrl: 'https://avatars.githubusercontent.com/u/22225832',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'docker',
        name: 'portainer',
        dockerDetails: {
          url: 'portainer/portainer-ce:latest',
          ports: [{ hostPort: 9443, containerPort: 9443, scheme: 'https' }],
        },
        volumes: [
          {
            hostPath: '/var/run/docker.sock',
            containerPath: '/var/run/docker.sock',
          },
          {
            hostPath: '/var/lib/dokku/data/storage/portainer',
            containerPath: '/data',
          },
        ],
      },
    ],
  },
  {
    id: 'official:flowise',
    name: 'Flowise',
    description: 'Drag-and-drop UI for building LLM flows',
    imageUrl: 'https://avatars.githubusercontent.com/u/128289859',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'docker',
        name: 'flowise',
        dockerDetails: {
          url: 'flowiseai/flowise:latest',
          ports: [{ hostPort: 3000, containerPort: 3000, scheme: 'http' }],
        },
        volumes: [
          {
            hostPath: '/var/lib/dokku/data/storage/flowise',
            containerPath: '/root/.flowise',
          },
        ],
      },
    ],
  },
  {
    id: 'official:focalboard',
    name: 'Focalboard',
    description: 'Open-source project management (Trello/Notion alternative)',
    imageUrl: 'https://avatars.githubusercontent.com/u/39326053',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'docker',
        name: 'focalboard',
        dockerDetails: {
          url: 'mattermost/focalboard:latest',
          ports: [{ hostPort: 8000, containerPort: 8000, scheme: 'http' }],
        },
      },
    ],
  },
  {
    id: 'official:hasura',
    name: 'Hasura',
    description: 'Instant GraphQL API over PostgreSQL',
    imageUrl: 'https://avatars.githubusercontent.com/u/13966712',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'database',
        name: 'db',
        description: 'PostgreSQL for Hasura',
        databaseDetails: { type: 'postgres' },
      },
      {
        type: 'docker',
        name: 'hasura',
        dockerDetails: {
          url: 'hasura/graphql-engine:latest',
          ports: [{ hostPort: 8080, containerPort: 8080, scheme: 'http' }],
        },
        variables: [
          { key: 'HASURA_GRAPHQL_DATABASE_URL', value: '{{ db.POSTGRES_URI }}' },
          {
            key: 'HASURA_GRAPHQL_ADMIN_SECRET',
            value:
              '{{ secret(24, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") }}',
          },
          { key: 'HASURA_GRAPHQL_ENABLE_CONSOLE', value: 'true' },
        ],
      },
    ],
  },
  {
    id: 'official:docuseal',
    name: 'DocuSeal',
    description: 'Open-source document signing (DocuSign alternative)',
    imageUrl: 'https://avatars.githubusercontent.com/u/113148316',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'database',
        name: 'db',
        description: 'PostgreSQL for DocuSeal',
        databaseDetails: { type: 'postgres' },
      },
      {
        type: 'docker',
        name: 'docuseal',
        dockerDetails: {
          url: 'docuseal/docuseal:latest',
          ports: [{ hostPort: 3000, containerPort: 3000, scheme: 'http' }],
        },
        variables: [{ key: 'DATABASE_URL', value: '{{ db.POSTGRES_URI }}' }],
        volumes: [
          {
            hostPath: '/var/lib/dokku/data/storage/docuseal',
            containerPath: '/data',
          },
        ],
      },
    ],
  },
  {
    id: 'official:rocketchat',
    name: 'Rocket.Chat',
    description: 'Team chat and collaboration platform',
    imageUrl: 'https://avatars.githubusercontent.com/u/16818982',
    type: 'official',
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    services: [
      {
        type: 'database',
        name: 'db',
        description: 'MongoDB for Rocket.Chat',
        databaseDetails: { type: 'mongo' },
      },
      {
        type: 'docker',
        name: 'rocketchat',
        dockerDetails: {
          url: 'rocket.chat:latest',
          ports: [{ hostPort: 3000, containerPort: 3000, scheme: 'http' }],
        },
        variables: [
          { key: 'MONGO_URL', value: '{{ db.MONGO_URI }}' },
          { key: 'MONGO_OPLOG_URL', value: '{{ db.MONGO_URI }}' },
          { key: 'DEPLOY_METHOD', value: 'docker' },
        ],
      },
    ],
  },
]

export const findBundledTemplate = (id: string) =>
  OFFICIAL_TEMPLATES.find(t => t.id === id)
