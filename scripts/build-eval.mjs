// Bundles the eval scripts like the server (see build-server.mjs), so they can
// import the real compose handler and shared code.
import { build } from 'esbuild';

await build({
  entryPoints: { run: 'eval/compose/run.ts', summary: 'eval/compose/summary.ts' },
  outdir: 'dist/eval',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  mainFields: ['module', 'main'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
