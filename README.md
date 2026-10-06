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
> maintained. This fork is developed independently by the community — all
> original issues and pull requests were migrated here and development
> continues in this repository. It is not affiliated with or endorsed by
> dFlow Cloud ([dflow.sh](https://dflow.sh)).

> This repository is a public snapshot of older dFlow code. It is not dFlow
> Cloud, and it is not a supported self-host product. You may fork and modify it
> for your own use under [license.md](./license.md). That license does not apply
> to Cloud or private platform source. For the hosted product, see
> [dflow.sh](https://dflow.sh).

<br/>
<br/>

<a href="https://dflow.sh">
    <img src="public/dFlow-architecture.png" alt="dFlow Architecture diagram" align="center" width="100%"  />
</a>

<br/>
<br/>

## Features

- **Deploy Anything**: Deploy any Public/Private Git repository, Docker image
  and Databases (Postgres, MongoDB, MySQL, MariaDB, Redis).
- **Works on your infrastructure**: Run dFlow on AWS, Azure, Hetzner, or your
  own machine.
- **Private Networking**: Zero trust support using Tailscale end-to-end
  encryption. No SSH-Keys required.
- **Role Based Access Control**: Create an unlimited number of custom roles and
  permissions for admin and end users.
- **Templates**: Kick start your deployments with ready made popular templates
- **White Labeling**: Full customization with your branding, domains, and more.

**[See more on our website](https://dflow.sh)**.

<br/>

## Configuration

Copy `.env.example` to `.env` and fill in secrets (never commit `.env`).
Key variables introduced by this fork:

- `AUTH_METHOD` — `email-password` disables magic links (e.g. no email
  provider), `magic-link` for passwordless-only, `both` (default) allows
  either. Unset = Admin UI AuthConfig global decides. Magic links also
  require Resend; without it the app degrades to email-password.
- `NEXT_PUBLIC_APP_VERSION` — build version (e.g. git SHA) for stale-build
  detection. Unset = version check silent.
- `NEXT_PUBLIC_AUTH_SYNC_DOMAINS` — comma-separated sibling domains for
  cross-app logout sync. Unset = disabled.
- `SERVER_DETAILS_CACHE_TTL` — seconds to cache populated server details
  in Redis (default 300).
- `AUTH_METHOD`, package pins in `config/package-versions.json` (dokku,
  plugins, infra versions), Dependabot runs grouped weekly updates.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full dev workflow.

<br/>

## Community support

For general help using dFlow, please refer to
[the official dFlow documentation](https://dflow.sh/docs). For additional help,
you can use one of these channels to ask a question:

- [Discord](https://discord.gg/5w7JUQYaAD) (For live discussion with the
  Community and dFlow team)
- [GitHub](https://github.com/Dvorinka/dflow)
- [X](https://x.com/dflow_sh) (Get the news fast)
- [YouTube Channel](https://www.youtube.com/@paas-dflow-sh) (Learn from Video
  Tutorials)
