<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/images/dflow-logo-wordmark-light.svg">
  <source media="(prefers-color-scheme: light)" srcset="public/images/dflow-logo-wordmark-dark.svg">
  <img alt="dFlow logo" src="public/images/dflow-logo-wordmark-dark.svg" width="318px">
</picture>
</p>

<h3 align="center" style="text-wrap: balance;">dFlow is a platform for deploying, managing, and scaling git apps, Docker images, and databases on your own infrastructure.</h3>

> **Community-maintained fork.** The upstream repository
> ([dflow-sh/dflow](https://github.com/dflow-sh/dflow)) is no longer
> maintained. This fork is developed independently — fully open source,
> no hosted tier, no feature gates, no vendor lock-in. Everything runs on
> infrastructure you own; fork it, modify it, self-host it without
> restrictions.

<br/>

<img src="public/dFlow-architecture.png" alt="dFlow Architecture diagram" align="center" width="100%" />

<br/>
<br/>

## Features

- **Deploy Anything**: Deploy any Public/Private Git repository, Docker
  image, or database (Postgres, MongoDB, MySQL, MariaDB, Redis,
  ClickHouse, RabbitMQ, and more via dokku plugins).
- **Works on your infrastructure**: Attach any server over SSH, provision
  from AWS EC2 or Hetzner Cloud, or manage machines over a private mesh —
  Tailscale (or Headscale), NetBird, or ZeroTier, hosted or self-hosted.
- **Fully self-contained**: The bundled template catalog, monitoring
  agent template, and all integrations work without any external service.
  Nothing in this codebase phones home.
- **Private Networking**: Zero-trust, end-to-end-encrypted access via
  Tailscale/Headscale, NetBird, or ZeroTier — no exposed SSH ports
  required.
- **Role Based Access Control**: Unlimited custom roles and permissions
  for admin and end users, scoped per organisation.
- **Templates**: Kick-start deployments with the bundled template
  catalog, or create and share personal templates inside your instance.
- **Monitoring**: Optional Beszel integration for server and service
  metrics.
- **Backups & Migration**: Internal database backups, restores, and
  cross-server database migration.
- **White Labeling**: Full customization with your branding, domains, and
  theme.

<br/>

## Quick start

### One-command install (Docker)

Runs the app + MongoDB + Redis on any machine with Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/Dvorinka/dflow/main/install.sh | bash
```

Then open http://localhost:3000 and create your admin account. Optional
compose profiles add a Traefik reverse proxy with TLS (`--profile proxy`)
and Beszel monitoring (`--profile monitoring`).

### From source

Requirements: Docker (MongoDB + Redis), Node.js 22+, pnpm.

```bash
cp .env.example .env        # fill in DATABASE_URI, REDIS_URI, PAYLOAD_SECRET
pnpm install
pnpm generate:types         # optional; pre-generated types are committed
pnpm dev
```

Then open the app, create your admin account, and add a server:

- **Public** — any reachable IP + SSH key (works with any VPS provider:
  Hostinger, Hetzner, OVH, bare metal, …).
- **Tailscale** — enrol via auth key; set `TAILSCALE_LOGIN_SERVER` for a
  Headscale-compatible control server.
- **NetBird** — enrol via setup key (hosted or self-hosted management),
  connect over the mesh IP.
- **ZeroTier** — join a Central or self-hosted controller network,
  auto-authorize, connect over the mesh IP.
- **Hetzner Cloud** — provision servers directly from your Hetzner
  account (API token in Integrations → Cloud Providers).
- **AWS** — provision EC2 instances from your cloud-provider account.

Every attached server gets Dokku installed automatically over SSH — the
only requirements are Ubuntu/Debian and SSH access. See
[`docs/`](./docs) and the in-app documentation.

<br/>

## Configuration

Copy `.env.example` to `.env` and fill in secrets (never commit `.env`).

- `AUTH_METHOD` — `email-password` disables magic links (e.g. no email
  provider), `magic-link` for passwordless-only, `both` (default) allows
  either. Unset = the Auth Config global in the admin UI decides. Magic
  links require Resend; without it the app degrades to email-password.
- `NEXT_PUBLIC_TELEMETRY_DISABLED` — set to `1` to disable telemetry.
- `NEXT_PUBLIC_APP_VERSION` — build version (e.g. git SHA) for
  stale-build detection. Unset = version check silent.
- `NEXT_PUBLIC_AUTH_SYNC_DOMAINS` — comma-separated sibling domains for
  cross-app session sync. Unset = disabled.
- `NETBIRD_API_TOKEN` / `NETBIRD_API_URL` / `NETBIRD_MANAGEMENT_URL` —
  NetBird management API (hosted `api.netbird.io` or self-hosted). Unset
  = the NetBird tab accepts a manually pasted setup key.
- `ZEROTIER_API_TOKEN` / `ZEROTIER_API_URL` / `ZEROTIER_NETWORK_ID` —
  ZeroTier Central or self-hosted controller. Unset = the ZeroTier tab
  accepts a manually pasted `zerotier-cli join` command.
- `TAILSCALE_LOGIN_SERVER` — Headscale-compatible control server URL.
  Unset = tailscale.com.
- `SERVER_DETAILS_CACHE_TTL` — seconds to cache populated server details
  in Redis (default 300).
- Package pins live in `config/package-versions.json` (dokku, plugins,
  infra versions); Dependabot runs grouped weekly updates.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full dev workflow.

<br/>

## Community & support

- [GitHub issues](https://github.com/Dvorinka/dflow/issues) — bug reports
  and feature requests.
- [GitHub discussions](https://github.com/Dvorinka/dflow/discussions) —
  questions and ideas.
- In-app documentation under **Docs** in the dashboard.
