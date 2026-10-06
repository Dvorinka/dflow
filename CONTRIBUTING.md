# Contributing to dFlow (community fork)

This is a community-maintained fork. Upstream `dflow-sh/dflow` is
unmaintained; development continues here independently.

## Quick start

```bash
pnpm install
cp .env.example .env   # fill in secrets, never commit .env
docker compose up -d   # mongodb + redis
pnpm dev
```

`docker compose up` must run the full stack. If it doesn't, that's a bug —
file it.

## Changing code

- One focused change per PR. Branch off `main`, open a PR against `main`.
- Never push to `main` directly.
- Run before pushing: `pnpm build`, `pnpm lint`, `npx tsc --noEmit`.
- No secrets in code, logs, or fixtures. `.env` is gitignored.
- Auth behaviour is env-gated (`AUTH_METHOD` in `.env.example`). New auth
  paths must respect `src/lib/authMethod.ts` instead of reading the
  `auth-config` global directly.
- No new dependencies without justification in the PR body.

## Reporting issues

Use the issue templates. Include: version/commit, expected vs actual,
minimal repro steps, relevant logs (redact secrets).
