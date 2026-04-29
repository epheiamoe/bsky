#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './components/App.jsx';
import { SetupWizard } from './components/SetupWizard.jsx';
import type { SetupConfig } from './components/SetupWizard.jsx';
import dotenv from 'dotenv';
import path from 'path';
import { writeFileSync } from 'fs';
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

interface AppConfig {
  blueskyHandle: string;
  blueskyPassword: string;
  aiConfig: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  targetLang?: string;
}

function getConfigFromEnv(): AppConfig | null {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) return null;
  return {
    blueskyHandle: handle,
    blueskyPassword: password,
    aiConfig: {
      apiKey: process.env.LLM_API_KEY || '',
      baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
      model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    },
    targetLang: process.env.TRANSLATE_TARGET_LANG || 'zh',
  };
}

function writeEnvFile(config: SetupConfig): string {
  const envPath = path.resolve(process.cwd(), '.env');
  const lines = [
    `BLUESKY_HANDLE=${config.blueskyHandle}`,
    `BLUESKY_APP_PASSWORD=${config.blueskyPassword}`,
    `LLM_API_KEY=${config.llmApiKey}`,
    `LLM_BASE_URL=${config.llmBaseUrl || 'https://api.deepseek.com'}`,
    `LLM_MODEL=${config.llmModel || 'deepseek-v4-flash'}`,
    config.locale ? `TRANSLATE_TARGET_LANG=${config.locale}` : '',
  ].filter(Boolean);
  writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
  return envPath;
}

function Root({ isRawModeSupported }: { isRawModeSupported: boolean }) {
  const [appConfig, setAppConfig] = React.useState<AppConfig | null>(getConfigFromEnv);

  if (!appConfig) {
    return React.createElement(SetupWizard, {
      onComplete: (config: SetupConfig) => {
        const envPath = writeEnvFile(config);
        dotenv.config({ path: envPath, override: true });
        const newConfig = getConfigFromEnv();
        if (newConfig) {
          setAppConfig(newConfig);
        } else {
          console.error('Failed to load config after setup');
          process.exit(1);
        }
      },
    });
  }

  return React.createElement(App, { config: appConfig, isRawModeSupported });
}

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
  const rsObj = rs as unknown as Record<string, unknown>;
  rsObj.isTTY = true;
  rsObj.setRawMode = ((_mode: boolean) => rs);
  rsObj.ref = (() => rs);
  rsObj.unref = (() => rs);
  inputStream = rs as unknown as ReadStream;
  try { (process.stdin as ReadStream).resume(); } catch {}
  process.stdin.on('data', (c) => {
    try { rs.push(c); } catch {}
  });
}

const { waitUntilExit } = render(React.createElement(Root, { isRawModeSupported: isRawMode }), {
  stdin: inputStream,
  stdout: process.stdout,
  stderr: process.stderr,
  exitOnCtrlC: true,
});

waitUntilExit().catch(console.error);
