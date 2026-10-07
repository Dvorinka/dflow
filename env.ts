import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

const changeBasedOnENV = (env: any) => {
  if (process.env.NODE_ENV === 'development') {
    return `http://${env}`
  }
  if (process.env.NODE_ENV === 'production') return `https://${env}`

  return `http://${env}`
}

export const env = createEnv({
  server: {
    DATABASE_URI: z.string().min(1),
    PAYLOAD_SECRET: z.string().min(1),
    REDIS_URI: z.string().min(1),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_SENDER_EMAIL: z.string().email().optional(),
    RESEND_SENDER_NAME: z.string().min(1).optional(),
    TAILSCALE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
    TAILSCALE_TAILNET: z.string().min(1).optional(),
    // Custom control server (e.g. Headscale). Passed to
    // `tailscale up --login-server`. Leave unset for tailscale.com.
    TAILSCALE_LOGIN_SERVER: z.string().url().optional(),
    // NetBird management API (https://netbird.io or self-hosted).
    // Token is a Personal Access Token with setup-keys + peers scope.
    NETBIRD_API_URL: z.string().url().optional(),
    NETBIRD_API_TOKEN: z.string().min(1).optional(),
    // Self-hosted management address passed to `netbird up
    // --management-url`. Leave unset when using api.netbird.io.
    NETBIRD_MANAGEMENT_URL: z.string().url().optional(),
    // ZeroTier Central API (or self-hosted controller).
    // Token is a Central API token; network is the 16-char network ID.
    ZEROTIER_API_URL: z.string().url().optional(),
    ZEROTIER_API_TOKEN: z.string().min(1).optional(),
    ZEROTIER_NETWORK_ID: z.string().min(1).optional(),
    BESZEL_MONITORING_URL: z.string().min(1).optional(),
    BESZEL_SUPERUSER_EMAIL: z.string().min(1).optional(),
    BESZEL_SUPERUSER_PASSWORD: z.string().min(1).optional(),
    BESZEL_HUB_SSH_KEY: z.string().min(1).optional(),
    TAILSCALE_AUTH_KEY: z.string().min(1).optional(),
    S3_ENDPOINT: z.string().url().min(1).optional(),
    S3_REGION: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    AUTH_METHOD: z.enum(['email-password', 'magic-link', 'both']).optional(),
  },
  client: {
    NEXT_PUBLIC_WEBSITE_URL: z.string().url(),
    NEXT_PUBLIC_APP_VERSION: z.string().min(1).optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    // Comma-separated sibling domains for cross-app auth sync (#364).
    // Unset = sync disabled. Example: "app.dflow.sh"
    NEXT_PUBLIC_AUTH_SYNC_DOMAINS: z.string().optional(),
    NEXT_PUBLIC_WEBHOOK_URL: z.string().url().optional(),
    NEXT_PUBLIC_TELEMETRY_DISABLED: z.literal('1').optional(),
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: z.string().min(1).optional(),
    NEXT_PUBLIC_BETTER_STACK_INGESTING_URL: z.string().min(1).optional(),
    NEXT_PUBLIC_PROXY_DOMAIN_URL: z.string().optional(),
    NEXT_PUBLIC_PROXY_CNAME: z.string().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_WEBSITE_URL: changeBasedOnENV(
      process.env.NEXT_PUBLIC_WEBSITE_URL || process.env.RAILWAY_PUBLIC_DOMAIN,
    ),
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_AUTH_SYNC_DOMAINS: process.env.NEXT_PUBLIC_AUTH_SYNC_DOMAINS,
    NEXT_PUBLIC_WEBHOOK_URL: process.env.NEXT_PUBLIC_WEBHOOK_URL,
    DATABASE_URI: process.env.DATABASE_URI,
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
    REDIS_URI: process.env.REDIS_URI,
    NEXT_PUBLIC_TELEMETRY_DISABLED: process.env.NEXT_PUBLIC_TELEMETRY_DISABLED,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_SENDER_EMAIL: process.env.RESEND_SENDER_EMAIL,
    RESEND_SENDER_NAME: process.env.RESEND_SENDER_NAME,
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN:
      process.env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN,
    NEXT_PUBLIC_BETTER_STACK_INGESTING_URL:
      process.env.NEXT_PUBLIC_BETTER_STACK_INGESTING_URL,
    TAILSCALE_OAUTH_CLIENT_SECRET: process.env.TAILSCALE_OAUTH_CLIENT_SECRET,
    TAILSCALE_TAILNET: process.env.TAILSCALE_TAILNET,
    TAILSCALE_AUTH_KEY: process.env.TAILSCALE_AUTH_KEY,
    TAILSCALE_LOGIN_SERVER: process.env.TAILSCALE_LOGIN_SERVER,
    NETBIRD_API_URL: process.env.NETBIRD_API_URL,
    NETBIRD_API_TOKEN: process.env.NETBIRD_API_TOKEN,
    NETBIRD_MANAGEMENT_URL: process.env.NETBIRD_MANAGEMENT_URL,
    ZEROTIER_API_URL: process.env.ZEROTIER_API_URL,
    ZEROTIER_API_TOKEN: process.env.ZEROTIER_API_TOKEN,
    ZEROTIER_NETWORK_ID: process.env.ZEROTIER_NETWORK_ID,
    NEXT_PUBLIC_PROXY_DOMAIN_URL: process.env.NEXT_PUBLIC_PROXY_DOMAIN_URL,
    NEXT_PUBLIC_PROXY_CNAME: process.env.NEXT_PUBLIC_PROXY_CNAME,
    BESZEL_MONITORING_URL: process.env.BESZEL_MONITORING_URL,
    BESZEL_SUPERUSER_EMAIL: process.env.BESZEL_SUPERUSER_EMAIL,
    BESZEL_SUPERUSER_PASSWORD: process.env.BESZEL_SUPERUSER_PASSWORD,
    BESZEL_HUB_SSH_KEY: process.env.BESZEL_HUB_SSH_KEY,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    AUTH_METHOD: process.env.AUTH_METHOD,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_VALIDATION,
})
