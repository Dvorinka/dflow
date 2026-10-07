import { NodeSSH, SSHExecCommandOptions } from 'node-ssh'

// dokku <plugin>:backup <service> <bucket> — dumps the database and
// uploads it to the configured S3-compatible bucket.
export const backup = async (
  ssh: NodeSSH,
  databaseType: string,
  databaseName: string,
  bucket: string,
  options?: SSHExecCommandOptions,
) => {
  return await ssh.execCommand(
    `dokku ${databaseType}:backup ${databaseName} ${bucket}`,
    options,
  )
}

// dokku <plugin>:backup-deauth <service> — removes stored credentials.
export const deauth = async (
  ssh: NodeSSH,
  databaseType: string,
  databaseName: string,
  options?: SSHExecCommandOptions,
) => {
  return await ssh.execCommand(
    `dokku ${databaseType}:backup-deauth ${databaseName}`,
    options,
  )
}
