import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { execSync } from 'child_process';
import pkg from './package.json' with { type: 'json' };

const commitHash = execSync('git rev-parse HEAD').toString().trim();
const commitDesc = execSync('git log --format=%s -1').toString().trim();
const buildTime = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      os: resolve(__dirname, 'src/stubs/os.ts'),
      fs: resolve(__dirname, 'src/stubs/fs.ts'),
      path: resolve(__dirname, 'src/stubs/path.ts'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __COMMIT_DESC__: JSON.stringify(commitDesc),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
});
