---
title: 'Environments'
category: 'Projects'
order: 1
categoryOrder: 5
---

# Environments

Every project in dFlow can have multiple **environments** — isolated copies of
the project such as `staging`, `preview`, or `test`. Environments are
implemented as child projects, so each one gets its own services, domains,
variables, deployments, and optionally its own server.

## Creating an environment

Open a project and click the environment dropdown in the project header (it
shows the current environment, e.g. `production`). Choose **New environment**
and fill in:

- **Name** — lowercase identifier such as `staging`. This becomes part of the
  child project's name (`<project>-<env>`).
- **Server** — the server the environment runs on. Defaults to the production
  project's server; pick a different one to isolate workloads across machines.
- **Copy services from** — optionally clone every service from an existing
  environment into the new one.
- **Copy database contents** — when copying, also export and import the
  database data. The export runs against the source database without
  interrupting it, and works across servers (the dump is transferred through
  the dFlow host).

Cloned services keep their configuration, variables, volumes, and provider
settings. Domains are intentionally not copied — assign fresh domains to the
new environment's services to avoid collisions.

## Switching between environments

The same header dropdown lists every environment with the server it runs on.
Selecting one switches the whole project view — services, deployments, logs —
to that environment. The production project is listed as `production`.

## Isolation and access control

- Environments inherit the project's tenant and team permissions.
- Services, deployments, and variables are fully isolated between
  environments.
- Placing an environment on a different server isolates compute and storage —
  a broken `staging` cannot affect `production`.
- Database copies are one-way snapshots; the source database is never
  modified.

## Deleting an environment

Environments are deleted like any project: open the environment, go to its
settings, and delete it. This removes its services and releases the resources
on its server. The production project and other environments are unaffected.
