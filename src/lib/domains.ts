import { env } from 'env'

/**
 * Default per-service domain under the proxy suffix.
 * Flattened to a single level (`name-hostname.proxy.tld`) instead of
 * `name.hostname.proxy.tld` so the hostname is compatible with
 * Cloudflare custom hostnames / CF-for-SaaS, which only support
 * single-level subdomains by default.
 */
export const defaultServiceDomain = (
  serviceName: string,
  serverHostname: string,
) =>
  `${serviceName}-${serverHostname}.${env.NEXT_PUBLIC_PROXY_DOMAIN_URL}`
