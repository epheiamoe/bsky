import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BskyClient } from '../src/at/client.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const HANDLE = process.env.BLUESKY_HANDLE!;
const APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD!;
const TEST_LIST_NAME = '[TEST] bsky-app list integration test';
const TEST_ALT_HANDLE = 'epheia.moe';

describe('List API Integration', () => {
  let client: BskyClient;
  let createdListUri: string | undefined;
  let createdListItemUri: string | undefined;

  beforeAll(() => {
    if (!HANDLE || !APP_PASSWORD) {
      throw new Error('Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD in .env');
    }
    client = new BskyClient();
  });

  it('should login', async () => {
    const session = await client.login(HANDLE, APP_PASSWORD);
    expect(session.accessJwt).toBeTruthy();
    expect(session.did).toMatch(/^did:plc:/);
  }, 15000);

  it('should create a test list', async () => {
    const result = await client.createList(TEST_LIST_NAME, 'app.bsky.graph.defs#curatelist', 'Test list created by automated test suite');
    expect(result.uri).toBeTruthy();
    expect(result.uri).toMatch(/^at:\/\/did:plc:.*\/app\.bsky\.graph\.list\//);
    expect(result.cid).toBeTruthy();
    createdListUri = result.uri;
  }, 15000);

  it('should get the created list by URI', async () => {
    expect(createdListUri).toBeDefined();
    const response = await client.getList(createdListUri!);
    expect(response.list.name).toBe(TEST_LIST_NAME);
    expect(response.list.purpose).toBe('app.bsky.graph.defs#curatelist');
    expect(response.list.creator.handle).toBe(HANDLE);
    expect(response.items).toEqual([]);
  }, 15000);

  it('should get own lists (includes test list)', async () => {
    const response = await client.getLists(HANDLE);
    const found = response.lists.find(l => l.uri === createdListUri);
    expect(found).toBeDefined();
    expect(found!.name).toBe(TEST_LIST_NAME);
  }, 15000);

  it('should get lists with purposes filter', async () => {
    const response = await client.getLists(HANDLE, 50, undefined, ['curatelist']);
    expect(response.lists.length).toBeGreaterThanOrEqual(1);
    for (const list of response.lists) {
      expect(list.purpose).toBe('app.bsky.graph.defs#curatelist');
    }
  }, 15000);

  it('should add a list item (member)', async () => {
    expect(createdListUri).toBeDefined();
    const altProfile = await client.getProfile(TEST_ALT_HANDLE);
    const result = await client.addListItem(createdListUri!, altProfile.did);
    expect(result.uri).toBeTruthy();
    expect(result.uri).toMatch(/app\.bsky\.graph\.listitem/);
    createdListItemUri = result.uri;
  }, 15000);

  it('should see the member in getList', async () => {
    expect(createdListUri).toBeDefined();
    const response = await client.getList(createdListUri!);
    expect(response.items.length).toBeGreaterThanOrEqual(1);
    const found = response.items.find(i => i.subject.handle === TEST_ALT_HANDLE);
    expect(found).toBeDefined();
  }, 15000);

  it('should get list feed (may be empty if no posts)', async () => {
    expect(createdListUri).toBeDefined();
    const response = await client.getListFeed(createdListUri!, 10);
    expect(Array.isArray(response.feed)).toBe(true);
  }, 15000);

  it('should get lists with membership for alt account', async () => {
    const altProfile = await client.getProfile(TEST_ALT_HANDLE);
    const response = await client.getListsWithMembership(altProfile.did);
    expect(Array.isArray(response.listsWithMembership)).toBe(true);
  }, 15000);

  it('should mute and unmute a list', async () => {
    expect(createdListUri).toBeDefined();
    await client.muteActorList(createdListUri!);
    const mutes = await client.getListMutes();
    const found = mutes.lists.find(l => l.uri === createdListUri);
    expect(found).toBeDefined();
    await client.unmuteActorList(createdListUri!);
    const mutesAfter = await client.getListMutes();
    const foundAfter = mutesAfter.lists.find(l => l.uri === createdListUri);
    expect(foundAfter).toBeUndefined();
  }, 30000);

  it('should update a list description', async () => {
    expect(createdListUri).toBeDefined();
    const result = await client.updateList(createdListUri!, { description: 'Updated test description' });
    expect(result.uri).toBe(createdListUri);
    const updated = await client.getList(createdListUri!);
    expect(updated.list.description).toBe('Updated test description');
  }, 15000);

  it('should remove the list item', async () => {
    expect(createdListItemUri).toBeDefined();
    await client.removeListItem(createdListItemUri!);
    const response = await client.getList(createdListUri!);
    expect(response.items.find(i => i.subject.handle === TEST_ALT_HANDLE)).toBeUndefined();
  }, 15000);

  // Cleanup — deleted last since tests above validate list existence
  afterAll(async () => {
    if (createdListUri) {
      try {
        await client.deleteList(createdListUri);
        // eslint-disable-next-line no-empty
      } catch {}
    }
  }, 15000);
});
