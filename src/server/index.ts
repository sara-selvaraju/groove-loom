import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);

// Railway variables, one set per environment. Without both, the AI is off and
// everything else still works.
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const inviteCode = process.env.INVITE_CODE?.trim() || null;

const app = createApp({
  // Set by Railway on deploys built from GitHub. Deploys made with
  // `railway up` have no git metadata, so the version is the check there.
  commit: process.env.RAILWAY_GIT_COMMIT_SHA,
  compose: {
    messages: apiKey ? new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 }).beta.messages : null,
    inviteCode,
    model: process.env.ANTHROPIC_MODEL?.trim() || undefined,
  },
});

console.log(`AI ${apiKey && inviteCode ? 'on' : 'off'}${apiKey ? '' : ' (no ANTHROPIC_API_KEY)'}${inviteCode ? '' : ' (no INVITE_CODE)'}`);

const server = serve({ fetch: app.fetch, port, hostname: '::' }, (info) => {
  console.log(`Groove Loom listening on port ${info.port}`);
});

// Railway sends SIGTERM before replacing a deploy; finish in-flight requests.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
