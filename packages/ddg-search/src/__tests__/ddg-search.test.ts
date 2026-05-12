import { describe, it, expect } from 'vitest'
import { parseDDGLite, extractRealUrl, formatResultsAsMarkdown } from '../index.js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('extractRealUrl', () => {
  it('extracts URL from DDG redirect (https)', () => {
    const result = extractRealUrl(
      'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fbsky.app%2F&rut=abc123'
    )
    expect(result).toBe('https://bsky.app/')
  })

  it('extracts URL from protocol-relative DDG redirect', () => {
    const result = extractRealUrl(
      '//duckduckgo.com/l/?uddg=https%3A%2F%2Fbsky.app%2F&amp;rut=abc'
    )
    expect(result).toBe('https://bsky.app/')
  })

  it('passes through non-DDG URLs', () => {
    expect(extractRealUrl('https://example.com')).toBe('https://example.com')
  })

  it('handles URLs without uddg param', () => {
    const result = extractRealUrl('https://duckduckgo.com/l/?rut=abc')
    expect(result).toBe('https://duckduckgo.com/l/?rut=abc')
  })
})

describe('parseDDGLite', () => {
  it('returns empty array for empty HTML', () => {
    expect(parseDDGLite('')).toEqual([])
  })

  it('returns empty array for HTML without enough tables', () => {
    expect(parseDDGLite('<html><table></table></html>')).toEqual([])
  })

  it('parses real DDG Lite HTML fixture', () => {
    const html = readFileSync(
      resolve(__dirname, 'fixtures', 'ddg-lite-bluesky.html'),
      'utf-8'
    )
    const results = parseDDGLite(html)
    expect(results.length).toBeGreaterThan(3)
    expect(results[0]).toHaveProperty('title')
    expect(results[0]).toHaveProperty('url')
    expect(results[0]).toHaveProperty('description')

    // Titles should not be empty
    results.forEach((r) => {
      expect(r.title.trim().length).toBeGreaterThan(0)
    })
    // URLs should be real (not DDG internal redirects)
    results.forEach((r) => {
      expect(r.url).not.toContain('duckduckgo.com/l/')
    })
  })
})

describe('formatResultsAsMarkdown', () => {
  it('returns empty result message for no results', () => {
    const out = JSON.parse(formatResultsAsMarkdown('xyz', []))
    expect(out.heading).toBe('')
    expect(out.content).toContain('No search results')
  })

  it('formats results as Markdown', () => {
    const results = [
      { title: 'Test', url: 'https://example.com', description: 'A test result' },
    ]
    const out = JSON.parse(formatResultsAsMarkdown('test', results))
    expect(out.heading).toContain('test')
    expect(out.content).toContain('[Test]')
    expect(out.content).toContain('example.com')
    expect(out.content).toContain('A test result')
  })
})
