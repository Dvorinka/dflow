# Security Policy

## Supported versions

Only the latest `main` is supported with security updates. There are no
LTS releases from this fork.

## Reporting a vulnerability

Open a **private** report via GitHub Security Advisories on this repo
(`Security` tab → `Report a vulnerability`). Do not open a public issue
for vulnerabilities.

Include: affected version/commit, impact, and a minimal repro if possible.
We aim to acknowledge within 72 hours.

## Scope notes

- Magic-link tokens are single-use (Redis) with 10-minute expiry and are
  rejected entirely when `AUTH_METHOD=email-password` or Resend is
  unconfigured.
- Session cookies are `httpOnly`, `secure` outside development, 7-day TTL.

## Data protection (#104)

Secrets are encrypted at rest with `@oversightstudio/encrypted-fields`.
Covered collections: SSH keys, cloud provider accounts (AWS keys, API
tokens), service credentials and variables, Docker registry passwords,
and template secrets. Even with database access, key material is not
readable without the application encryption key. Never log decrypted
values; the logger redacts configured paths.
