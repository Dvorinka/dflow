import { z } from 'zod'

export const supportedPluginsSchema = z.enum([
  'postgres',
  'mysql',
  'mongo',
  'mariadb',
  'redis',
  'letsencrypt',
  'rabbitmq',
  'clickhouse',
])

export const installPluginSchema = z.object({
  serverId: z.string(),
  pluginName: supportedPluginsSchema,
  pluginURL: z.string(),
})

export const installCustomPluginSchema = z.object({
  serverId: z.string(),
  pluginName: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      'Lowercase letters, numbers and hyphens only',
    ),
  pluginURL: z
    .string()
    .url('Must be a valid git URL')
    .refine(url => url.endsWith('.git'), 'URL must end with .git'),
})

export const checkPluginUsageSchema = z.object({
  serverId: z.string(),
  category: z.string(),
  pluginName: supportedPluginsSchema,
  connectionType: z.enum(['ssh', 'tailscale']),
})

export const syncPluginSchema = z.object({
  serverId: z.string(),
})

export const togglePluginStatusSchema = z.object({
  serverId: z.string(),
  pluginName: supportedPluginsSchema,
  pluginURL: z.string(),
  enabled: z.boolean(),
})

export const configureLetsencryptPluginSchema = z.object({
  email: z
    .string()
    .email({
      message: 'Email is invalid',
    })
    .optional(),
  autoGenerateSSL: z.boolean().default(false),
  serverId: z.string(),
})

export const installAndConfigureLetsencryptPluginSchema = z.object({
  serverId: z.string(),
})
