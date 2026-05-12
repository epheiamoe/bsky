/**
 * DDG Lite search proxy — standalone Node.js server for local development.
 * Only proxies lite.duckduckgo.com (hardcoded — cannot be abused to fetch arbitrary URLs).
 * Start: node scripts/search-server.mjs
 * Port: 8788 (configurable via PORT env)
 * Usage: http://localhost:8788/api/search?q=<query>
 */
import { createServer } from 'http';

const PORT = process.env.PORT || 8788;

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/api/search') {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  const q = url.searchParams.get('q');
  if (!q) {
    res.writeHead(400);
    res.end('missing q');
    return;
  }

  try {
    const resp = await fetch(`https://lite.duckduckgo.com/lite?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'bsky-client/1.0' },
    });
    res.writeHead(resp.status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(await resp.text());
  } catch (err) {
    res.writeHead(502);
    res.end(`proxy error: ${err.message}`);
  }
}).listen(PORT, () => {
  console.log(`DDG Lite search proxy running on http://localhost:${PORT}`);
});
