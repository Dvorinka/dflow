import { z } from 'zod'

export const getZerotierMembersSchema = z.object({})

export const authorizeZerotierMemberSchema = z.object({
  nodeId: z.string().min(1, 'Node ID is required'),
  name: z.string().min(1, 'Name is required'),
})
