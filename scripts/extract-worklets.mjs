// Strudel embeds its AudioWorklet processors as data: URLs, which the
// Content Security Policy blocks (script-src 'self'). This writes each one to
// public/worklets/<processor>.js from the installed @strudel/web, so the files
// always match the Strudel version in use. src/web/worklets.ts redirects
// Strudel's addModule calls to them.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bundle = readFileSync(require.resolve('@strudel/web/dist/index.mjs'), 'utf8');
const outDir = new URL('../public/worklets/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const manifest = {};
for (const match of bundle.matchAll(/data:text\/javascript;base64,([A-Za-z0-9+/=]+)/g)) {
  const source = Buffer.from(match[1], 'base64').toString('utf8');
  const first = /registerProcessor\(\s*["']([^"']+)["']/.exec(source);
  if (!first) continue;
  const file = `${first[1]}.js`;
  writeFileSync(new URL(file, outDir), source);
  manifest[first[1]] = file;
}
if (Object.keys(manifest).length === 0) {
  throw new Error('No worklets found in @strudel/web; the bundle format may have changed.');
}
writeFileSync(new URL('manifest.json', outDir), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Extracted ${Object.keys(manifest).length} worklets: ${Object.keys(manifest).join(', ')}`);
