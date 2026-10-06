---
title: 'Deployment Process'
category: 'Services'
order: 7
categoryOrder: 4
---

# Deployment Process

How a service goes from "Deploy" to running on your server.

## Triggering a deployment

- **Dashboard**: the Deploy button on a service. After the first success,
  Redeploy asks for cache mode.
- **Git webhooks**: pushes (and fork-syncs) to the tracked branch and
  repository deploy automatically with `no-cache`.
- **Templates**: deploy every service in dependency order (databases first).

## Cache modes

- **Without cache** rebuilds or re-pulls the image from scratch. Docker
  services always redeploy this way so the fresh image is pulled.
- **With cache** rebuilds from the existing image (`dokku ps:rebuild`).
  Faster, but code changes may not be picked up.

## Lifecycle

Deployments move through `queued` → `building` → `success` or `failed`.
Each deployment runs as a queued background job per server, so concurrent
deploys to the same server run in order.

- **Queued** deployments can be cancelled from the deployments list. Jobs
  already building hold open SSH sessions and cannot be cancelled safely.
- **Logs** stream live while building and are persisted to the deployment
  record when the job finishes, so history stays available afterwards.

## Databases

Database services are created through the same flow with an optional pinned
image version (`--image-version`). Backups can be exported per database
and restored into the same or a newly created database of the same type;
cross-type restores are refused.
