// Local shape for catalog templates (official/community). Structurally
// compatible with Payload `Template` documents and the bundled
// OFFICIAL_TEMPLATES catalog.
export interface CatalogTemplate {
  id: string
  name: string
  description?: string | null
  imageUrl?: string | null
  services?:
    | {
        name: string
        description?: string | null
        type: 'app' | 'database' | 'docker'
        providerType?:
          | ('github' | 'gitlab' | 'bitbucket' | 'azureDevOps' | 'gitea')
          | null
        githubSettings?: {
          repository: string
          owner: string
          branch: string
          buildPath: string
          port?: number | null
        }
        azureSettings?: {
          repository: string
          branch: string
          owner: string
          buildPath: string
          port?: number | null
        }
        giteaSettings?: {
          repository: string
          branch: string
          owner: string
          buildPath: string
          port?: number | null
        }
        gitlabSettings?: {
          repository: string
          branch: string
          owner: string
          buildPath: string
          port?: number | null
        }
        bitbucketSettings?: {
          repository: string
          branch: string
          owner: string
          buildPath: string
          port?: number | null
        }
        databaseDetails?: {
          type?:
            | (
                | 'postgres'
                | 'mongo'
                | 'mysql'
                | 'mariadb'
                | 'redis'
                | 'clickhouse'
              )
            | null
          exposedPorts?: string[] | null
        }
        dockerDetails?: {
          url?: string | null
          ports?:
            | {
                hostPort: number
                containerPort: number
                scheme: 'http' | 'https'
                id?: string | null
              }[]
            | null
        }
        builder?:
          | (
              | 'buildPacks'
              | 'railpack'
              | 'nixpacks'
              | 'dockerfile'
              | 'herokuBuildPacks'
              | 'static'
            )
          | null
        volumes?:
          | {
              hostPath: string
              containerPath: string
              id?: string | null
            }[]
          | null
        variables?:
          | {
              key: string
              value?: string | null
              id?: string | null
            }[]
          | null
        id?: string | null
      }[]
    | null
  user?: string | null
  type?: ('community' | 'official') | null
  updatedAt: string
  createdAt: string
}
