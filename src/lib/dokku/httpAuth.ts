import { NodeSSH, SSHExecOptions } from 'node-ssh'

// Dokku HTTP basic auth in front of an app (#425)
const shellQuote = (value: string): string => {
  if (!/^[A-Za-z0-9@%_+=:,./-]+$/.test(value)) {
    throw new Error('Invalid characters in credential')
  }
  return value
}

export const on = async (
  ssh: NodeSSH,
  appName: string,
  username: string,
  password: string,
  options?: SSHExecOptions,
) => {
  const result = await ssh.execCommand(
    `dokku http-auth:on ${appName} ${shellQuote(username)} ${shellQuote(password)}`,
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
    `dokku http-auth:off ${appName}`,
    options,
  )
  if (result.code === 1) throw new Error(result.stderr)
  return result
}
