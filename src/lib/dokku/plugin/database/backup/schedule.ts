import { NodeSSH, SSHExecCommandOptions } from 'node-ssh'

// dokku <plugin>:backup-schedule <service> <bucket> <schedule>
// schedule is a cron expression, e.g. "0 3 * * *" (daily at 03:00 UTC).
export const schedule = async (
  ssh: NodeSSH,
  databaseType: string,
  databaseName: string,
  bucket: string,
  cronSchedule: string,
  options?: SSHExecCommandOptions,
) => {
  return await ssh.execCommand(
    `dokku ${databaseType}:backup-schedule ${databaseName} ${bucket} "${cronSchedule}"`,
    options,
  )
}

// dokku <plugin>:backup-unschedule <service> — removes the schedule.
export const unschedule = async (
  ssh: NodeSSH,
  databaseType: string,
  databaseName: string,
  options?: SSHExecCommandOptions,
) => {
  return await ssh.execCommand(
    `dokku ${databaseType}:backup-unschedule ${databaseName}`,
    options,
  )
}
