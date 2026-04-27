import { describe, it, expect, beforeAll } from 'vitest';
import { BskyClient } from '../src/at/client.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const HANDLE = process.env.BLUESKY_HANDLE!;
const APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD!;

describe('Authentication & Basic Endpoints', () => {
  let client: BskyClient;

  beforeAll(() => {
    if (!HANDLE || !APP_PASSWORD) {
      throw new Error('Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD in .env');
    }
    client = new BskyClient();
  });

  it('should create a session and return accessJwt', async () => {
    const session = await client.login(HANDLE, APP_PASSWORD);
    expect(session.accessJwt).toBeTruthy();
    expect(session.handle).toBe(HANDLE);
    expect(session.did).toMatch(/^did:plc:/);
  }, 15000);

  it('should resolve own handle to same DID', async () => {
    await client.login(HANDLE, APP_PASSWORD);
    const resolved = await client.resolveHandle(HANDLE);
    expect(resolved.did).toBe(client.getDID());
  }, 15000);

  it('should get own profile', async () => {
    await client.login(HANDLE, APP_PASSWORD);
    const profile = await client.getProfile(HANDLE);
    expect(profile.handle).toBe(HANDLE);
    expect(profile.did).toBe(client.getDID());
  }, 15000);
});
