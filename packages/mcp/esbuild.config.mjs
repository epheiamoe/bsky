import * as esbuild from 'esbuild';

// Bundle workspace packages (@bsky/core, @bsky/ddg-search) into the output.
// Externalize npm registry packages (dotenv, ky, @modelcontextprotocol/sdk)
// so they are installed normally by the end user.

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/index.js',
  banner: {
    js: '#!/usr/bin/env node',
  },
  // Only bundle workspace packages — everything else stays as runtime deps
  external: [
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/*',
    'dotenv',
    'ky',
    // Also exclude Node built-ins
    'node:*',
  ],
  sourcemap: true,
  minify: false,
});

console.log('MCP bundle built successfully.');
