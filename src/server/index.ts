import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);

const app = createApp({
  // Set by Railway on deploys built from GitHub. Deploys made with
  // `railway up` have no git metadata, so the version is the check there.
  commit: process.env.RAILWAY_GIT_COMMIT_SHA,
});

const server = serve({ fetch: app.fetch, port, hostname: '::' }, (info) => {
  console.log(`Groove Loom listening on port ${info.port}`);
});

// Railway sends SIGTERM before replacing a deploy; finish in-flight requests.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
