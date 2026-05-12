/**
 * DDG Lite search proxy — Netlify Function.
 * Only proxies lite.duckduckgo.com (hardcoded — cannot be abused to fetch arbitrary URLs).
 * Usage: /.netlify/functions/search?q=<search+query>
 */
exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const q = event.queryStringParameters?.q;
  if (!q) {
    return { statusCode: 400, headers, body: 'missing q' };
  }

  try {
    const resp = await fetch(`https://lite.duckduckgo.com/lite?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'bsky-client/1.0' },
    });
    const body = await resp.text();
    return {
      statusCode: resp.status,
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
      body,
    };
  } catch (err) {
    return { statusCode: 502, headers, body: `proxy error: ${err.message}` };
  }
};
