#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './components/App.jsx';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import type { ReadStream } from 'tty';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPaths = [
  path.resolve(__dirname, '..', '..', '..', '.env'),
  path.resolve(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

const HANDLE = process.env.BLUESKY_HANDLE;
const APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD;
const LLM_API_KEY = process.env.LLM_API_KEY;

if (!HANDLE || !APP_PASSWORD) {
  console.error('Error: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set in .env');
  console.error('Copy .env.example to .env and fill in your credentials.');
  process.exit(1);
}

const config = {
  blueskyHandle: HANDLE,
  blueskyPassword: APP_PASSWORD,
  aiConfig: {
    apiKey: LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
    model: process.env.LLM_MODEL || 'deepseek-chat',
  },
};

// Check raw mode support
let isRawMode = false;
try {
  const stdin = process.stdin as ReadStream;
  if (stdin.isTTY) {
    stdin.setRawMode(true);
    isRawMode = true;
  }
} catch {}

// Create input stream for ink
let inputStream: ReadStream;
if (isRawMode) {
  inputStream = process.stdin as ReadStream;
} else {
  const rs = new Readable({ read() {} });
  (rs as unknown as Record<string, unknown>).isTTY = true;
  (rs as unknown as Record<string, unknown>).setRawMode = ((_mode: boolean) => rs);
  inputStream = rs as unknown as ReadStream;
  try { (process.stdin as ReadStream).resume(); } catch {}
  process.stdin.on('data', (c) => {
    try { rs.push(c); } catch {}
  });
}

const { waitUntilExit } = render(React.createElement(App, { config, isRawModeSupported: isRawMode }), {
  stdin: inputStream,
  stdout: process.stdout,
  stderr: process.stderr,
  exitOnCtrlC: true,
});

waitUntilExit().catch(console.error);
