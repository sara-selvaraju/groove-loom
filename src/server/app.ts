import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import pkg from '../../package.json' with { type: 'json' };
import { mountCompose, type ComposeOptions } from './compose.js';

export interface AppOptions {
  /** Folder holding the built front end. Relative paths resolve from the working directory. */
  staticRoot?: string;
  /** Commit the running build came from, when the host provides it. */
  commit?: string;
  /** The AI endpoint. Without it, /api/compose reports the AI as unavailable. */
  compose?: ComposeOptions;
}

export interface Health {
  ok: true;
  version: string;
  commit: string;
}

export function createApp(options: AppOptions = {}) {
  const staticRoot = options.staticRoot ?? 'dist/web';
  const health: Health = {
    ok: true,
    version: pkg.version,
    commit: options.commit ?? 'unknown',
  };

  const app = new Hono();

  // Strict from day one: everything comes from this origin, and no inline
  // script runs. Browser-held AI keys in phase 2 depend on this staying
  // strict, so loosen a directive only for a named reason.
  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
  );

  app.get('/healthz', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(health);
  });

  mountCompose(app, options.compose ?? { messages: null, inviteCode: null });

  // Vite fingerprints everything under /assets, so it can be cached forever.
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });

  app.use('/*', serveStatic({ root: staticRoot }));

  return app;
}
