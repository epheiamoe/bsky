import { describe, it, expect, beforeAll } from 'vitest';
import { BskyClient } from '../src/at/client.js';
import { createTools } from '../src/at/tools.js';
import { AIAssistant, singleTurnAI, translateToChinese, polishDraft } from '../src/ai/assistant.js';
import type { AIConfig, ToolDescriptor } from '../src/ai/assistant.js';
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

describe('AI Assistant - Tool Calling Full Flow', () => {
  let client: BskyClient;
  let tools: ToolDescriptor[];
  let testPostUri: string;

  beforeAll(async () => {
    if (!HANDLE || !APP_PASSWORD) throw new Error('Missing Bluesky env vars');
    if (!LLM_API_KEY) throw new Error('Missing LLM_API_KEY in .env');

    client = new BskyClient();
    await client.login(HANDLE, APP_PASSWORD);
    tools = createTools(client);

    // Create a test post for AI to analyze
    const text = `[TRST 测试] AI Analysis Test ${Date.now()}\nThis post is for testing the AI tool-calling ability with Bluesky.`;
    const res = await client.createRecord(client.getDID(), 'app.bsky.feed.post', {
      text,
      createdAt: new Date().toISOString(),
    });
    testPostUri = res.uri;
    console.log(`AI test post: ${testPostUri}`);
  }, 30000);

  it('should load all tool definitions', () => {
    expect(tools.length).toBeGreaterThan(20);
    console.log(`Loaded ${tools.length} tools`);
    const names = tools.map(t => t.definition.name).sort();
    console.log('Tool names:', names.join(', '));
    expect(names).toContain('get_post_thread_flat');
    expect(names).toContain('search_posts');
    expect(names).toContain('get_profile');
  });

  it('should send message to AI and get tool calls', async () => {
    const assistant = new AIAssistant(AI_CONFIG);
    assistant.setTools(tools);

    assistant.addSystemMessage(
      '你是一个深度集成 Bluesky 的终端助手。你可以通过工具调用获取最新的网络动态、用户资料和帖子上下文。回答简练，适合终端显示。'
    );

    const result = await assistant.sendMessage(
      `请查看并分析帖子 ${testPostUri} 的内容，告诉我帖子里写了什么。`
    );

    console.log('AI Response:', result.content);
    console.log('Tool calls executed:', result.toolCallsExecuted);
    console.log('Intermediate steps:', result.intermediateSteps.map(s => `${s.type}: ${s.content.slice(0, 150)}`));

    // Should have made at least one tool call to get the post
    expect(result.toolCallsExecuted).toBeGreaterThanOrEqual(1);
    expect(result.content).toBeTruthy();
    // Should mention the test content
    expect(result.content.toLowerCase()).toContain('trst');
  }, 120000);

  it('should search posts via AI tool call', async () => {
    const assistant = new AIAssistant(AI_CONFIG);
    assistant.setTools(tools);

    assistant.addSystemMessage(
      '你是一个深度集成 Bluesky 的终端助手。使用工具获取信息。回答简练。'
    );

    const result = await assistant.sendMessage(
      '在 Bluesky 上搜索包含 "TRST 测试" 的帖子，告诉我找到了多少条。'
    );

    console.log('Search AI Response:', result.content);
    console.log('Tool calls:', result.toolCallsExecuted);

    expect(result.toolCallsExecuted).toBeGreaterThanOrEqual(1);
    expect(result.content).toBeTruthy();
  }, 120000);

  it('should get profile via AI tool call', async () => {
    const assistant = new AIAssistant(AI_CONFIG);
    assistant.setTools(tools);

    assistant.addSystemMessage(
      '你是一个深度集成 Bluesky 的终端助手。使用工具获取信息。回答简练。'
    );

    const result = await assistant.sendMessage(
      `请查看用户 ${HANDLE} 的 Bluesky 个人资料，告诉我这个用户的显示名称和帖子数量。`
    );

    console.log('Profile AI Response:', result.content);
    console.log('Tool calls:', result.toolCallsExecuted);

    expect(result.toolCallsExecuted).toBeGreaterThanOrEqual(1);
    expect(result.content).toBeTruthy();
  }, 120000);
});

describe('AI Translation & Polish (Single Turn)', () => {
  if (!LLM_API_KEY) {
    it.skip('No API key - skip', () => {});
    return;
  }

  it('should translate English to Chinese', async () => {
    const result = await translateToChinese(AI_CONFIG, 'Hello, this is a test post about Bluesky and the AT Protocol.');
    console.log('Translation result:', result);
    expect(result).toBeTruthy();
    // Should contain Chinese characters
    expect(/[\u4e00-\u9fff]/.test(result)).toBe(true);
  }, 60000);

  it('should polish a draft post', async () => {
    const draft = 'i think bluesky is cool and the at protocol is very nice and good';
    const requirement = '更正式';
    const result = await polishDraft(AI_CONFIG, draft, requirement);
    console.log('Polish result:', result);
    expect(result).toBeTruthy();
    // Should be different from the original (polished)
    expect(result.length).toBeGreaterThan(0);
  }, 60000);

  it('should polish a draft to be more humorous', async () => {
    const draft = 'Bluesky is a decentralized social network.';
    const requirement = '更幽默';
    const result = await polishDraft(AI_CONFIG, draft, requirement);
    console.log('Humor polish result:', result);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  }, 60000);
});

describe('AI Guiding Questions', () => {
  if (!LLM_API_KEY) {
    it.skip('No API key - skip', () => {});
    return;
  }

  it('should generate guiding questions for a post', async () => {
    const postUri = 'at://did:plc:xxxxxxxxxxxxxxxxxxxxxxxx/app.bsky.feed.post/xxxxxxxxxxx';
    const questions = await singleTurnAI(
      AI_CONFIG,
      `你是一个深度集成 Bluesky 的终端助手。用户正在查看这个帖子: ${postUri}。请生成 3 个引导性问题，帮助用户深入了解这个帖子。只输出问题列表，每个问题一行，不要编号。`,
      '请生成 3 个引导性问题',
      0.7,
      500,
    );
    console.log('Guiding questions:\n' + questions);
    expect(questions).toBeTruthy();
    expect(questions.split('\n').filter(l => l.trim()).length).toBeGreaterThanOrEqual(1);
  }, 60000);
});
