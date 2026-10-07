import { z } from 'zod'

export const generateNetbirdSetupKeySchema = z.object({
  hostname: z.string().min(1, 'Hostname is required'),
})

export const getNetbirdPeerSchema = z.object({
  hostname: z.string().min(1, 'Hostname is required'),
})
