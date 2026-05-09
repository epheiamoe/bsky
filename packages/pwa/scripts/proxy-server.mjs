/**
 * Standalone HTTP proxy server for DuckDuckGo Instant Answer API.
 *
 * Use this for:
 *   - Local development (run alongside `pnpm dev`)
 *   - VPS deployment with Node.js (PM2/forever)
 *
 * Usage:
 *   node scripts/proxy-server.mjs
 *   # Listens on http://localhost:8788/api/proxy?url=...
 *
 * With pnpm dev:
 *   Vite proxies /api/* to this server (configured in vite.config.ts).
 *   Run in separate terminal: node scripts/proxy-server.mjs
 */

import http from 'http';

const PORT = process.env.PORT || 8788;
const ALLOWED_PREFIX = 'https://api.duckduckgo.com/';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('url');

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!url) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing url parameter' }));
    return;
  }

  if (!url.startsWith(ALLOWED_PREFIX)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Domain not allowed' }));
    return;
  }

  try {
    const apiResp = await fetch(url, {
      headers: { 'User-Agent': 'bsky-client/0.9.0' },
    });
    const body = await apiResp.text();
    const contentType = apiResp.headers.get('content-type') || 'application/json';
    res.writeHead(apiResp.status, { 'Content-Type': contentType });
    res.end(body);
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy fetch failed' }));
  }
});

server.listen(PORT, () => {
  console.log(`DDG proxy server listening on http://localhost:${PORT}/api/proxy?url=...`);
});
