import { env } from 'env'

type TxtRecord = { name: string; value: string }

type CustomHostnameResult = {
  id: string
  hostname: string
  status: string
  ownership_validation?: { type: string; name: string; value: string }
  ssl?: {
    status: string
    validation_records?: { txt_name?: string; txt_value?: string }[]
  }
}

type CloudflareResponse = {
  success: boolean
  errors?: { code: number; message: string }[]
  result?: CustomHostnameResult
}

const request = async (path: string, init: RequestInit) => {
  const token = env.CF_API_TOKEN
  const zoneId = env.CF_ZONE_ID
  if (!token || !zoneId) {
    throw new Error(
      'CF_API_TOKEN / CF_ZONE_ID are not set — configure them to use Cloudflare custom hostnames',
    )
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames${path}`,
    {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  )

  const body = (await response.json()) as CloudflareResponse

  if (!response.ok || !body.success) {
    const detail =
      body.errors?.map(e => `${e.code}: ${e.message}`).join('; ') ||
      `HTTP ${response.status}`
    throw new Error(`Cloudflare custom hostname request failed — ${detail}`)
  }

  return body.result
}

/**
 * Registers a Cloudflare-for-SaaS custom hostname on the configured zone.
 * SSL uses TXT DCV — the caller must surface the returned records so the
 * user can create them at their DNS provider before the hostname
 * activates.
 */
export const createCustomHostname = async (hostname: string) => {
  const result = await request('', {
    method: 'POST',
    body: JSON.stringify({
      hostname,
      ssl: {
        method: 'txt',
        type: 'dv',
        settings: { http2: 'on' },
      },
    }),
  })

  if (!result) {
    throw new Error('Cloudflare returned no custom hostname result')
  }

  const records: TxtRecord[] = []

  if (result.ownership_validation?.name) {
    records.push({
      name: result.ownership_validation.name,
      value: result.ownership_validation.value,
    })
  }

  for (const record of result.ssl?.validation_records ?? []) {
    if (record.txt_name && record.txt_value) {
      records.push({ name: record.txt_name, value: record.txt_value })
    }
  }

  return {
    id: result.id,
    status: result.ssl?.status ?? result.status,
    validationRecords: records,
  }
}

export const deleteCustomHostname = async (customHostnameId: string) => {
  await request(`/${customHostnameId}`, { method: 'DELETE' })
}
