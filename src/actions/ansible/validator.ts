import { z } from 'zod'

export const runAnsiblePlaybookSchema = z.object({
  playbookId: z.string().min(1),
  serverId: z.string().min(1),
})

export const createPlaybookSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  playbook: z.string().min(1),
})

export const deletePlaybookSchema = z.object({
  playbookId: z.string().min(1),
})

export const getAnsibleExecutionsSchema = z.object({
  serverId: z.string().min(1),
  limit: z.number().max(50).default(10),
})
