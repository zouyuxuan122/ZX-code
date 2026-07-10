import { net } from 'electron'
import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'

/** 默认最大结果数 */
const DEFAULT_MAX_RESULTS = 8
/** 允许的最大结果数上限 */
const MAX_RESULTS_CAP = 20
/** 单个端点请求超时时间（毫秒） */
const SEARCH_TIMEOUT_MS = 25_000
/** DuckDuckGo HTML 搜索端点（后备） */
const DDG_HTML_ENDPOINT = 'https://html.duckduckgo.com/html/'
/** DuckDuckGo Lite 搜索端点（后备） */
const DDG_LITE_ENDPOINT = 'https://lite.duckduckgo.com/lite/'
/** Bing 搜索端点（第三后备） */
const BING_ENDPOINT = 'https://www.bing.com/search'
/** Parallel Web Search MCP 端点（主搜索，免费无需 API key） */
const PARALLEL_MCP_URL = 'https://search.parallel.ai/mcp'
/** 使用的 User-Agent */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
/** 缓存 TTL（5 分钟） */
const CACHE_TTL_MS = 5 * 60 * 1000
/** 缓存最大条目数 */
const CACHE_MAX_SIZE = 50

/**
 * 使用 Electron net.fetch 发起请求（尊重系统代理设置）
 */
async function safeFetch(
  url: string,
  init: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const timeout = init.timeout ?? SEARCH_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const fetchFn =
    typeof net !== 'undefined' && typeof net.fetch === 'function' ? net.fetch : fetch
  try {
    return await fetchFn(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/** 单条搜索结果 */
interface SearchResult {
  title: string
  url: string
  snippet: string
}

/** 缓存条目 */
interface CacheEntry {
  results: SearchResult[]
  timestamp: number
}

/** 简易 LRU 缓存 */
const searchCache = new Map<string, CacheEntry>()

function makeCacheKey(query: string, maxResults: number, region?: string): string {
  return `${query.toLowerCase().trim()}|${maxResults}|${region ?? ''}`
}

function readCache(key: string): SearchResult[] | null {
  const entry = searchCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key)
    return null
  }
  return entry.results
}

function writeCache(key: string, results: SearchResult[]): void {
  if (searchCache.size >= CACHE_MAX_SIZE) {
    let oldestKey: string | null = null
    let oldestTs = Number.POSITIVE_INFINITY
    searchCache.forEach((v, k) => {
      if (v.timestamp < oldestTs) {
        oldestTs = v.timestamp
        oldestKey = k
      }
    })
    if (oldestKey) searchCache.delete(oldestKey)
  }
  searchCache.set(key, { results, timestamp: Date.now() })
}

// ============================================================
// Parallel Web Search（MCP 协议，主搜索方式）
// ============================================================

/**
 * 构建 Parallel Web Search 的 MCP JSON-RPC 2.0 请求体
 */
function buildParallelMcpRequest(query: string) {
  return {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'tools/call',
    params: {
      name: 'web_search',
      arguments: {
        objective: query,
        search_queries: [query],
      },
    },
  }
}

/**
 * 从 MCP 响应中提取搜索结果文本
 * 响应可能是直接 JSON 或 SSE 流（data: 行）
 */
function parseMcpResponse(body: string): string | undefined {
  const trimmed = body.trim()

  // 尝试直接解析 JSON
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed)
      const content = data?.result?.content
      if (Array.isArray(content)) {
        const textItem = content.find((item: any) => item.type === 'text' && item.text)
        if (textItem?.text) return textItem.text
      }
    } catch {
      // 不是有效 JSON，继续尝试 SSE
    }
  }

  // 尝试解析 SSE 流
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const data = line.substring(6).trim()
    if (!data || data === '[DONE]') continue
    try {
      const parsed = JSON.parse(data)
      const content = parsed?.result?.content
      if (Array.isArray(content)) {
        const textItem = content.find((item: any) => item.type === 'text' && item.text)
        if (textItem?.text) return textItem.text
      }
    } catch {
      continue
    }
  }

  return undefined
}

/**
 * 将 Parallel 返回的文本解析为结构化搜索结果
 * Parallel 返回格式：{ search_id, results: [{ url, title, publish_date, excerpts: [...] }] }
 * 也兼容直接数组格式：[{ url, title, snippet }]
 */
function parseParallelResults(text: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []
  const seen = new Set<string>()

  // 尝试解析 JSON 格式的结果
  try {
    const data = JSON.parse(text)

    // 提取结果数组：支持 { results: [...] } 和直接 [...] 两种格式
    const items = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : null

    if (items) {
      for (const item of items) {
        if (results.length >= maxResults) break
        const url = item.url || item.link || item.href
        const title = item.title || item.name || ''
        // 摘要：优先 excerpts 数组，其次 snippet/description/content
        let snippet = ''
        if (Array.isArray(item.excerpts) && item.excerpts.length > 0) {
          snippet = item.excerpts.join(' ... ').slice(0, 300)
        } else {
          snippet = item.snippet || item.description || item.content || ''
        }
        // 附加发布日期信息
        if (item.publish_date && snippet) {
          snippet = `[${item.publish_date}] ${snippet}`
        }
        if (typeof url === 'string' && !seen.has(url)) {
          seen.add(url)
          results.push({ title: title || '(无标题)', url, snippet: snippet || '(无摘要)' })
        }
      }
      if (results.length > 0) return results
    }
  } catch {
    // 不是 JSON，继续文本解析
  }

  // 文本解析：匹配 URL 和附近的标题
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/g
  const lines = text.split('\n')
  let currentTitle = ''
  let currentSnippet = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const urlMatch = line.match(urlRegex)
    if (urlMatch) {
      for (const url of urlMatch) {
        if (results.length >= maxResults) break
        // 跳过内部/无效链接
        if (url.includes('parallel.ai') || url.includes('search.parallel')) continue
        if (seen.has(url)) continue
        seen.add(url)

        // 标题可能是当前行去掉 URL 后的部分，或上一行
        let title = line.replace(urlRegex, '').replace(/^[\s\-\*#\d+\.]+/, '').trim()
        if (!title && i > 0) {
          title = lines[i - 1].trim().replace(/^[\s\-\*#\d+\.]+/, '')
        }

        // 摘要可能是下一行
        let snippet = ''
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim()
          if (nextLine && !nextLine.match(urlRegex)) {
            snippet = nextLine
          }
        }

        results.push({
          title: title || '(无标题)',
          url,
          snippet: snippet || currentSnippet || '(无摘要)',
        })
      }
    } else {
      // 累积上下文作为标题/摘要
      if (line.length > 10 && !currentTitle) {
        currentTitle = line
      } else if (line.length > 20) {
        currentSnippet = line
      }
    }
  }

  return results
}

/**
 * 调用 Parallel Web Search MCP 端点
 */
async function searchWithParallel(
  query: string,
  maxResults: number,
): Promise<{ results: SearchResult[]; error?: string }> {
  try {
    const response = await safeFetch(PARALLEL_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'User-Agent': 'zx-code',
      },
      body: JSON.stringify(buildParallelMcpRequest(query)),
      timeout: SEARCH_TIMEOUT_MS,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      return {
        results: [],
        error: `Parallel HTTP ${response.status} ${response.statusText}: ${errText.slice(0, 200)}`,
      }
    }

    const body = await response.text()
    const text = parseMcpResponse(body)

    if (!text) {
      return { results: [], error: 'Parallel 返回空响应' }
    }

    const results = parseParallelResults(text, maxResults)
    return { results }
  } catch (err) {
    const e = err as Error
    return {
      results: [],
      error: `Parallel 请求失败: ${e.message || String(err)}`,
    }
  }
}

// ============================================================
// DuckDuckGo + Bing（后备搜索方式）
// ============================================================

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    const trackingKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid']
    trackingKeys.forEach((k) => u.searchParams.delete(k))
    let s = u.toString()
    if (s.endsWith('/') && u.pathname === '/') {
      s = s.slice(0, -1)
    }
    return s
  } catch {
    return url
  }
}

function extractRealUrl(href: string): string {
  try {
    const fullHref = href.startsWith('//') ? 'https:' + href : href
    const u = new URL(fullHref)
    const uddg = u.searchParams.get('uddg')
    if (uddg) return uddg
    return fullHref
  } catch {
    return href
  }
}

function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []
  const linkRegex =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRegex =
    /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi

  const links: Array<{ url: string; title: string; index: number }> = []
  let m: RegExpExecArray | null
  while ((m = linkRegex.exec(html)) !== null) {
    links.push({
      url: extractRealUrl(m[1]),
      title: decodeHtmlEntities(stripTags(m[2])).trim(),
      index: m.index,
    })
  }

  const snippets: Array<{ text: string; index: number }> = []
  while ((m = snippetRegex.exec(html)) !== null) {
    snippets.push({
      text: decodeHtmlEntities(stripTags(m[1])).replace(/\s+/g, ' ').trim(),
      index: m.index,
    })
  }

  for (const link of links) {
    if (results.length >= maxResults) break
    let snippet = ''
    let bestDist = Number.POSITIVE_INFINITY
    for (const s of snippets) {
      if (s.index > link.index) {
        const dist = s.index - link.index
        if (dist < bestDist) {
          bestDist = dist
          snippet = s.text
        }
      }
    }
    if (!link.title && !link.url) continue
    results.push({
      title: link.title || '(无标题)',
      url: link.url,
      snippet: snippet || '(无摘要)',
    })
  }

  return results
}

function parseLiteSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []
  const linkRegex = /<a[^>]*class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRegex = /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi

  const links: Array<{ url: string; title: string; index: number }> = []
  let m: RegExpExecArray | null
  while ((m = linkRegex.exec(html)) !== null) {
    links.push({
      url: extractRealUrl(m[1]),
      title: decodeHtmlEntities(stripTags(m[2])).trim(),
      index: m.index,
    })
  }

  const snippets: Array<{ text: string; index: number }> = []
  while ((m = snippetRegex.exec(html)) !== null) {
    snippets.push({
      text: decodeHtmlEntities(stripTags(m[1])).replace(/\s+/g, ' ').trim(),
      index: m.index,
    })
  }

  for (const link of links) {
    if (results.length >= maxResults) break
    let snippet = ''
    let bestDist = Number.POSITIVE_INFINITY
    for (const s of snippets) {
      if (s.index > link.index) {
        const dist = s.index - link.index
        if (dist < bestDist) {
          bestDist = dist
          snippet = s.text
        }
      }
    }
    if (!link.title && !link.url) continue
    if (link.url.includes('duckduckgo.com')) continue
    results.push({
      title: link.title || '(无标题)',
      url: link.url,
      snippet: snippet || '(无摘要)',
    })
  }

  return results
}

function parseBingSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []
  const itemRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi
  const linkRegex = /<h2>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
  const captionRegex = /<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i
  const slugRegex = /<p[^>]*class="[^"]*b_algoSlug[^"]*"[^>]*>([\s\S]*?)<\/p>/i

  let itemMatch: RegExpExecArray | null
  while ((itemMatch = itemRegex.exec(html)) !== null) {
    if (results.length >= maxResults) break
    const block = itemMatch[1]
    const linkM = linkRegex.exec(block)
    if (!linkM) continue
    const url = linkM[1]
    const title = decodeHtmlEntities(stripTags(linkM[2])).trim()
    if (!url || url.includes('bing.com') || url.startsWith('/')) continue
    let snippet = ''
    const capM = captionRegex.exec(block)
    if (capM) {
      snippet = decodeHtmlEntities(stripTags(capM[1])).replace(/\s+/g, ' ').trim()
    } else {
      const slugM = slugRegex.exec(block)
      if (slugM) {
        snippet = decodeHtmlEntities(stripTags(slugM[1])).replace(/\s+/g, ' ').trim()
      }
    }
    if (!title && !url) continue
    results.push({
      title: title || '(无标题)',
      url,
      snippet: snippet || '(无摘要)',
    })
  }

  return results
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  const out: SearchResult[] = []
  for (const r of results) {
    const key = normalizeUrl(r.url)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

function isTimeoutError(e: Error): boolean {
  return (
    e.name === 'TimeoutError' ||
    e.name === 'AbortError' ||
    (typeof e.message === 'string' && /timed? out|abort/i.test(e.message))
  )
}

/**
 * 后备搜索：使用 DuckDuckGo + Bing 抓取
 */
async function searchWithFallback(
  query: string,
  maxResults: number,
  region: string,
): Promise<{ results: SearchResult[]; errors: string[] }> {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': `${region},zh;q=0.9,en;q=0.8`,
  }

  let results: SearchResult[] = []
  const errors: string[] = []

  const ddgHtmlUrl = `${DDG_HTML_ENDPOINT}?q=${encodeURIComponent(query)}`
  const ddgLiteUrl = `${DDG_LITE_ENDPOINT}?q=${encodeURIComponent(query)}`
  const bingUrl = `${BING_ENDPOINT}?q=${encodeURIComponent(query)}${
    region ? `&mkt=${encodeURIComponent(region)}` : ''
  }&setlang=${encodeURIComponent(region.split('-')[0] || 'zh')}`

  const endpoints: Array<{ name: string; url: string; parser: (html: string, n: number) => SearchResult[] }> = [
    { name: 'DuckDuckGo-HTML', url: ddgHtmlUrl, parser: parseSearchResults },
    { name: 'DuckDuckGo-Lite', url: ddgLiteUrl, parser: parseLiteSearchResults },
    { name: 'Bing', url: bingUrl, parser: parseBingSearchResults },
  ]

  for (const ep of endpoints) {
    if (results.length >= maxResults) break
    try {
      const response = await safeFetch(ep.url, {
        method: 'GET',
        headers,
        redirect: 'follow',
        timeout: SEARCH_TIMEOUT_MS,
      })
      if (!response.ok) {
        errors.push(`[${ep.name}] HTTP ${response.status} ${response.statusText} @ ${ep.url}`)
        continue
      }
      const html = await response.text()
      const epResults = ep.parser(html, maxResults * 2)
      if (epResults.length > 0) {
        results = dedupeResults([...results, ...epResults]).slice(0, maxResults)
        if (results.length >= maxResults) break
      }
    } catch (err) {
      const e = err as Error
      errors.push(
        isTimeoutError(e)
          ? `[${ep.name}] 请求超时 @ ${ep.url}`
          : `[${ep.name}] ${e.message || String(err)} @ ${ep.url}`,
      )
    }
  }

  return { results, errors }
}

/**
 * websearch 工具：通过 Parallel Web Search（MCP 协议）执行搜索，
 * DuckDuckGo + Bing 作为后备。
 *
 * 改进点（移植自 opencode）：
 * 1. 主搜索使用 Parallel Web Search MCP（免费、AI 优化、无需 API key）
 * 2. 后备使用 DuckDuckGo HTML/Lite + Bing 多端点容错
 * 3. 5 分钟内存缓存
 * 4. URL 规范化去重
 */
export const websearchTool: BuiltinTool = {
  name: 'websearch',
  description:
    '使用 Parallel Web Search（MCP 协议，AI 优化）搜索关键词，DuckDuckGo + Bing 作为后备。返回标题、URL 与摘要组成的结构化结果列表。适用于获取最新信息和超越知识截止日期的数据。',
  parameters: {
    query: {
      type: 'string',
      description: '搜索关键词',
    },
    maxResults: {
      type: 'number',
      description: '最大返回结果数，默认 8',
      default: DEFAULT_MAX_RESULTS,
    },
    region: {
      type: 'string',
      description: '搜索区域/语言偏好（如 "zh-CN"、"en-US"），默认 "zh-CN"',
      default: 'zh-CN',
    },
  },
  required: ['query'],
  requiredPermissions: [],
  async execute(args, _context): Promise<ToolExecutionResult> {
    const query = args.query as string
    const maxResults =
      Number.isFinite(Number(args.maxResults)) && Number(args.maxResults) > 0
        ? Math.min(Number(args.maxResults), MAX_RESULTS_CAP)
        : DEFAULT_MAX_RESULTS
    const region = (args.region as string) || 'zh-CN'

    if (!query || typeof query !== 'string') {
      return {
        tool_call_id: '',
        content: '参数 query 必须为非空字符串',
        is_error: true,
      }
    }

    // 1) 检查缓存
    const cacheKey = makeCacheKey(query, maxResults, region)
    const cached = readCache(cacheKey)
    if (cached) {
      const lines: string[] = [
        `搜索关键词: ${query}（来自缓存）`,
        `共返回 ${cached.length} 条结果：`,
        '',
      ]
      cached.forEach((r, i) => {
        lines.push(`## ${i + 1}. ${r.title}`)
        lines.push(`URL: ${r.url}`)
        lines.push(`摘要: ${r.snippet}`)
        lines.push('')
      })
      return {
        tool_call_id: '',
        content: lines.join('\n').trim(),
        is_error: false,
      }
    }

    // 2) 主搜索：Parallel Web Search（MCP）
    const parallelResult = await searchWithParallel(query, maxResults)
    let results = parallelResult.results
    const allErrors: string[] = []
    if (parallelResult.error) {
      allErrors.push(`[Parallel] ${parallelResult.error}`)
    }

    // 3) 后备搜索：DuckDuckGo + Bing（结果不足或主搜索失败时）
    if (results.length < maxResults) {
      const fallback = await searchWithFallback(query, maxResults, region)
      results = dedupeResults([...results, ...fallback.results]).slice(0, maxResults)
      allErrors.push(...fallback.errors)
    }

    if (results.length === 0) {
      return {
        tool_call_id: '',
        content:
          allErrors.length > 0
            ? `搜索 "${query}" 失败。\n\n尝试过的端点：\n${allErrors.join('\n')}`
            : `未找到与 "${query}" 相关的搜索结果`,
        is_error: allErrors.length > 0,
      }
    }

    // 4) 写入缓存
    writeCache(cacheKey, results)

    // 5) 格式化输出
    const lines: string[] = [
      `搜索关键词: ${query}`,
      `共返回 ${results.length} 条结果：`,
      '',
    ]
    results.forEach((r, i) => {
      lines.push(`## ${i + 1}. ${r.title}`)
      lines.push(`URL: ${r.url}`)
      lines.push(`摘要: ${r.snippet}`)
      lines.push('')
    })

    return {
      tool_call_id: '',
      content: lines.join('\n').trim(),
      is_error: false,
    }
  },
}
