#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './components/App.jsx';
import { SetupWizard } from './components/SetupWizard.jsx';
import type { SetupConfig } from './components/SetupWizard.jsx';
import { getTuiConfig } from './config/configStore.js';
import type { TuiConfig } from './config/configStore.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import type { ReadStream } from 'tty';
import { getProviderById, setGlobalPythonSandbox } from '@bsky/core';
import { NodePythonSandbox } from '@bsky/app/services/node-python-sandbox';
import { setDraftStorageFactory, FileDraftStorage, initChatService, FileChatStorage } from '@bsky/app';

setDraftStorageFactory(() => new FileDraftStorage());
initChatService(new FileChatStorage());

// Initialize Python sandbox for execute_python tool
const sandbox = new NodePythonSandbox();
setGlobalPythonSandbox(sandbox);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPaths = [
  path.resolve(__dirname, '..', '..', '..', '.env'),
  path.resolve(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

export interface AppConfig {
  blueskyHandle: string;
  blueskyPassword: string;
  blueskyPds?: string;
  aiConfig: {
    apiKey: string;
    baseUrl: string;
    model: string;
    thinkingEnabled?: boolean;
    visionEnabled?: boolean;
    provider?: string;
    reasoningStyle?: 'reasoning_content' | 'structured_content' | 'none';
    apiType?: 'chat' | 'responses';
    reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  };
  targetLang?: string;
  translateMode?: 'simple' | 'json';
  /** Per-provider API keys */
  apiKeys: Record<string, string>;
  /** Per-scenario model overrides. "provider/model" format */
  scenarioModels: {
    aiChat: string;
    translate: string;
    polish: string;
    imageDescription: string;
  };
  userPronouns?: string;
}

function resolveAiApiKey(tuiConfig: TuiConfig, providerId: string | undefined): string {
  // Env LLM_API_KEY takes precedence (for single-provider setups)
  const envKey = process.env.LLM_API_KEY;
  if (envKey) return envKey;
  // Otherwise, look up from config's per-provider keys
  if (providerId && tuiConfig.apiKeys[providerId]) return tuiConfig.apiKeys[providerId]!;
  return '';
}

function getConfigFromEnv(): AppConfig | null {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) return null;

  const pdsUrl = process.env.BLUESKY_PDS || undefined;

  const tuiConfig = getTuiConfig();
  const providerId = tuiConfig.aiConfig.provider;
  const apiKey = resolveAiApiKey(tuiConfig, providerId);

  return {
    blueskyHandle: handle,
    blueskyPassword: password,
    blueskyPds: pdsUrl,
    aiConfig: {
      apiKey,
      baseUrl: tuiConfig.aiConfig.baseUrl,
      model: tuiConfig.aiConfig.model,
      thinkingEnabled: tuiConfig.aiConfig.thinkingEnabled ?? true,
      visionEnabled: tuiConfig.aiConfig.visionEnabled ?? false,
      provider: providerId,
      reasoningStyle: tuiConfig.aiConfig.reasoningStyle,
    },
    targetLang: tuiConfig.targetLang,
    translateMode: tuiConfig.translateMode,
    apiKeys: tuiConfig.apiKeys,
    scenarioModels: tuiConfig.scenarioModels,
    userPronouns: tuiConfig.userPronouns ?? '',
  };
}

function Root({ isRawModeSupported }: { isRawModeSupported: boolean }) {
  const [appConfig, setAppConfig] = React.useState<AppConfig | null>(getConfigFromEnv);

  if (!appConfig) {
    // Build partial existing config from env + tuiConfig for smart wizard
    const tuiPartial = getTuiConfig();
    const partial: Partial<SetupConfig> = {};
    if (process.env.BLUESKY_HANDLE) partial.blueskyHandle = process.env.BLUESKY_HANDLE;
    if (process.env.BLUESKY_APP_PASSWORD) partial.blueskyPassword = process.env.BLUESKY_APP_PASSWORD;
    if (process.env.BLUESKY_PDS) partial.blueskyPds = process.env.BLUESKY_PDS;
    if (tuiPartial.aiConfig.provider) partial.providerId = tuiPartial.aiConfig.provider;
    if (tuiPartial.aiConfig.model) partial.llmModel = tuiPartial.aiConfig.model;
    const apiKey = resolveAiApiKey(tuiPartial, tuiPartial.aiConfig.provider);
    if (apiKey) partial.llmApiKey = apiKey;
    if (tuiPartial.targetLang) partial.locale = tuiPartial.targetLang;
    if (tuiPartial.userPronouns) partial.userPronouns = tuiPartial.userPronouns;

    return React.createElement(SetupWizard, {
      existing: Object.keys(partial).length > 0 ? partial : undefined,
      onComplete: (_config: SetupConfig) => {
        // reload env (SetupWizard writes .env + configStore)
        const cwdEnv = path.resolve(process.cwd(), '.env');
        dotenv.config({ path: cwdEnv, override: true });
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
