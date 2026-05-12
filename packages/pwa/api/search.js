/**
 * DDG Lite search proxy — Vercel Serverless Function.
 * Only proxies lite.duckduckgo.com (hardcoded — cannot be abused to fetch arbitrary URLs).
 * Usage: /api/search?q=<search+query>
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const q = req.query.q;
  if (!q) {
    return res.status(400).send('missing q');
  }

  try {
    const resp = await fetch(`https://lite.duckduckgo.com/lite?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'bsky-client/1.0' },
    });
    const body = await resp.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(resp.status).send(body);
  } catch (err) {
    return res.status(502).send(`proxy error: ${err.message}`);
  }
}
