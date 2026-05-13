import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Load BLUESKY_* from .env and map to BSKY_*
const envPath = resolve(projectRoot, '.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^BLUESKY_(HANDLE|APP_PASSWORD)=(.*)/);
    if (m) {
      process.env[`BSKY_${m[1]}`] = m[2].trim();
    }
  }
}

// Forward BSKY_ENABLE_WRITE if set in environment
if (!process.env.BSKY_ENABLE_WRITE) {
  process.env.BSKY_ENABLE_WRITE = 'true';
}

const isWindows = process.platform === 'win32';

// Start the MCP server, inheriting stdio for MCP protocol
const child = spawn('npx', ['-y', '@epheiamoe/bsky-mcp'], {
  stdio: 'inherit',
  env: process.env,
  shell: isWindows, // npx is .cmd on Windows, needs shell
});

child.on('error', (err) => {
  console.error('Failed to start MCP server:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
