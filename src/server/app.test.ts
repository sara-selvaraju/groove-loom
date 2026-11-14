import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { createApp } from './app.js';

let staticRoot: string;

beforeAll(() => {
  staticRoot = mkdtempSync(join(tmpdir(), 'groove-loom-static-'));
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><title>Groove Loom</title>');
  mkdirSync(join(staticRoot, 'assets'));
  writeFileSync(join(staticRoot, 'assets', 'main-abc123.js'), 'console.log(1)');
});

describe('GET /healthz', () => {
  it('reports ok with the package version and commit', async () => {
    const app = createApp({ staticRoot, commit: 'abc1234' });
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, version: pkg.version, commit: 'abc1234' });
  });

  it('says the commit is unknown when the host does not provide one', async () => {
    const res = await createApp({ staticRoot }).request('/healthz');
    expect(await res.json()).toMatchObject({ commit: 'unknown' });
  });
});

describe('static files', () => {
  it('serves index.html at the root', async () => {
    const res = await createApp({ staticRoot }).request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Groove Loom</title>');
  });

  it('caches fingerprinted assets for a year', async () => {
    const res = await createApp({ staticRoot }).request('/assets/main-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('returns 404 for unknown paths', async () => {
    const res = await createApp({ staticRoot }).request('/no-such-file.txt');
    expect(res.status).toBe(404);
  });
});

describe('security headers', () => {
  it('sends a strict Content Security Policy that blocks inline script', async () => {
    const res = await createApp({ staticRoot }).request('/');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
