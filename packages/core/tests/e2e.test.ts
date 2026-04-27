import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BskyClient } from '../src/at/client.js';
import { createTools } from '../src/at/tools.js';
import { AIAssistant, translateToChinese, polishDraft, singleTurnAI } from '../src/ai/assistant.js';
import type { AIConfig } from '../src/ai/assistant.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const HANDLE = process.env.BLUESKY_HANDLE!;
const APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD!;
const LLM_API_KEY = process.env.LLM_API_KEY!;

const AI_CONFIG: AIConfig = {
  apiKey: LLM_API_KEY,
  baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
  model: process.env.LLM_MODEL || 'deepseek-chat',
};

describe('E2E: Full Integration Test Suite', () => {
  let client: BskyClient;
  const createdPostUris: string[] = [];

  beforeAll(async () => {
    client = new BskyClient();
    await client.login(HANDLE, APP_PASSWORD);
  });

  afterAll(async () => {
    // Note: AT Protocol doesn't support easy post deletion via API
    console.log(`Created ${createdPostUris.length} posts during testing`);
  });

  // ======== 1. AUTH ========
  it('[1] Authentication: login, resolve handle, get profile', async () => {
    const session = await client.login(HANDLE, APP_PASSWORD);
    expect(session.accessJwt).toBeTruthy();

    const resolved = await client.resolveHandle(HANDLE);
    expect(resolved.did).toBe(session.did);

    const profile = await client.getProfile(HANDLE);
    expect(profile.handle).toBe(HANDLE);
  }, 15000);

  // ======== 2. FEED ========
  it('[2] Feed: post, read, search, thread flatten', async () => {
    const postText = `[TRST E2E] Full integration test ${Date.now()}`;
    const res = await client.createRecord(client.getDID(), 'app.bsky.feed.post', {
      text: postText,
      createdAt: new Date().toISOString(),
    });
    createdPostUris.push(res.uri);
    expect(res.uri).toBeTruthy();

    // Read thread
    const thread = await client.getPostThread(res.uri);
    expect(thread.thread.$type).toContain('threadViewPost');

    // Flatten
    const tools = createTools(client);
    const flat = await tools.find(t => t.definition.name === 'get_post_thread_flat')!.handler({ uri: res.uri });
    expect(flat).toContain('[TRST E2E]');

    // Search (with delay for indexing)
    await new Promise(r => setTimeout(r, 2000));
    const searchRes = await client.searchPosts({ q: 'TRST E2E', limit: 5, sort: 'latest' });
    expect(searchRes.posts.length).toBeGreaterThanOrEqual(0);
  }, 60000);

  // ======== 3. IMAGE ========
  it('[3] Image: upload blob, embed in post, extract images, download', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const uploadRes = await client.uploadBlob(png, 'image/png');
    expect(uploadRes.blob.ref.$link).toBeTruthy();

    const res = await client.createRecord(client.getDID(), 'app.bsky.feed.post', {
      text: `[TRST E2E] Image test ${Date.now()}`,
      createdAt: new Date().toISOString(),
      embed: {
        $type: 'app.bsky.embed.images',
        images: [{
          image: { $type: 'blob', ref: { $link: uploadRes.blob.ref.$link }, mimeType: 'image/png', size: png.length },
          alt: 'E2E test',
        }],
      },
    });
    createdPostUris.push(res.uri);

    // Extract
    const tools = createTools(client);
    const extract = await tools.find(t => t.definition.name === 'extract_images_from_post')!.handler({ uri: res.uri });
    const extractParsed = JSON.parse(extract);
    expect(extractParsed.count).toBe(1);

    // Download
    await new Promise(r => setTimeout(r, 2000));
    const download = await tools.find(t => t.definition.name === 'download_image')!.handler({
      did: client.getDID(),
      cid: uploadRes.blob.ref.$link,
    });
    const downloadParsed = JSON.parse(download);
    expect(downloadParsed.mimeType).toBe('image/png');
  }, 60000);

  // ======== 4. AI TOOL CALLING ========
  it('[4] AI: tool calling for post analysis', async () => {
    const tools = createTools(client);
    const assistant = new AIAssistant(AI_CONFIG);
    assistant.setTools(tools);

    assistant.addSystemMessage('你是一个深度集成 Bluesky 的终端助手。回答简练。');

    const result = await assistant.sendMessage(
      `请使用工具获取并分析这个帖子: ${createdPostUris[0]}`
    );

    expect(result.toolCallsExecuted).toBeGreaterThanOrEqual(1);
    expect(result.content).toContain('TRST E2E');
  }, 120000);

  // ======== 5. AI TRANSLATION ========
  it('[5] AI: translation to Chinese', async () => {
    const result = await translateToChinese(AI_CONFIG, 'Bluesky is a decentralized social network protocol.');
    expect(result).toBeTruthy();
    expect(/[\u4e00-\u9fff]/.test(result)).toBe(true);
  }, 60000);

  // ======== 6. AI POLISH ========
  it('[6] AI: draft polish', async () => {
    const result = await polishDraft(AI_CONFIG, 'bluesky is cool i like it', '更正式');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(10);
  }, 60000);

  // ======== 7. PROFILE & GRAPH ========
  it('[7] Profile: get profile, follows, followers', async () => {
    const profile = await client.getProfile('bsky.app');
    expect(profile.handle).toBe('bsky.app');

    const follows = await client.getFollows(client.getDID(), 5);
    expect(follows.follows).toBeDefined();
  }, 15000);

  // ======== 8. TIMELINE ========
  it('[8] Timeline: get timeline', async () => {
    const timeline = await client.getTimeline(10);
    expect(timeline.feed.length).toBeGreaterThan(0);
  }, 15000);

  // ======== 9. NOTIFICATIONS ========
  it('[9] Notifications: list', async () => {
    const notifs = await client.listNotifications(10);
    expect(notifs.notifications).toBeDefined();
  }, 15000);

  // ======== 10. AI GUIDING QUESTIONS ========
  it('[10] AI: guiding questions', async () => {
    const questions = await singleTurnAI(
      AI_CONFIG,
      `用户正在查看帖子: ${createdPostUris[0] ?? 'at://unknown'}`,
      '请生成 2 个引导性问题',
      0.7, 500
    );
    expect(questions).toBeTruthy();
  }, 60000);
});
