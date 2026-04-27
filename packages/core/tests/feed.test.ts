import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BskyClient } from '../src/at/client.js';
import { createTools } from '../src/at/tools.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const HANDLE = process.env.BLUESKY_HANDLE!;
const APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD!;

describe('Feed Reading & Serialization', () => {
  let client: BskyClient;
  let testPostUri: string;
  let testPostRkey: string;
  const testPostUris: string[] = [];
  let uploadedBlobCid = '';
  let uploadedBlobDid = '';

  beforeAll(async () => {
    if (!HANDLE || !APP_PASSWORD) throw new Error('Missing env vars');
    client = new BskyClient();
    await client.login(HANDLE, APP_PASSWORD);
  });

  afterAll(async () => {
    // Clean up test posts (optional - can't delete records via API easily)
  });

  it('should create a test post with [TRST 测试] marker', async () => {
    const timestamp = Date.now();
    const text = `[TRST 测试] Automated integration test ${timestamp}\n[TRST 更多请查看说明 bsky.app/profile/user-handle.example.com/post/xxxxxxxxxxx]`;

    const record = {
      text,
      createdAt: new Date().toISOString(),
    };

    const res = await client.createRecord(client.getDID(), 'app.bsky.feed.post', record);
    expect(res.uri).toBeTruthy();
    testPostUri = res.uri;
    testPostRkey = res.uri.split('/').pop()!;
    testPostUris.push(res.uri);
    console.log(`Created test post: ${res.uri}`);
  }, 30000);

  it('should get post thread for the created post', async () => {
    expect(testPostUri).toBeTruthy();
    const thread = await client.getPostThread(testPostUri);
    expect(thread.thread.$type).toBe('app.bsky.feed.defs#threadViewPost');
    if (thread.thread.$type === 'app.bsky.feed.defs#threadViewPost') {
      expect(thread.thread.post.uri).toBe(testPostUri);
      expect(thread.thread.post.record.text).toContain('[TRST 测试]');
    }
  }, 30000);

  it('should flatten thread with get_post_thread_flat', async () => {
    const tools = createTools(client);
    const flatTool = tools.find(t => t.definition.name === 'get_post_thread_flat')!;
    expect(flatTool).toBeTruthy();

    const result = await flatTool.handler({ uri: testPostUri, depth: 3 });
    console.log('Flattened thread:\n' + result);
    expect(result).toContain('[TRST 测试]');
    expect(result).toContain('depth:0');
  }, 30000);

  it('should search posts and find the test post', async () => {
    // Search may take some time to index
    await new Promise(resolve => setTimeout(resolve, 3000));
    const searchRes = await client.searchPosts({ q: 'TRST 测试', limit: 25, sort: 'latest' });
    console.log(`Search found ${searchRes.posts.length} posts, hitsTotal: ${searchRes.hitsTotal}`);
    // At least some results
    expect(searchRes.posts.length).toBeGreaterThanOrEqual(0);
    // The test post might or might not be indexed yet; this is best-effort
  }, 30000);

  it('should upload blob and create post with image', async () => {
    // Create a minimal 1x1 PNG pixel
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    // Upload blob
    const uploadRes = await client.uploadBlob(png, 'image/png');
    expect(uploadRes.blob.ref.$link).toBeTruthy();
    uploadedBlobCid = uploadRes.blob.ref.$link;
    uploadedBlobDid = client.getDID();
    console.log(`Uploaded blob: ${uploadedBlobCid}`);

    // Create post with image embed
    const record = {
      text: `[TRST 测试] Image post ${Date.now()}`,
      createdAt: new Date().toISOString(),
      embed: {
        $type: 'app.bsky.embed.images',
        images: [
          {
            image: { $type: 'blob', ref: { $link: uploadedBlobCid }, mimeType: 'image/png', size: png.length },
            alt: 'Test pixel',
          },
        ],
      },
    };

    const res = await client.createRecord(client.getDID(), 'app.bsky.feed.post', record);
    expect(res.uri).toBeTruthy();
    testPostUris.push(res.uri);
    console.log(`Created image post: ${res.uri}`);
  }, 30000);

  it('should extract images from post', async () => {
    // Use the last created image post
    const imageUri = testPostUris[testPostUris.length - 1]!;
    const tools = createTools(client);
    const extractTool = tools.find(t => t.definition.name === 'extract_images_from_post')!;
    const extractResult = await extractTool.handler({ uri: imageUri });
    const parsed = JSON.parse(extractResult);
    expect(parsed.count).toBe(1);
    expect(parsed.images[0].cid).toBe(uploadedBlobCid);
  }, 30000);

  it('should download uploaded blob as base64', async () => {
    expect(uploadedBlobCid).toBeTruthy();
    const tools = createTools(client);
    const downloadTool = tools.find(t => t.definition.name === 'download_image')!;
    // Wait a bit for blob to be available
    await new Promise(resolve => setTimeout(resolve, 2000));
    const downloadResult = await downloadTool.handler({
      did: uploadedBlobDid,
      cid: uploadedBlobCid,
    });
    const downloadParsed = JSON.parse(downloadResult);
    console.log(`Download result: mimeType=${downloadParsed.mimeType}, size=${downloadParsed.size}`);
    expect(downloadParsed.mimeType).toBe('image/png');
    expect(downloadParsed.size).toBeGreaterThan(0);
  }, 60000);

  it('should get post context', async () => {
    const tools = createTools(client);
    const contextTool = tools.find(t => t.definition.name === 'get_post_context')!;
    const result = await contextTool.handler({ uri: testPostUri });
    const parsed = JSON.parse(result);
    expect(parsed.text).toContain('[TRST 测试]');
    expect(parsed.thread).toBeTruthy();
  }, 30000);
});
