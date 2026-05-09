/**
 * Cloudflare Pages Function — CORS proxy for DuckDuckGo Instant Answer API.
 *
 * Browser fetch to DDG API carries Sec-Fetch-* headers that trigger
 * DDG's anti-scrape detection (returns empty fields). This function
 * runs on Cloudflare's edge network (server-side fetch, no browser
 * fingerprint headers), so DDG returns full data.
 *
 * Usage: GET /api/proxy?url=<encoded DDG API URL>
 * Response: DDG API JSON with CORS headers
 */
export async function onRequest(context) {
  const { request } = context;

  // Handle CORS preflight
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
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
