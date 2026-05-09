// Test script: instant_answer tool end-to-end through real LLM
// Usage: npx tsx test-instant-answer.ts

import { createTools, AIAssistant, P_ASSISTANT_BASE, PF_CURRENT_TIME, P_CONCISE } from './packages/core/dist/index.js';

// ── Mock BskyClient (needed by createTools, instant_answer handler doesn't use it) ──
const mockClient = {
  resolveHandle: async () => ({}),
  getRecord: async () => ({}),
  downloadBlob: async () => new Uint8Array(),
  isAuthenticated: () => true,
  getSession: () => ({}),
  getDID: () => 'did:plc:mock' as string,
  getHandle: () => 'mock.bsky.social' as string,
} as any;

// ── Config ──
const config = {
  apiKey: process.env.LLM_API_KEY || 'sk-bc72a1b49c7d469eadc99c5d46f165ae',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  thinkingEnabled: false,
  visionEnabled: false,
  provider: 'deepseek' as const,
  reasoningStyle: 'reasoning_content' as const,
};

async function main() {
  // ═══ Step 0: Direct API test (no LLM) ═══
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 0: Direct DDG API test');
  console.log('══════════════════════════════════════════\n');

  const queries = ['BlueSky AT Protocol', 'Bluesky social network', 'Python programming language', 'Tokyo'];

  for (const rawQuery of queries) {
    const q = encodeURIComponent(rawQuery);
    const url = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'bsky-client/0.9.0' } });
      const data = await res.json() as any;
      
      const parts: string[] = [];
      if (data.Heading) parts.push(`Heading: ${data.Heading}`);
      if (data.Abstract) parts.push(`Abstract: ${(data.Abstract as string).slice(0, 80)}...`);
      if (data.Answer) parts.push(`Answer: ${data.Answer}`);
      if (data.Definition && data.Definition !== data.Heading) parts.push(`Definition: ${data.Definition}`);
      if (data.Infobox?.content?.length > 0) {
        const rows = (data.Infobox.content as any[]).filter((i: any) => i.label && i.value && typeof i.value === 'string');
        if (rows.length > 0) parts.push(`Infobox: ${rows.length} rows (e.g. ${rows[0].label}: ${String(rows[0].value).slice(0, 30)})`);
      }
      if (data.Results?.length > 0) parts.push(`Results: ${data.Results.length} items`);
      if (data.RelatedTopics?.length > 0) {
        const flatTopics = (data.RelatedTopics as any[]).slice(0, 8).flatMap((t: any) => t.Topics || [t]);
        if (flatTopics.length > 0) parts.push(`RelatedTopics: ${flatTopics.length} items`);
      }
      
      console.log(`Query: "${rawQuery}"`);
      console.log(`  OK: ${res.ok}, Type: ${data.Type || '(empty)'}`);
      console.log(`  Parts found: ${parts.length}`);
      if (parts.length === 0) {
        console.log(`  ⚠ EMPTY — would show "No instant answer found"`);
        console.log(`  Raw response keys: ${Object.keys(data).join(', ')}`);
        console.log(`  Type field: "${data.Type}"`);
      } else {
        console.log(`  ${parts.join('\n  ')}`);
      }
      console.log();
    } catch (err) {
      console.log(`Query: "${rawQuery}"`);
      console.log(`  ❌ FETCH ERROR: ${(err as Error).message}`);
      console.log();
    }
  }

  // ═══ Step 1: Build tools and register with AIAssistant ═══
  console.log('══════════════════════════════════════════');
  console.log('STEP 1: AIAssistant with instant_answer tool');
  console.log('══════════════════════════════════════════\n');

  const allTools = createTools(mockClient);
  const iaTool = allTools.find(t => t.definition.name === 'instant_answer');
  if (!iaTool) {
    console.error('❌ instant_answer tool not found in createTools output!');
    process.exit(1);
  }
  console.log('✅ instant_answer tool found');
  console.log(`   Description: ${iaTool.definition.description}`);
  console.log(`   RequiresWrite: ${iaTool.requiresWrite}`);

  const assistant = new AIAssistant(config);
  assistant.setTools(allTools);
  assistant.addSystemMessage([
    P_ASSISTANT_BASE,
    PF_CURRENT_TIME(),
    P_CONCISE,
    '你是一个测试助手。请使用工具回答用户的问题。',
  ].join('\n'));

  // ═══ Step 2: Test through real LLM ═══
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 2: Real LLM call — ask about Bluesky');
  console.log('══════════════════════════════════════════\n');

  try {
    const result = await assistant.sendMessage('What is Bluesky? Use instant_answer to look it up.');
    
    console.log('AI Response:');
    console.log(result.content || '(empty)');
    console.log(`\nTool calls made: ${result.toolCallsExecuted}`);
    console.log('\nIntermediate steps:');
    for (const step of result.intermediateSteps) {
      const prefix = step.type === 'tool_call' ? '  🛠' : step.type === 'tool_result' ? '  📋' : '  💬';
      console.log(`${prefix} ${step.content.slice(0, 500)}`);
    }
  } catch (err) {
    console.error(`\n❌ AIAssistant error: ${(err as Error).message}`);
    console.error(err);
  }

  // ═══ Step 3: Test multiple queries ═══
  console.log('\n══════════════════════════════════════════');
  console.log('STEP 3: Test multiple queries in one conversation');
  console.log('══════════════════════════════════════════\n');

  const testQueries = ['Tokyo', 'Python programming language'];

  for (const q of testQueries) {
    try {
      console.log(`\n--- Asking about "${q}" ---\n`);
      const result = await assistant.sendMessage(`Look up "${q}" using instant_answer.`);
      console.log(`AI: ${(result.content || '(empty)').slice(0, 500)}`);
      console.log(`\nTool calls: ${result.toolCallsExecuted}`);
      for (const step of result.intermediateSteps) {
        const prefix = step.type === 'tool_call' ? '  🛠' : step.type === 'tool_result' ? '  📋' : '  💬';
        console.log(`${prefix} ${step.content.slice(0, 500)}`);
      }
    } catch (err) {
      console.error(`❌ Error: ${(err as Error).message}`);
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log('TEST COMPLETE');
  console.log('══════════════════════════════════════════\n');
}

main();
