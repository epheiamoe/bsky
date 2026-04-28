# Testing

## Test Framework

- **Runner**: Vitest 3.x
- **Config**: `packages/core/vitest.config.ts` (globals, 60s timeout)
- **All tests are integration tests**: Real Bluesky API + real DeepSeek API calls. No mocks.

## Running Tests

```bash
# All tests
pnpm test

# Specific file
pnpm --filter @bsky/core test tests/ai_integration.test.ts

# E2E suite
pnpm --filter @bsky/core test:e2e

# Watch mode
pnpm --filter @bsky/core test:watch
```

## Test Files

| File | Tests | What it covers |
|------|-------|----------------|
| `tests/auth.test.ts` | 3 | Login, resolveHandle, getProfile |
| `tests/feed.test.ts` | 8 | Create post, getPostThread, flatten, search, image upload/download |
| `tests/ai_integration.test.ts` | 8 | Tool calling, search via AI, profile via AI, translation, polish, guiding questions |
| `tests/e2e.test.ts` | 10 | Full flow: auth → post → thread → image → AI tool call → translation → polish → profile → timeline → notifications → guiding questions |

## Test Patterns

### API Tests
```typescript
const client = new BskyClient();
await client.login(HANDLE, APP_PASSWORD);
const posts = await client.getTimeline(20);
expect(posts.feed.length).toBeGreaterThan(0);
```

### AI Tool Tests
```typescript
const tools = createTools(client);
const assistant = new AIAssistant(AI_CONFIG);
assistant.setTools(tools);
assistant.addSystemMessage('...');
const result = await assistant.sendMessage('analyze post at://...');
expect(result.toolCallsExecuted).toBeGreaterThanOrEqual(1);
```

### E2E Flow
1. Login → session valid
2. Create test post with `[TRST 测试]` marker
3. Read thread + flatten
4. Search for test post
5. Upload image blob → create image post → extract images → download
6. AI tool call → analyze test post
7. AI translate English → Chinese
8. AI polish draft text
9. Get profile + follows + followers
10. Get timeline + notifications

## Environment

Tests load `.env` from project root:
```typescript
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
```

Required: `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`, `LLM_API_KEY`

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Test timeout (30s default) | Config set to 60s; individual tests use 3rd arg `it('...', fn, 60000)` |
| Blob download timeout | Added 2s delay before download; uses authenticated endpoint with 30s timeout |
| Search returns empty | Added 3s wait for indexing delay |
| AI response truncated | Non-streaming mode; 4096 max_tokens; text wraps in Box width |
| Multiple test posts in account | Tests add `[TRST 测试]` marker for identification; posts visible in timeline |

## Adding New Tests

1. Create file in `packages/core/tests/` with `.test.ts` extension
2. Import `BskyClient`, `createTools`, `AIAssistant` from `../src/`
3. Load `.env` from root
4. Use real credentials — mock-free
5. Clean up: Test posts remain on Bluesky (AT Protocol doesn't support easy deletion)
