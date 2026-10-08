import { z } from 'zod'

export const getEnvironmentsSchema = z.object({
  projectId: z.string(),
})

export const createEnvironmentSchema = z.object({
  projectId: z.string(),
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      'Use lowercase letters, numbers and dashes only',
    ),
  serverId: z.string().optional(),
  copyFromProjectId: z.string().optional(),
  cloneData: z.boolean().default(false),
})
