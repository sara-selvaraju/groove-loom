// Bundles the server into a single file so it can import code shared with
// the front end (src/shared) without path rewriting. Runtime dependencies
// stay external and are loaded from node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
