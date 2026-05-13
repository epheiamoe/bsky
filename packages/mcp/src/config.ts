export interface McpConfig {
  handle: string;
  appPassword: string;
  pdsUrl: string;
  enableWrite: boolean;
}

export function loadConfig(): McpConfig {
  const handle = process.env.BSKY_HANDLE;
  const appPassword = process.env.BSKY_APP_PASSWORD;

  if (!handle || !appPassword) {
    console.error(
      'BSKY_HANDLE and BSKY_APP_PASSWORD environment variables must be set.',
    );
    process.exit(1);
  }

  return {
    handle,
    appPassword,
    pdsUrl: process.env.BSKY_PDS ?? 'https://bsky.social',
    enableWrite: process.env.BSKY_ENABLE_WRITE === 'true',
  };
}
