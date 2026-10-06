import { NodeSSH, SSHExecOptions } from 'node-ssh';

export const create = async (
  ssh: NodeSSH,
  name: string,
  databaseType: string,
  options?: SSHExecOptions,
  createOptions?: { imageVersion?: string },
) => {
  // Version allowlist mirrors the service validator; the value is
  // interpolated into a shell command, so reject anything unexpected.
  const imageVersion = createOptions?.imageVersion;
  const safeVersion =
    typeof imageVersion === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(imageVersion)
      ? imageVersion
      : undefined;

  const resultDatabaseCreate = await ssh.execCommand(
    `dokku ${databaseType}:create ${name}${safeVersion ? ` --image-version ${safeVersion}` : ''}`,
    options,
  );

  return resultDatabaseCreate;
};
