/**
 * Fetch a URL through jina.ai Reader proxy and return clean Markdown.
 * Shared utility used by both fetch_web_markdown and search_web_ddg tools.
 * Returns null on any failure (caller handles fallback).
 */
export async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const proxyUrl = `https://r.jina.ai/${url}`
    const res = await fetch(proxyUrl, {
      headers: { Accept: 'text/markdown' },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}
