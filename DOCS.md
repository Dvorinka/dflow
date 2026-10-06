## Documentation

#### Overview

This repository is built using Next.js. Let's explore the repository structure:

#### Folder structure

```bash

├── src
│   ├── actions (next safe actions)
│   ├── app  (next.js app directory)
│   ├── components (reusable components)
│   ├── docs (internal documentation files)
│   ├── hooks (reusable hooks)
│   ├── lib (utility functions)
│   ├── payload (Payload CMS)
│   ├── providers (context providers)
│   ├── queues (message queues)
```

#### Internal Documentation

Any issue that you are working feels user of the application needs some
technical assitance at a point, you can write show documentation right inside
the application. We are using
[content collections](https://www.content-collections.dev) to write
documentation.

#### How to add documentation

1. Create a new folder in the `src/docs` directory.
2. Name the folder according to the topic you are documenting.
   - Example: `src/docs/nextjs-setup`
3. Inside the folder, create file with appropriate name.
   - Example: `src/docs/nextjs-setup/first-doc.md`
4. Use Markdown syntax to write the documentation.
5. Add relevant code snippets, images, or links as needed.
6. Save the file.
7. The documentation will be automatically available in the application.
8. You can access the documentation by navigating to the
   `/docs/{folder-name}/{file-name}` route in your application.

In the application, you can use the `SidebarToggleButton` component from
`src/components` to toggle the sidebar and view a specific contennt from
documentation.

To this component, you need to pass 3 props:

- `directory`: folder name of the documentation.
- `fileName`: file name of the documentation.
- `sectionId`: title of the documentation.

#### Example

```tsx
<SidebarToggleButton
  directory='services'
  fileName='database-service'
  sectionId='#-external-credentials'
/>
```

#### Queue triggering (server actions vs payload hooks)

Background work runs on BullMQ queues in `src/queues/<area>/<job>.ts`. Each
queue exposes an `add*Queue(data)` function plus a worker created by
`getWorker` in `src/lib/bullmq.ts` (centralized logging with tenant/user
attribution).

Conventions:

- Server actions (`src/actions/**/index.ts`) trigger queues after the
  database write: deployments, domain changes, plugin install/sync,
  backups, cleanup, monitoring setup, EC2 provisioning.
- Payload hooks trigger queues only for side effects owned by the data
  layer: collection `afterChange` hooks log user activity
  (`src/lib/activityTracker.ts` backed by the `activity` collection) for
  project creation and server add/onboard events.
- Scheduled work uses Payload jobs (`src/payload/jobs/*` with cron):
  SSH connection checks, activity retention, opt-in server cleanup.
- Log streaming uses Redis pub/sub + per-deployment lists
  (`src/lib/sendEvent.ts`); lists expire after 7 days, records are durable.

Keep CPU/SSH-heavy work in queues, never in hooks: hooks run inside the
request lifecycle and cannot be retried independently.
