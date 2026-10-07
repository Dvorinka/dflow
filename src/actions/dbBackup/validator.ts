import { z } from 'zod'

export const internalDBBackupSchema = z.object({
  serviceId: z.string(),
})

export const internalRestoreSchema = z.object({
  serviceId: z.string(),
  backupId: z.string(),
})

export const internalDbDeleteScheme = z.object({
  serviceId: z.string(),
  backupId: z.string(),
  databaseType: z.string().optional(),
  databaseName: z.string().optional(),
})

export const externalBackupSchema = z.object({
  serviceId: z.string(),
})

export const scheduleExternalBackupSchema = z.object({
  serviceId: z.string(),
  // basic cron sanity: five whitespace-separated fields
  schedule: z
    .string()
    .min(9)
    .regex(/^\S+( \S+){4}$/, 'Expected a cron expression like 0 3 * * *'),
})
