import { z } from 'zod'

import raw from '../../config/package-versions.json'

const schema = z.object({
  dokku: z.string().min(1),
  railpack: z.string().min(1).nullable(),
  netdata: z.string().min(1).nullable(),
  beszel: z.object({
    hub: z.string().min(1).nullable(),
    agent: z.string().min(1).nullable(),
  }),
  dokkuPlugins: z.record(z.string(), z.string().min(1).nullable()),
})

// Validated once at import; a malformed versions file fails fast instead
// of provisioning servers with undefined versions.
export const packageVersions = schema.parse(raw)

export const getDokkuPluginVersion = (name: string): string | null =>
  packageVersions.dokkuPlugins[name] ?? null
