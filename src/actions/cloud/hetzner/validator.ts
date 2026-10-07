import { z } from 'zod'

export const connectHetznerAccountSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'Name should be at-least 1 character' })
    .max(50, { message: 'Name should be less than 50 characters' }),
  apiToken: z.string().min(1, { message: 'API token is required' }),
})

export const updateHetznerAccountSchema = connectHetznerAccountSchema.extend({
  id: z.string(),
})

export const hetznerAccountIdSchema = z.object({
  accountId: z.string().min(1, { message: 'Account is required' }),
})

export const createHetznerServerSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'Name should be at-least 1 character' })
    .max(50, { message: 'Name should be less than 50 characters' }),
  description: z.string().optional(),
  accountId: z.string().min(1, { message: 'Account is required' }),
  sshKeyId: z.string().min(1, { message: 'SSH key is required' }),
  location: z.string().min(1, { message: 'Location is required' }),
  serverType: z.string().min(1, { message: 'Server type is required' }),
  image: z.string().min(1, { message: 'Image is required' }),
})
