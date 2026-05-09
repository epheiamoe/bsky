/**
 * CORS proxy for DuckDuckGo Instant Answer API (Vercel version).
 *
 * Vercel auto-discovers the `api/` directory at project root.
 * This file must be at the PROJECT root (not packages/pwa/api/).
 *
 * Usage: deploy the built PWA to Vercel, this function lives at /api/proxy
 *
 * If deploying from this monorepo, set the Vercel project root to packages/pwa
 * and ensure this file is copied/available at the output root.
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const url = req.query.url;
  if (!url) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  if (!url.startsWith('https://api.duckduckgo.com/')) {
    res.status(403).json({ error: 'Domain not allowed' });
    return;
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'bsky-client/0.9.0' },
    });
    const body = await resp.text();
    const contentType = resp.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);
    res.status(resp.status).send(body);
  } catch {
    res.status(502).json({ error: 'Proxy fetch failed' });
  }
}
