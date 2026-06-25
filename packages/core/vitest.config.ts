import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      // Ensure cross-package imports resolve to source instead of stale dist.
      '@bsky/core': path.resolve(__dirname, './src/index.ts'),
    },
  },
});
