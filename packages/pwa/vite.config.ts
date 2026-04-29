import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

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
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    open: true,
  },
});
