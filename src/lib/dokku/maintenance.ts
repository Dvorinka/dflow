import { NodeSSH, SSHExecOptions } from 'node-ssh'

// Dokku maintenance mode serves a static page for all requests (#425)
export const on = async (
  ssh: NodeSSH,
  appName: string,
  options?: SSHExecOptions,
) => {
  const result = await ssh.execCommand(
    `dokku maintenance:on ${appName}`,
    options,
  )
  if (result.code === 1) throw new Error(result.stderr)
  return result
}

export const off = async (
  ssh: NodeSSH,
  appName: string,
  options?: SSHExecOptions,
) => {
  const result = await ssh.execCommand(
    `dokku maintenance:off ${appName}`,
    options,
  )
  if (result.code === 1) throw new Error(result.stderr)
  return result
}

export const status = async (
  ssh: NodeSSH,
  appName: string,
  options?: SSHExecOptions,
): Promise<boolean> => {
  const result = await ssh.execCommand(
    `dokku maintenance:report ${appName} --format json`,
    options,
  )
  if (result.code === 1) throw new Error(result.stderr)
  try {
    const report = JSON.parse(result.stdout) as { enabled?: boolean }
    return report.enabled === true
  } catch {
    return result.stdout.includes('true')
  }
}
