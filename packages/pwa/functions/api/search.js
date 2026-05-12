/**
 * DDG Lite search proxy — server-side fetch to bypass CORS restriction.
 * DuckDuckGo Lite returns 403 on cross-origin requests (Origin header).
 * This function strips the Origin header and adds CORS response headers.
 *
 * PWA calls this as: /api/search?q=<query>
 * If this function is not deployed, the PWA silently degrades (no search fallback).
 */
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

  const q = new URL(request.url).searchParams.get('q');
  if (!q) {
    return new Response('missing q', { status: 400 });
  }

  try {
    const resp = await fetch(`https://lite.duckduckgo.com/lite?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'bsky-client/1.0' },
    });
    const body = await resp.text();

    return new Response(body, {
      status: resp.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (err) {
    return new Response(`proxy error: ${err.message}`, {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}
