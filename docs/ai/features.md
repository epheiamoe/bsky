# AI Features

**File**: `packages/core/src/ai/assistant.ts`

## Translation

### Dual-Mode Architecture

`translateText` operates in two modes, selected automatically:

| Mode | Condition | Behaviour |
|------|-----------|-----------|
| **Simple** | Target language is CJK or the text is short (<200 chars) | Standard `system` + `user` prompt, no JSON wrapping |
| **JSON** | All other cases (European languages, long text) | `response_format: { type: 'json_object' }` with `source_lang` field |

```typescript
translateText(config: AIConfig, text: string, targetLang: string): Promise<{
  translation: string;
  source_lang?: string;  // only in JSON mode
  mode: 'simple' | 'json';
}>
```

### JSON Mode Prompt

```
Translate the following text to {targetLang}.
Return ONLY a JSON object with fields:
  - "translation": the translated text
  - "source_lang": ISO 639-1 code of the source language (e.g. "en", "fr", "de")

Do NOT include any other text or explanation.
```

Request body includes `response_format: { type: 'json_object' }` to enforce structured output.

### Retry Logic

DeepSeek's JSON mode occasionally returns empty content. Retry with exponential backoff:

| Attempt | Delay before send |
|---------|-------------------|
| 1 (initial) | — |
| 2 | 800 ms |
| 3 | 1,600 ms |
| 4 (final) | 2,400 ms |

Max retries: **3** (4 total attempts). Each retry re-sends the identical prompt. If all attempts fail, the function throws with `translateText failed after 4 attempts`.

One special retry trigger: **empty `choices[0].message.content`** — treated as a failure even if HTTP 200, because DeepSeek JSON mode can return `200 OK` with a blank body.

```typescript
const MAX_RETRIES = 3;
const BACKOFF_MS = 800;
for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  if (attempt > 0) await sleep(BACKOFF_MS * attempt);
  const resp = await ky.post(...);
  const content = resp.choices[0]?.message?.content;
  if (content) return parseContent(content);  // success
  // else blank content → retry
}
throw new Error('translateText failed after 4 attempts');
```

## Polish Draft

The `polishDraft()` function is accessible via:
- **PWA**: Polish Widget in right component panel (compose view `lg+`) or via 润色 button in the compose bottom toolbar (to the right of the media button).
  Targets the currently focused post (not hardcoded post[0]).
  The widget calls `polishDraft(config, draft, requirement)` and provides copy/results, replace buttons.
- **TUI**: Press `f` in compose text mode → polish requirement input → AI polish call → show result with [R] Replace / [C] Copy / [Esc] dismiss.
  Uses `resolveScenarioConfig(config.scenarioModels.polish)` for per-scenario model config.
  Targets the currently active post (via Tab cycling) in multi-post threads.

## Single-Turn Functions

```typescript
// Polish draft
polishDraft(config: AIConfig, draft: string, requirement: string): Promise<string>

// Generic single-turn
singleTurnAI(config: AIConfig, systemPrompt: string, userPrompt: string,
             temperature?: number, maxTokens?: number): Promise<string>
```
