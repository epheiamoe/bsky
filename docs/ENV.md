# Environment Variables

## Required

| Variable | Description |
|----------|-------------|
| `BLUESKY_HANDLE` | Bluesky handle (e.g., `user.bsky.social`) |
| `BLUESKY_APP_PASSWORD` | Bluesky App Password (Settings → App Passwords) |

## AI/LLM

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_KEY` | (required) | API key for OpenAI-compatible API |
| `LLM_BASE_URL` | `https://api.deepseek.com` | API base URL |
| `LLM_MODEL` | `deepseek-chat` | Model name |

## Translation

| Variable | Default | Values |
|----------|---------|--------|
| `TRANSLATE_TARGET_LANG` | `zh` | `zh`, `en`, `ja`, `ko`, `fr`, `de`, `es` |

## Template (`.env.example`)

```env
BLUESKY_HANDLE=your-handle.bsky.social
BLUESKY_APP_PASSWORD=your-app-password
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
TRANSLATE_TARGET_LANG=zh
```

## PWA Configuration

In PWA, these values come from user input (login form) or localStorage:

```typescript
const config = {
  blueskyHandle: userInput.handle,
  blueskyPassword: userInput.password,
  aiConfig: {
    apiKey: localStorage.getItem('ai_api_key') ?? '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  targetLang: localStorage.getItem('target_lang') ?? 'zh',
};
```
