import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        // @kabelsalat/web (used by @strudel/core) publishes its ES module only
        // through the "module" field, which Node ignores. Letting Vite
        // process these packages resolves it the way the bundlers do.
        inline: ['@strudel/mini', '@strudel/core', '@kabelsalat/web'],
      },
    },
  },
});
