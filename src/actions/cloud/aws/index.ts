'use server'

import {
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeKeyPairsCommand,
  EC2Client,
  ImportKeyPairCommand,
  ModifyInstanceAttributeCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  waitUntilInstanceRunning,
  waitUntilInstanceStopped,
  _InstanceType,
} from '@aws-sdk/client-ec2'
import configPromise from '@payload-config'
import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'

import { awsRegions } from '@/lib/constants'
import { extractTenantSlug } from '@/lib/extractID'
import { protectedClient } from '@/lib/safe-action'
import { CloudProviderAccount } from '@/payload-types'

import {
  checkAWSConnectionSchema,
  // Add this to your validator file
  connectAWSAccountSchema,
  createEC2InstanceSchema,
  deleteAWSAccountSchema,
  listUbuntuAmisSchema,
  updateAWSAccountSchema,
  updateEC2InstanceSchema,
  upgradeEC2InstanceTypeSchema,
} from './validator'

export const createEC2InstanceAction = protectedClient
  .metadata({
    actionName: 'createEC2InstanceAction',
  })
  .inputSchema(createEC2InstanceSchema)
  .action(async ({ clientInput, ctx }) => {
    const {
      name,
      accountId,
      sshKeyId,
      ami,
      description,
      diskSize,
      instanceType,
      region,
      securityGroupIds,
    } = clientInput
    const {
      user,
      userTenant: { tenant, role },
    } = ctx
    const payload = await getPayload({ config: configPromise })

    if (Number(role?.servers?.createLimit) > 0) {
      const { totalDocs } = await payload.count({
        collection: 'servers',
        where: {
          and: [
            {
              tenant: {
                equals: tenant.id,
              },
            },
            {
              createdBy: {
                equals: user?.id,
              },
            },
          ],
        },
      })

      if (totalDocs >= Number(role?.servers?.createLimit)) {
        throw new Error(
          `You have reached your server creation limit. Please contact your administrator.`,
        )
      }
    }

    const awsAccountDetails = await payload.findByID({
      collection: 'cloudProviderAccounts',
      id: accountId,
    })

    const sshKeyDetails = await payload.findByID({
      collection: 'sshKeys',
      id: sshKeyId,
    })
    const ec2Client = new EC2Client({
      region,
      credentials: {
        accessKeyId: awsAccountDetails.awsDetails?.accessKeyId!,
        secretAccessKey: awsAccountDetails.awsDetails?.secretAccessKey!,
      },
    })

    const describeKeysCommand = new DescribeKeyPairsCommand()

    const sshKeys = await ec2Client.send(describeKeysCommand)

    const sshKey = sshKeys.KeyPairs?.find(
      key => key.KeyName === sshKeyDetails.name,
    )

    if (!sshKey?.KeyName) {
      const keyCommand = new ImportKeyPairCommand({
        KeyName: sshKeyDetails.name,
        PublicKeyMaterial: Buffer.from(sshKeyDetails.publicKey),
      })
      await ec2Client.send(keyCommand)
    }

    const { docs: securityGroups } = await payload.find({
      collection: 'securityGroups',
      pagination: false,
      where: {
        id: {
          in: securityGroupIds,
        },
      },
    })

    const unsyncedGroups = securityGroups.filter(
      sg => sg.syncStatus !== 'in-sync',
    )

    if (unsyncedGroups.length > 0) {
      await Promise.all(
        unsyncedGroups.map(sg =>
          payload.update({
            collection: 'securityGroups',
            id: sg.id,
            data: {
              syncStatus: 'start-sync',
              cloudProvider: 'aws',
              cloudProviderAccount: accountId,
              lastSyncedAt: new Date().toISOString(),
            },
          }),
        ),
      )

      // Re-check sync status once
      const { docs: updatedGroups } = await payload.find({
        collection: 'securityGroups',
        pagination: false,
        where: {
          id: {
            in: unsyncedGroups.map(g => g.id),
          },
        },
      })

      const stillNotSynced = updatedGroups.filter(
        g => g.syncStatus !== 'in-sync',
      )

      if (stillNotSynced.length > 0) {
        throw new Error('Some security groups failed to sync')
      }

      const { docs: refreshedGroups } = await payload.find({
        collection: 'securityGroups',
        pagination: false,
        where: {
          id: {
            in: securityGroupIds,
          },
        },
      })

      securityGroups.splice(0, securityGroups.length, ...refreshedGroups)
    }

    const validSecurityGroupIds = securityGroups
      .map(sg => sg.securityGroupId)
      .filter((sgId): sgId is string => !!sgId)

    const ec2Command = new RunInstancesCommand({
      ImageId: ami,
      InstanceType: instanceType as _InstanceType,
      MinCount: 1,
      MaxCount: 1,
      KeyName: sshKeyDetails.name,
      SecurityGroupIds: validSecurityGroupIds,
      BlockDeviceMappings: [
        {
          DeviceName: '/dev/sda1',
          Ebs: {
            VolumeSize: diskSize,
            VolumeType: 'gp3',
            DeleteOnTermination: true,
          },
        },
      ],
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [{ Key: 'Name', Value: name }],
        },
      ],
    })

    const ec2Response = await ec2Client.send(ec2Command)

    const instanceDetails = ec2Response.Instances?.[0]

    if (instanceDetails) {
      const pollForPublicIP = async () => {
        for (let i = 0; i < 10; i++) {
          const describeCommand = new DescribeInstancesCommand({
            InstanceIds: [instanceDetails.InstanceId!],
          })

          const result = await ec2Client.send(describeCommand)
          const ip = result.Reservations?.[0]?.Instances?.[0]?.PublicIpAddress

          if (ip) return ip

          await new Promise(r => setTimeout(r, 5000))
        }

        throw new Error('Public IP not assigned yet after waiting')
      }

      const ip = await pollForPublicIP()

      const serverResponse = await payload.create({
        collection: 'servers',
        data: {
          name,
          description,
          port: 22,
          sshKey: sshKeyId,
          username: 'ubuntu',
          ip,
          provider: 'aws',
          cloudProviderAccount: accountId,
          preferConnectionType: 'tailscale',
          awsEc2Details: {
            instanceId: instanceDetails.InstanceId,
            region: region,
            imageId: instanceDetails.ImageId,
            instanceType: instanceDetails.InstanceType,
            diskSize: diskSize,
            securityGroups: securityGroups.map(sg => sg.id),
            launchTime: instanceDetails.LaunchTime?.toISOString(),
            state: instanceDetails.State?.Name,
            subnetId: instanceDetails.SubnetId,
            vpcId: instanceDetails.VpcId,
            publicDnsName: instanceDetails.PublicDnsName,
            privateDnsName: instanceDetails.PrivateDnsName,
            privateIpAddress: instanceDetails.PrivateIpAddress,
            publicIpAddress: ip,
            keyName: instanceDetails.KeyName,
            architecture: instanceDetails.Architecture,
          },
          createdBy: user.id,
          tenant,
        },
      })

      if (serverResponse.id) {
        revalidatePath(`/${tenant.slug}/servers`)
        return { success: true, server: serverResponse }
      }
    }
  })

export const connectAWSAccountAction = protectedClient
  .metadata({
    actionName: 'connectAWSAccountAction',
  })
  .inputSchema(connectAWSAccountSchema)
  .action(async ({ clientInput, ctx }) => {
    const { accessKeyId, secretAccessKey, name } = clientInput
    const { userTenant, payload } = ctx
    let response: CloudProviderAccount

    response = await payload.create({
      collection: 'cloudProviderAccounts',
      data: {
        type: 'aws',
        awsDetails: {
          accessKeyId,
          secretAccessKey,
        },
        tenant: userTenant.tenant,
        name,
      },
    })

    return response
  })

export const updateAWSAccountAction = protectedClient
  .metadata({
    actionName: 'updateAWSAccountAction',
  })
  .inputSchema(updateAWSAccountSchema)
  .action(async ({ clientInput, ctx }) => {
    const { accessKeyId, secretAccessKey, name, id } = clientInput
    const { userTenant, payload } = ctx
    let response: CloudProviderAccount

    response = await payload.update({
      collection: 'cloudProviderAccounts',
      id,
      data: {
        type: 'aws',
        awsDetails: {
          accessKeyId,
          secretAccessKey,
        },
        name,
      },
    })

    return response
  })

export const deleteAWSAccountAction = protectedClient
  .metadata({
    actionName: 'deleteAWSAccountAction',
  })
  .inputSchema(deleteAWSAccountSchema)
  .action(async ({ clientInput }) => {
    const { id } = clientInput
    const payload = await getPayload({ config: configPromise })

    const response = await payload.update({
      collection: 'cloudProviderAccounts',
      id,
      data: {
        deletedAt: new Date().toISOString(),
      },
    })

    return response
  })

export const updateEC2InstanceAction = protectedClient
  .metadata({
    actionName: 'updateEC2InstanceAction',
  })
  .inputSchema(updateEC2InstanceSchema)
  .action(async ({ clientInput }) => {
    const {
      serverId,
      instanceId,
      accountId,
      name,
      description,
      securityGroupsIds,
    } = clientInput

    const payload = await getPayload({ config: configPromise })

    // Get the server to update
    const server = await payload.findByID({
      collection: 'servers',
      id: clientInput.serverId,
    })

    if (!server) {
      throw new Error(`Server with ID ${clientInput.serverId} not found`)
    }

    // Get AWS account details
    const awsAccountDetails = await payload.findByID({
      collection: 'cloudProviderAccounts',
      id: accountId,
    })

    if (
      !awsAccountDetails?.awsDetails?.accessKeyId ||
      !awsAccountDetails.awsDetails.secretAccessKey
    ) {
      throw new Error('AWS account details not found')
    }

    // Initialize EC2 client
    const ec2Client = new EC2Client({
      region: awsRegions.at(0)?.value || 'us-east-1',
      credentials: {
        accessKeyId: awsAccountDetails.awsDetails.accessKeyId,
        secretAccessKey: awsAccountDetails.awsDetails.secretAccessKey,
      },
    })

    // Process security groups
    const { docs: securityGroups } = await payload.find({
      collection: 'securityGroups',
      pagination: false,
      where: {
        id: {
          in: securityGroupsIds,
        },
      },
    })

    const unsyncedGroups = securityGroups.filter(
      sg => sg.syncStatus !== 'in-sync',
    )

    // Sync unsynced security groups
    if (unsyncedGroups.length > 0) {
      await Promise.all(
        unsyncedGroups.map(sg =>
          payload.update({
            collection: 'securityGroups',
            id: sg.id,
            data: {
              syncStatus: 'start-sync',
              cloudProvider: 'aws',
              cloudProviderAccount: accountId || server.cloudProviderAccount,
              lastSyncedAt: new Date().toISOString(),
            },
          }),
        ),
      )

      // Re-check sync status
      const { docs: updatedGroups } = await payload.find({
        collection: 'securityGroups',
        pagination: false,
        where: {
          id: {
            in: unsyncedGroups.map(g => g.id),
          },
        },
      })

      const stillNotSynced = updatedGroups.filter(
        g => g.syncStatus !== 'in-sync',
      )

      if (stillNotSynced.length > 0) {
        throw new Error('Some security groups failed to sync')
      }

      // Get refreshed groups
      const { docs: refreshedGroups } = await payload.find({
        collection: 'securityGroups',
        pagination: false,
        where: {
          id: {
            in: securityGroupsIds,
          },
        },
      })

      securityGroups.splice(0, securityGroups.length, ...refreshedGroups)
    }

    // Get actual AWS security group IDs
    const validSecurityGroupIds = securityGroups
      .map(sg => sg.securityGroupId)
      .filter((sgId): sgId is string => !!sgId)

    // const isSecurityGroupsUpdated = server.awsEc2Details?.securityGroups?.every(
    //   securityGroup =>
    //     securityGroupsIds?.includes(
    //       (securityGroup as SecurityGroup).securityGroupId as string,
    //     ),
    // )

    await ec2Client.send(
      new ModifyInstanceAttributeCommand({
        InstanceId: instanceId,
        Groups: validSecurityGroupIds,
      }),
    )

    const response = await payload.update({
      collection: 'servers',
      id: serverId,
      data: {
        name,
        description,
        awsEc2Details: {
          ...server.awsEc2Details,
          securityGroups: securityGroupsIds,
        },
      },
    })

    if (response) {
      const tenantSlug = extractTenantSlug(server.tenant)
      if (tenantSlug) revalidatePath(`/${tenantSlug}/servers/${server.id}`)
    }

    return { success: true, server: response }
  })

export const checkAWSAccountConnection = protectedClient
  .metadata({
    actionName: 'checkAWSAccountConnection',
  })
  .inputSchema(checkAWSConnectionSchema)
  .action(async ({ clientInput }) => {
    const { accessKeyId, secretAccessKey, region = 'us-east-1' } = clientInput

    try {
      // Validate credentials format
      if (
        !accessKeyId ||
        typeof accessKeyId !== 'string' ||
        accessKeyId.trim() === ''
      ) {
        return {
          isConnected: false,
          accountInfo: null,
          error: 'Invalid or missing AWS Access Key ID',
        }
      }

      if (
        !secretAccessKey ||
        typeof secretAccessKey !== 'string' ||
        secretAccessKey.trim() === ''
      ) {
        return {
          isConnected: false,
          accountInfo: null,
          error: 'Invalid or missing AWS Secret Access Key',
        }
      }

      // Initialize EC2 client with provided credentials
      const ec2Client = new EC2Client({
        region,
        credentials: {
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
        },
      })

      // Perform a simple API call to test connectivity
      // DescribeKeyPairs is a low-cost operation that requires minimal permissions
      const testCommand = new DescribeKeyPairsCommand({})

      const response = await ec2Client.send(testCommand)

      // If we reach here, the connection is successful
      const accountInfo = {
        region,
        keyPairsCount: response.KeyPairs?.length || 0,
        hasEC2Access: true,
        connectionTime: new Date().toISOString(),
      }

      return {
        isConnected: true,
        accountInfo,
        error: null,
      }
    } catch (error: any) {
      console.error('AWS account connection check failed:', error)

      // Handle specific AWS error types
      if (
        error.name === 'InvalidUserID.NotFound' ||
        error.name === 'InvalidAccessKeyId'
      ) {
        return {
          isConnected: false,
          accountInfo: null,
          error: 'Invalid AWS Access Key ID. Please check your credentials.',
        }
      }

      if (error.name === 'SignatureDoesNotMatch') {
        return {
          isConnected: false,
          accountInfo: null,
          error:
            'Invalid AWS Secret Access Key. Please check your credentials.',
        }
      }

      if (error.name === 'UnauthorizedOperation') {
        return {
          isConnected: false,
          accountInfo: null,
          error:
            'AWS credentials are valid but lack EC2 permissions. Please ensure your IAM user has the necessary permissions.',
        }
      }

      if (
        error.name === 'TokenRefreshRequired' ||
        error.name === 'ExpiredToken'
      ) {
        return {
          isConnected: false,
          accountInfo: null,
          error:
            'AWS security token has expired. Please generate new credentials.',
        }
      }

      if (
        error.name === 'NetworkingError' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED'
      ) {
        return {
          isConnected: false,
          accountInfo: null,
          error:
            'Network error. Please check your internet connection and try again.',
        }
      }

      if (error.code === 'ECONNABORTED' || error.name === 'TimeoutException') {
        return {
          isConnected: false,
          accountInfo: null,
          error:
            'Connection timeout. The AWS service may be slow or unavailable.',
        }
      }

      if (
        error.name === 'ServiceUnavailable' ||
        error.name === 'InternalError'
      ) {
        return {
          isConnected: false,
          accountInfo: null,
          error:
            'AWS service is temporarily unavailable. Please try again later.',
        }
      }

      if (
        error.name === 'ThrottlingException' ||
        error.name === 'RequestLimitExceeded'
      ) {
        return {
          isConnected: false,
          accountInfo: null,
          error: 'Too many requests. Please wait a moment and try again.',
        }
      }

      // Generic error fallback
      return {
        isConnected: false,
        accountInfo: null,
        error:
          'Failed to connect to AWS. Please check your credentials and try again.',
      }
    }
  })

// Lists Canonical Ubuntu LTS AMIs for a region so the EC2 form offers all
// supported versions with region-correct IDs instead of one hardcoded AMI (#109)
export const listUbuntuAmisAction = protectedClient
  .metadata({
    actionName: 'listUbuntuAmisAction',
  })
  .inputSchema(listUbuntuAmisSchema)
  .action(async ({ clientInput, ctx }) => {
    const { accountId, region } = clientInput
    const { payload } = ctx

    const awsAccountDetails = await payload.findByID({
      collection: 'cloudProviderAccounts',
      id: accountId,
    })

    const accessKeyId = awsAccountDetails.awsDetails?.accessKeyId
    const secretAccessKey = awsAccountDetails.awsDetails?.secretAccessKey

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS account credentials not found')
    }

    const ec2Client = new EC2Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })

    const response = await ec2Client.send(
      new DescribeImagesCommand({
        Owners: ['099720109477'], // Canonical
        Filters: [
          { Name: 'architecture', Values: ['x86_64'] },
          { Name: 'root-device-type', Values: ['ebs'] },
          { Name: 'virtualization-type', Values: ['hvm'] },
          { Name: 'state', Values: ['available'] },
          {
            Name: 'name',
            Values: [
              'ubuntu/images/hvm-ssd/ubuntu-24.04-amd64-server-*',
              'ubuntu/images/hvm-ssd/ubuntu-22.04-amd64-server-*',
              'ubuntu/images/hvm-ssd/ubuntu-20.04-amd64-server-*',
            ],
          },
        ],
      }),
    )

    const latestByVersion = new Map<
      string,
      { label: string; value: string; created: string }
    >()
    for (const image of response.Images ?? []) {
      const match = image.Name?.match(/ubuntu-(\d+\.\d+)-amd64-server-/)
      if (!match || !image.ImageId) continue
      const version = match[1]
      const created = image.CreationDate ?? ''
      if (!latestByVersion.has(version) || created > (latestByVersion.get(version)?.created ?? '')) {
        latestByVersion.set(version, {
          label: `Ubuntu Server ${version} LTS`,
          value: image.ImageId,
          created,
        })
      }
    }

    return [...latestByVersion.entries()]
      .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
      .map(([version, { label, value }]) => ({ version, label, value }))
  })

// Resizes an AWS-provisioned server (#365). EC2 cannot change an instance
// type while running, so this stops the instance, modifies the type, and
// starts it again — a few minutes of downtime, not a redeploy. The start
// runs in a finally block so a failed resize never strands the instance.
export const upgradeEC2InstanceTypeAction = protectedClient
  .metadata({
    actionName: 'upgradeEC2InstanceTypeAction',
  })
  .inputSchema(upgradeEC2InstanceTypeSchema)
  .action(async ({ clientInput, ctx }) => {
    const { serverId, instanceType } = clientInput
    const {
      payload,
      user,
      userTenant: { tenant },
    } = ctx

    const server = await payload.findByID({
      collection: 'servers',
      id: serverId,
      depth: 1,
    })

    // findByID bypasses access control — verify the server belongs to the
    // caller's current tenant before touching AWS.
    const serverTenantId =
      typeof server.tenant === 'object' ? server.tenant?.id : server.tenant
    if (!serverTenantId || serverTenantId !== tenant.id) {
      throw new Error('Server not found')
    }

    if (server.provider !== 'aws' || !server.awsEc2Details?.instanceId) {
      throw new Error(
        'Instance type can only be changed on AWS-provisioned servers',
      )
    }

    const { instanceId, region } = server.awsEc2Details
    if (server.awsEc2Details.instanceType === instanceType) {
      return { success: true, message: 'Instance is already this type' }
    }

    const accountId =
      typeof server.cloudProviderAccount === 'object'
        ? server.cloudProviderAccount?.id
        : server.cloudProviderAccount

    if (!accountId) {
      throw new Error('No cloud provider account linked to this server')
    }

    const awsAccountDetails = await payload.findByID({
      collection: 'cloudProviderAccounts',
      id: accountId,
    })

    const accessKeyId = awsAccountDetails?.awsDetails?.accessKeyId
    const secretAccessKey = awsAccountDetails?.awsDetails?.secretAccessKey
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS account credentials not found')
    }

    const ec2Client = new EC2Client({
      region: region || 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
    })

    const { Reservations } = await ec2Client.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
    )
    const state = Reservations?.[0]?.Instances?.[0]?.State?.Name

    if (!state || state === 'terminated' || state === 'shutting-down') {
      throw new Error('EC2 instance no longer exists')
    }

    if (state !== 'stopped') {
      await ec2Client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }))
      await waitUntilInstanceStopped(
        { client: ec2Client, maxWaitTime: 180 },
        { InstanceIds: [instanceId] },
      )
    }

    try {
      await ec2Client.send(
        new ModifyInstanceAttributeCommand({
          InstanceId: instanceId,
          InstanceType: { Value: instanceType as _InstanceType },
        }),
      )
    } finally {
      await ec2Client.send(
        new StartInstancesCommand({ InstanceIds: [instanceId] }),
      )
    }

    await waitUntilInstanceRunning(
      { client: ec2Client, maxWaitTime: 180 },
      { InstanceIds: [instanceId] },
    )

    const updated = await payload.update({
      collection: 'servers',
      id: serverId,
      data: {
        awsEc2Details: {
          ...server.awsEc2Details,
          instanceType,
        },
      },
    })

    const { trackActivity } = await import('@/lib/activityTracker')
    await trackActivity({
      payload,
      userId: user.id,
      eventType: 'server_resized',
      operation: 'update',
      label: 'Server Resized',
      status: 'success',
      severity: 'warning',
      category: 'server',
      collectionSlug: 'servers',
      documentId: serverId,
      icon: 'server',
      metadata: {
        instanceId,
        from: server.awsEc2Details.instanceType,
        to: instanceType,
      },
    })

    const tenantSlug = extractTenantSlug(server.tenant)
    if (tenantSlug) revalidatePath(`/${tenantSlug}/servers/${server.id}`)

    return { success: true, server: updated }
  })
