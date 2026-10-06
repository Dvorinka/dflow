---
title: 'Security Practices'
category: 'Security'
order: 2
categoryOrder: 5
---

# Security Practices

Known security posture and issues to be aware of when self-hosting dFlow.

## Authentication

- Email + password and passwordless magic links are both supported. The
  `AUTH_METHOD` environment variable can lock the instance to one method;
  without a configured email provider the app degrades to passwords only.
- Magic-link tokens are single-use, expire after 10 minutes, and are
  rejected entirely when magic links are disabled.
- Session cookies are `httpOnly`, `secure` outside development, and expire
  after 7 days.
- Usernames become tenant slugs in URLs, so reserved route names (`admin`,
  `api`, `onboarding`, ...) are rejected at signup.

## Authorization

- Role-based access control gates every action (services, servers, backups,
  plugins, billing). The Payload admin panel requires the admin role.
- Cross-tenant reads additionally scope by tenant slug; per-user restricted
  roles never share cached reads.

## Secrets at rest

SSH keys, cloud credentials, service variables, registry passwords, and
template secrets are encrypted in the database. Without the application
encryption key they are unreadable, but treat database dumps as sensitive
regardless.

## Platform surface

- GitHub webhooks verify the `x-hub-signature-256` signature before doing
  anything, and only tracked repository + branch combinations deploy.
- Dokku storage outside `/var/lib/dokku/data/storage/` is never deleted
  automatically; volume removal paths validate names before running `rm`.
- Redis log buffers expire after 7 days; deployment records are the durable
  log store.

## Reporting issues

Do not open public issues for vulnerabilities. See `SECURITY.md` for the
private reporting process.
