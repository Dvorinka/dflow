import { env } from 'env'

type OriginCertificateResponse = {
  success: boolean
  errors?: { code: number; message: string }[]
  result?: {
    id: string
    certificate: string
    hostnames: string[]
    expires_on: string
  }
}

/**
 * Requests a Cloudflare Origin CA certificate. Requires the Origin CA
 * service key (CF_ORIGIN_CA_KEY) — created in the Cloudflare dashboard under
 * SSL/TLS → Origin Server → Origin Certificates.
 *
 * The returned certificate only authenticates the origin to Cloudflare; it is
 * not publicly trusted, so it is suitable when traffic flows through the
 * Cloudflare proxy (orange-clouded DNS records) in Full (strict) mode.
 */
export const createOriginCertificate = async ({
  hostnames,
  csr,
  validityDays = 5475,
}: {
  hostnames: string[]
  csr: string
  validityDays?: number
}): Promise<{ certificate: string; id: string; expiresOn: string }> => {
  const key = env.CF_ORIGIN_CA_KEY
  if (!key) {
    throw new Error(
      'CF_ORIGIN_CA_KEY is not set — add a Cloudflare Origin CA service key to use origin certificates',
    )
  }

  const response = await fetch(
    'https://api.cloudflare.com/client/v4/certificates',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-User-Service-Key': key,
      },
      body: JSON.stringify({
        hostnames,
        request_type: 'origin-rsa',
        requested_validity: validityDays,
        csr,
      }),
    },
  )

  const body = (await response.json()) as OriginCertificateResponse

  if (!response.ok || !body.success || !body.result) {
    const detail =
      body.errors?.map(e => `${e.code}: ${e.message}`).join('; ') ||
      `HTTP ${response.status}`
    throw new Error(`Cloudflare Origin CA request failed — ${detail}`)
  }

  return {
    certificate: body.result.certificate,
    id: body.result.id,
    expiresOn: body.result.expires_on,
  }
}
