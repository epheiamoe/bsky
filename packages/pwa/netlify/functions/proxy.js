/**
 * CORS proxy for DuckDuckGo Instant Answer API (Netlify Functions version).
 *
 * Netlify auto-discovers netlify/functions/ directory.
 * Configure routing in netlify.toml to expose as /api/proxy.
 */

exports.handler = async function handler(event) {
  const params = event.queryStringParameters;
  const url = params?.url;

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (!url) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing url parameter' }) };
  }

  if (!url.startsWith('https://api.duckduckgo.com/')) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Domain not allowed' }) };
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'bsky-client/0.9.0' },
    });
    const body = await resp.text();
    const contentType = resp.headers.get('content-type') || 'application/json';
    return {
      statusCode: resp.status,
      headers: { ...headers, 'Content-Type': contentType },
      body,
    };
  } catch {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Proxy fetch failed' }) };
  }
};
