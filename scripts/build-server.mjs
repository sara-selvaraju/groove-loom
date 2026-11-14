// Bundles the server into a single file. Bundling lets it import code shared
// with the front end (src/shared), and resolves @kabelsalat/web (used by
// @strudel/core) through its "module" field, which plain Node ignores.
// Pass --watch for local development.
import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  mainFields: ['module', 'main'],
  // Some bundled CommonJS dependencies call require(); give ESM output one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  sourcemap: true,
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
