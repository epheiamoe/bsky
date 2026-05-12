export interface SearchResult {
  title: string
  url: string
  description: string
}

export function extractRealUrl(raw: string): string {
  // Normalize protocol-relative URL (//duckduckgo.com → https://duckduckgo.com)
  let normalized = raw.replace(/^\/\//, 'https://')
  normalized = normalized.replace(/&amp;/g, '&')
  if (!normalized.startsWith('https://duckduckgo.com/l/')) return normalized
  try {
    const u = new URL(normalized)
    const uddg = u.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
  } catch {}
  return normalized
}

function cleanSnippetText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function extractLinksFromTable(tableHtml: string): Array<{ url: string; title: string; description: string }> {
  const results: Array<{ url: string; title: string; description: string }> = []
  const rows = tableHtml.split(/<\/tr>\s*<tr/i)

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]!
    const linkMatch = raw.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!linkMatch) continue

    const href = linkMatch[1]!
    if (isInternalLink(href)) continue

    const title = linkMatch[2]!.replace(/<[^>]+>/g, '').trim()
    if (!title) continue

    let description = ''
    const nextRow = rows[i + 1]
    if (nextRow) {
      const td = nextRow.match(/<td[^>]*>([\s\S]*?)<\/td>/i)
      if (td) {
        description = cleanSnippetText(td[1]!)
      }
    }

    results.push({ url: extractRealUrl(href), title, description })
  }

  return results
}

function isInternalLink(href: string): boolean {
  if (href.startsWith('/') && !href.startsWith('//')) return true
  const normalized = href.replace(/^\/\//, 'https://')
  const internal = [
    'duckduckgo.com/about',
    'duckduckgo.com/feedback',
    'duckduckgo.com/duckduckgo-help',
    'duckduckgo.com/t/',
    'duckduckgo.com/params',
    'duckduckgo.com/privacy',
  ]
  return internal.some((path) => normalized.includes(path))
}

export function parseDDGLite(html: string): SearchResult[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi)
  if (!tables || tables.length < 3) return []

  // DDG Lite page structure:
  //   Table 0: header (logo + search form)
  //   Table 1: zero-click info (Wikipedia summary if applicable)
  //   Table 2: search results
  const resultTable = tables[tables.length - 1]!

  const links = extractLinksFromTable(resultTable)

  return links
}

export function formatResultsAsMarkdown(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return JSON.stringify({ heading: '', content: `No search results found for "${query}".` })
  }

  const heading = `DuckDuckGo Search: ${query}`
  const lines: string[] = [`# ${heading}`, '']
  for (const r of results) {
    lines.push(`## [${r.title}](${r.url})`)
    if (r.description) lines.push(r.description)
    lines.push('')
  }

  return JSON.stringify({ heading, content: lines.join('\n') })
}
