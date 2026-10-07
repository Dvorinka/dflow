import { z } from 'zod'

const awsAuthMethodSchema = z.enum(['keys', 'ambient']).default('keys')

export const connectAWSAccountSchema = z
  .object({
    authMethod: awsAuthMethodSchema,
    accessKeyId: z.string().optional().default(''),
    secretAccessKey: z.string().optional().default(''),
    name: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (data.authMethod === 'keys') {
      if (!data.accessKeyId.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['accessKeyId'],
          message: 'Access Key ID is required',
        })
      }
      if (!data.secretAccessKey.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['secretAccessKey'],
          message: 'Secret Access Key is required',
        })
      }
    }
  })

export const updateAWSAccountSchema = z
  .object({
    authMethod: awsAuthMethodSchema,
    accessKeyId: z.string().optional().default(''),
    secretAccessKey: z.string().optional().default(''),
    name: z.string().min(1),
    id: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.authMethod === 'keys') {
      if (!data.accessKeyId.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['accessKeyId'],
          message: 'Access Key ID is required',
        })
      }
      if (!data.secretAccessKey.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['secretAccessKey'],
          message: 'Secret Access Key is required',
        })
      }
    }
  })

export const deleteAWSAccountSchema = z.object({
  id: z.string(),
})

export const createEC2InstanceSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  sshKeyId: z.string(),
  accountId: z.string(),
  region: z.string(),
  ami: z.string(),
  instanceType: z.string(),
  diskSize: z.number().min(30),
  securityGroupIds: z.array(z.string()).optional(),
})

// Security Group Schemas
export const securityGroupRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  protocol: z.enum(['tcp', 'udp', 'icmp', 'all']),
  fromPort: z.number().min(0).max(65535),
  toPort: z.number().min(0).max(65535),
  cidrIp: z.string().ip({ version: 'v4' }).or(z.literal('0.0.0.0/0')),
  direction: z.enum(['ingress', 'egress']),
})

export const createSecurityGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  region: z.string().min(1),
  accountId: z.string().min(1),
  rules: z.array(securityGroupRuleSchema).optional(),
})

export const updateSecurityGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  rulesToAdd: z.array(securityGroupRuleSchema).optional(),
  rulesToRemove: z.array(z.string()).optional(), // Rule IDs to remove
})

export const deleteSecurityGroupSchema = z.object({
  id: z.string().min(1),
  region: z.string().min(1),
  accountId: z.string().min(1),
})

export const updateEC2InstanceSchema = z.object({
  serverId: z.string(),
  instanceId: z.string(),
  accountId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  securityGroupsIds: z.array(z.string()).optional(),
})

export const upgradeEC2InstanceTypeSchema = z.object({
  serverId: z.string(),
  instanceType: z.string().min(1, 'Instance type is required'),
})

export const checkAWSConnectionSchema = z.object({
  authMethod: z.enum(['keys', 'ambient']).optional().default('keys'),
  accessKeyId: z.string().optional().default(''),
  secretAccessKey: z.string().optional().default(''),
  region: z.string().optional().default('us-east-1'),
})

export const listUbuntuAmisSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  region: z.string().min(1, 'Region is required'),
})
