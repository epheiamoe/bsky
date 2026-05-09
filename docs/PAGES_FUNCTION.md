# Pages Function Proxy — Architecture & Conventions

## What

Cloudflare Pages Functions are serverless functions that run on Cloudflare's edge network alongside the static PWA. They are auto-discovered from `packages/pwa/functions/` — no configuration needed.

The PWA uses a single Pages Function: **`/api/proxy`** — a CORS proxy for the DuckDuckGo Instant Answer API.

## Why

DuckDuckGo's Instant Answer API (`api.duckduckgo.com`) intentionally returns **empty fields** (HTTP 200 with all values null/empty) when it detects browser-specific `Sec-Fetch-*` headers. These headers are automatically added by the browser's `fetch()` API and `<script>` tags, and **cannot be removed or overridden** from JavaScript.

A Pages Function runs on Cloudflare's edge network — server-side `fetch()` does **not** carry `Sec-Fetch-*` headers — so DDG returns full data.

## Architecture

```
Browser fetch (PWA)
    ↓
/api/proxy?url=<encoded DDG API URL>
    ↓
Cloudflare Pages Function (server-side fetch)
    ↓
api.duckduckgo.com (no Sec-Fetch-* headers → full data)
    ↓
Response + CORS headers → Browser
```

## File

`packages/pwa/functions/api/proxy.js`

```javascript
export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(request.url).searchParams.get('url');
  if (!url) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    });
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'bsky-client/0.9.0' },
    });
    const body = await resp.text();
    const contentType = resp.headers.get('Content-Type') || 'application/json';

    return new Response(body, {
      status: resp.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: `Proxy fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    }), {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    });
  }
}
```

## Usage

From the PWA (browser context), the `instant_answer` tool handler calls:

```javascript
const proxyUrl = `/api/proxy?url=${encodeURIComponent(ddgApiUrl)}`;
const res = await fetch(proxyUrl);
```

The proxy is only used in **browser** environments. Node.js/TUI calls DDG directly.

## Adding New Pages Functions

If you add a new Pages Function:

1. Create file at `packages/pwa/functions/{route}.js` (e.g., `functions/api/translate.js` → serves at `/api/translate`)
2. Expose a default export `onRequest` (or `onRequestGet`, `onRequestPost` for specific methods)
3. Add CORS headers if the endpoint is called from the browser
4. **Update this document** (`docs/PAGES_FUNCTION.md`) with the new function
5. **Also update AGENTS.md** — add a note about the new function in the Pages Function section

## Multi-Platform Deployment

This project supports multiple deployment platforms. See [DEPLOY.md](../DEPLOY.md) for:

- Cloudflare Pages setup
- VPS + PHP (no Node.js needed)
- VPS + Node.js
- Vercel
- Netlify

Each platform provides its own proxy implementation. All behave identically: domain whitelist check → server-side fetch → return with CORS headers. `tools.ts` always calls `/api/proxy` — each platform ensures it's available at that path.

## Local Development

Pages Functions are **not** served by `vite dev`. For local development, run two terminals:

```bash
# Terminal 1: Vite dev server
cd packages/pwa && pnpm dev

# Terminal 2: Standalone DDG proxy (Node.js)
cd packages/pwa && node scripts/proxy-server.mjs
```

Vite proxies `/api/*` requests to `http://localhost:8788` (the proxy server). The proxy server handles the domain whitelist check and server-side fetch.

Alternatively, you can also test with:
```bash
cd packages/pwa && npx wrangler pages dev dist
```
