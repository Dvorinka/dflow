'use server'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { publicClient } from '@/lib/safe-action'
import { effectiveAuthMethod } from '@/lib/authMethod'

export const getAuthConfigAction = publicClient
  .metadata({ actionName: 'fetchAuthConfigAction' })
  .action(async () => {
    const payload = await getPayload({ config: configPromise })

    try {
      const authConfig = await payload.findGlobal({
        slug: 'auth-config',
        depth: 0,
      })

      // Env override + Resend guard applied in one place; all auth
      // pages consume this action so the method is consistent.
      return {
        success: true,
        authConfig: {
          ...authConfig,
          authMethod: effectiveAuthMethod(authConfig?.authMethod),
        },
      }
    } catch (error) {
      // Return default config if global not found or error occurs
      return {
        success: true,
        authConfig: {
          authMethod: 'both',
        },
      }
    }
  })
