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

> **TUI**: Non-credential AI settings (baseUrl, model, provider, scenario models, per-provider API keys) are stored in `bsky-tui.config.json` (gitignored). See `bsky-tui.config.example.json` for template.
> **PWA**: All settings stored in `localStorage` via `useAppConfig.ts`.

## Translation

| Variable | Default | Values |
|----------|---------|--------|
| `TRANSLATE_TARGET_LANG` | `zh` | `zh`, `en`, `ja`, `ko`, `fr`, `de`, `es` |

## Template (`.env.example`)

```env
BLUESKY_HANDLE=your-handle.bsky.social
BLUESKY_APP_PASSWORD=your-app-password
LLM_API_KEY=sk-your-api-key
```
> Think/Vision mode, model selection, and per-scenario config are no longer in .env — see `bsky-tui.config.example.json`.

## TUI Structured Config

`bsky-tui.config.json` stores:
```json
{
  "targetLang": "zh",
  "translateMode": "simple",
  "aiConfig": { "baseUrl", "model", "provider", "reasoningStyle", "thinkingEnabled", "visionEnabled" },
  "apiKeys": { "deepseek": "...", "mistral": "..." },
  "scenarioModels": { "aiChat": "", "translate": "", "polish": "" }
}
```

## PWA Configuration

In PWA, credentials come from login form; settings from localStorage `bsky_app_config`:

```typescript
interface AppConfig {
  aiConfig: AIConfig;              // apiKey, baseUrl, model, provider, thinking/vision
  targetLang: string;              // default 'zh'
  translateMode: 'simple' | 'json';
  darkMode: boolean;
  apiKeys: Record<string, string>; // per-provider
  scenarioModels: { aiChat, translate, polish };
  enabledWidgets: string[];        // widget IDs shown in right panel
}
