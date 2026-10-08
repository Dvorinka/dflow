import fs from 'fs'
import { NodeSSH } from 'node-ssh'
import os from 'os'
import { BasePayload } from 'payload'

import { pluginList } from '@/components/plugins'
import { dokku } from '@/lib/dokku'
import { dynamicSSH, extractSSHDetails } from '@/lib/ssh'
import { getUniqueName } from '@/lib/uniqueName'
import { Project, Service, Tenant, User } from '@/payload-types'

/**
 * Clone a service into a target project — copies config and, when requested,
 * the database contents (dokku export → transfer → import, works across
 * servers). Shared by cloneServiceAction and environment cloning (#358).
 */
export async function cloneService({
  payload,
  user,
  tenant,
  source,
  targetProject,
  cloneData,
}: {
  payload: BasePayload
  user: User
  tenant: Tenant
  source: Service
  targetProject: Project
  cloneData: boolean
}): Promise<{ service: Service; warning?: string }> {
  const targetServer =
    typeof targetProject.server === 'object' ? targetProject.server : null
  if (!targetServer) {
    throw new Error('Target project has no server')
  }

  const newName = await getUniqueName(async candidate => {
    const { totalDocs } = await payload.count({
      collection: 'services',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          { name: { equals: candidate } },
        ],
      },
    })
    return totalDocs > 0
  }, `${targetProject.name}-${source.name.slice(0, 10)}`)

  // Rewrite template self-references {{ oldName.VAR }} → {{ newName.VAR }}
  const selfRef = new RegExp(
    `\\{\\{\\s*${source.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`,
    'g',
  )
  const variables = (source.variables ?? []).map(v => ({
    key: v.key,
    value: v.value?.replace(selfRef, `{{ ${newName}.`) ?? v.value,
  }))

  const data: Record<string, unknown> = {
    project: targetProject.id,
    name: newName,
    description: source.description,
    type: source.type,
    tenant,
    variables,
    builder: source.builder,
    volumes: source.volumes?.map(({ hostPath, containerPath }) => ({
      hostPath,
      containerPath,
    })),
  }

  if (source.type === 'database') {
    const dd = source.databaseDetails
    data.databaseDetails =
      dd?.provider === 'external'
        ? { ...dd, exposedPorts: undefined, backupSchedule: undefined }
        : { type: dd?.type, version: dd?.version }
  } else {
    // app/docker — copy provider + build settings; domains intentionally
    // not copied (they'd collide) and deployment stays manual.
    data.provider = source.provider
    data.providerType = source.providerType
    data.githubSettings = source.githubSettings
    data.azureSettings = source.azureSettings
    data.giteaSettings = source.giteaSettings
    data.gitlabSettings = source.gitlabSettings
    data.bitbucketSettings = source.bitbucketSettings
    data.dockerDetails = source.dockerDetails
  }

  const created = await payload.create({
    collection: 'services',
    data: data as any,
    user,
  })

  // Optional data copy for dokku databases that are actually deployed.
  if (
    !cloneData ||
    source.type !== 'database' ||
    source.databaseDetails?.provider === 'external' ||
    source.databaseDetails?.status !== 'running'
  ) {
    return { service: created }
  }

  const sourceProject =
    typeof source.project === 'object' ? source.project : null
  const sourceServer =
    typeof sourceProject?.server === 'object' ? sourceProject.server : null
  const dbType = source.databaseDetails?.type

  if (!sourceServer || !dbType) {
    return { service: created }
  }

  let sourceSsh: NodeSSH | null = null
  let targetSsh: NodeSSH | null = null
  const stamp = Date.now()
  const remoteDump = `/tmp/dflow-clone-${stamp}.dump`
  const localDump = `${os.tmpdir()}/dflow-clone-${stamp}.dump`

  try {
    sourceSsh = await dynamicSSH(extractSSHDetails({ server: sourceServer }))
    const sameServer = sourceServer.id === targetServer.id
    targetSsh = sameServer
      ? sourceSsh
      : await dynamicSSH(extractSSHDetails({ server: targetServer }))

    // The target server may lack the database plugin entirely — the
    // deploy queue installs plugins for service creation, but the
    // clone data path talks to dokku directly.
    if (!(await dokku.plugin.installed(targetSsh, dbType))) {
      const pluginData = pluginList.find(p => p.value === dbType)
      if (pluginData) {
        await dokku.plugin.install({
          ssh: targetSsh,
          pluginUrl: pluginData.githubURL,
          pluginName: dbType,
        })
      }
    }

    const createRes = await dokku.database.create(
      targetSsh,
      newName,
      dbType,
      undefined,
      { imageVersion: source.databaseDetails?.version ?? undefined },
    )
    if (createRes.code !== 0) {
      throw new Error(`dokku ${dbType}:create failed — ${createRes.stderr}`)
    }

    await dokku.database.internal.export(
      sourceSsh,
      dbType,
      source.name,
      remoteDump,
    )

    if (!sameServer) {
      await sourceSsh.getFile(localDump, remoteDump)
      await targetSsh.putFile(localDump, remoteDump)
    }

    await dokku.database.internal.import(
      targetSsh,
      dbType,
      newName,
      remoteDump,
    )

    await payload.update({
      collection: 'services',
      id: created.id,
      data: { databaseDetails: { type: dbType, status: 'running' } },
    })

    return { service: created }
  } catch (error) {
    // Clone exists; only the data copy failed — surface it but don't
    // roll back the service record.
    const message = error instanceof Error ? error.message : ''
    console.error(`clone data copy failed for ${newName}:`, message)
    return {
      service: created,
      warning: `Service cloned, but data copy failed: ${message}`,
    }
  } finally {
    if (sourceSsh) {
      await sourceSsh.execCommand(`rm -f ${remoteDump}`).catch(() => {})
      sourceSsh.dispose()
    }
    if (targetSsh && targetSsh !== sourceSsh) {
      await targetSsh.execCommand(`rm -f ${remoteDump}`).catch(() => {})
      targetSsh.dispose()
    }
    await fs.promises.unlink(localDump).catch(() => {})
  }
}
