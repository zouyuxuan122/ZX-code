import { net } from 'electron'
import { Parser } from 'htmlparser2'
import TurndownService from 'turndown'
import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'

/** 默认最大返回字符数 */
const DEFAULT_MAX_LENGTH = 32000
/** 请求超时时间（毫秒） */
const FETCH_TIMEOUT_MS = 30_000
/** 最大超时上限 */
const MAX_TIMEOUT_MS = 120_000
/** 最大响应体大小（5MB） */
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024
/** 使用的 User-Agent（模拟桌面 Chrome，避免被识别为爬虫） */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
/** 诚实的 User-Agent，用于 Cloudflare 拦截后重试 */
const HONEST_USER_AGENT = 'zx-code'

/**
 * 使用 Electron net.fetch 发起请求（尊重系统代理设置，使用 Chromium 网络栈）
 * 若 net.fetch 不可用（app 未 ready），回退到 Node.js 原生 fetch
 */
async function safeFetch(
  url: string,
  init: RequestInit & { timeout?: number; userAgent?: string } = {},
): Promise<Response> {
  const timeout = init.timeout ?? FETCH_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const fetchFn =
    typeof net !== 'undefined' && typeof net.fetch === 'function' ? net.fetch : fetch
  const { userAgent, ...restInit } = init
  const headers = new Headers(restInit.headers)
  if (userAgent) {
    headers.set('User-Agent', userAgent)
  }
  try {
    return await fetchFn(url, {
      ...restInit,
      headers,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 使用 htmlparser2 从 HTML 中提取纯文本
 * 跳过 script/style/noscript/iframe/object/embed 标签内容
 */
function extractTextFromHTML(html: string): string {
  let text = ''
  let skipDepth = 0
  const skipTags = new Set(['script', 'style', 'noscript', 'iframe', 'object', 'embed'])

  const parser = new Parser({
    onopentag(name) {
      if (skipDepth > 0 || skipTags.has(name)) {
        skipDepth++
      }
    },
    ontext(input) {
      if (skipDepth === 0) text += input
    },
    onclosetag() {
      if (skipDepth > 0) skipDepth--
    },
  })

  parser.write(html)
  parser.end()

  // 折叠多余空白
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 使用 turndown 将 HTML 转换为 Markdown
 * 保留标题、列表、代码块、链接等结构
 */
function convertHTMLToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  })
  turndownService.remove(['script', 'style', 'meta', 'link'])
  return turndownService.turndown(html)
}

/** 判断错误是否为超时 */
function isTimeoutError(e: Error): boolean {
  return (
    e.name === 'TimeoutError' ||
    e.name === 'AbortError' ||
    (typeof e.message === 'string' && /timed? out|abort/i.test(e.message))
  )
}

/** 根据 format 参数构建 Accept 头 */
function buildAcceptHeader(format: string): string {
  switch (format) {
    case 'markdown':
      return 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1'
    case 'text':
      return 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1'
    case 'html':
      return 'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1'
    default:
      return 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
  }
}

/**
 * webfetch 工具：抓取指定 URL 的网页内容，支持 markdown/text/html 三种输出格式。
 *
 * 改进点（移植自 opencode）：
 * 1. 使用 htmlparser2 进行 HTML 解析（比正则更可靠）
 * 2. 使用 turndown 进行 HTML→Markdown 转换（保留结构）
 * 3. Cloudflare 拦截检测，自动用诚实 UA 重试
 * 4. Content-Type 感知处理
 * 5. 5MB 响应体大小限制
 * 6. 可配置超时（最大 120s）
 */
export const webfetchTool: BuiltinTool = {
  name: 'webfetch',
  description:
    '抓取指定 URL 的网页内容，支持 markdown/text/html 三种输出格式。使用 htmlparser2 和 turndown 进行高质量内容提取，自动处理 Cloudflare 拦截。仅支持 http/https 协议。',
  parameters: {
    url: {
      type: 'string',
      description: '要抓取的网页 URL（仅支持 http/https）',
    },
    format: {
      type: 'string',
      description:
        '返回内容的格式：markdown（默认，保留结构）、text（纯文本）、html（原始 HTML）',
      default: 'markdown',
    },
    maxLength: {
      type: 'number',
      description: '最大返回字符数，默认 32000',
      default: DEFAULT_MAX_LENGTH,
    },
    timeout: {
      type: 'number',
      description: '请求超时时间（秒），最大 120，默认 30',
      default: 30,
    },
  },
  required: ['url'],
  requiredPermissions: [],
  async execute(args, _context): Promise<ToolExecutionResult> {
    const url = args.url as string
    const format = (args.format as string) || 'markdown'
    const maxLength =
      Number.isFinite(Number(args.maxLength)) && Number(args.maxLength) > 0
        ? Number(args.maxLength)
        : DEFAULT_MAX_LENGTH
    const timeoutSeconds =
      Number.isFinite(Number(args.timeout)) && Number(args.timeout) > 0
        ? Math.min(Number(args.timeout), MAX_TIMEOUT_MS / 1000)
        : FETCH_TIMEOUT_MS / 1000
    const timeoutMs = timeoutSeconds * 1000

    if (!url || typeof url !== 'string') {
      return {
        tool_call_id: '',
        content: '参数 url 必须为非空字符串',
        is_error: true,
      }
    }

    // 校验 URL 协议
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          tool_call_id: '',
          content: `仅支持 http/https 协议: ${url}`,
          is_error: true,
        }
      }
    } catch {
      return {
        tool_call_id: '',
        content: `URL 格式非法: ${url}`,
        is_error: true,
      }
    }

    const acceptHeader = buildAcceptHeader(format)
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: acceptHeader,
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }

    try {
      let response = await safeFetch(url, {
        method: 'GET',
        headers,
        redirect: 'follow',
        timeout: timeoutMs,
        userAgent: USER_AGENT,
      })

      // Cloudflare 拦截检测：403 + cf-mitigated: challenge
      // 用诚实的 UA 重试（opencode 策略：TLS 指纹不匹配时改用真实标识）
      if (
        response.status === 403 &&
        response.headers.get('cf-mitigated') === 'challenge'
      ) {
        response = await safeFetch(url, {
          method: 'GET',
          headers,
          redirect: 'follow',
          timeout: timeoutMs,
          userAgent: HONEST_USER_AGENT,
        })
      }

      // 非 2xx 状态码视为错误
      if (!response.ok) {
        return {
          tool_call_id: '',
          content: `请求失败: HTTP ${response.status} ${response.statusText} @ ${url}`,
          is_error: true,
        }
      }

      // 检查 Content-Length
      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        return {
          tool_call_id: '',
          content: `响应体过大（${contentLength} 字节，超过 5MB 限制）@ ${url}`,
          is_error: true,
        }
      }

      const raw = await response.text()

      // 再次检查实际大小
      if (raw.length > MAX_RESPONSE_SIZE) {
        return {
          tool_call_id: '',
          content: `响应体过大（${raw.length} 字符，超过 5MB 限制）@ ${url}`,
          is_error: true,
        }
      }

      const contentType = response.headers.get('content-type') || ''

      // 根据请求格式和实际内容类型处理
      let processedContent: string

      if (format === 'html') {
        processedContent = raw
      } else if (format === 'text') {
        if (contentType.includes('text/html')) {
          processedContent = extractTextFromHTML(raw)
        } else {
          processedContent = raw
        }
      } else {
        // markdown（默认）
        if (contentType.includes('text/html')) {
          try {
            processedContent = convertHTMLToMarkdown(raw)
          } catch {
            // turndown 失败时回退到 text 提取
            processedContent = extractTextFromHTML(raw)
          }
        } else {
          processedContent = raw
        }
      }

      // 截断到 maxLength
      const truncated =
        processedContent.length > maxLength
          ? processedContent.slice(0, maxLength)
          : processedContent
      const suffix =
        processedContent.length > maxLength
          ? `\n\n[已截断，原始长度 ${processedContent.length} 字符]`
          : ''

      const header = `URL: ${url}\nContent-Type: ${contentType}\n\n`

      return {
        tool_call_id: '',
        content: header + truncated + suffix,
        is_error: false,
      }
    } catch (err) {
      const e = err as Error
      const isTimeout = isTimeoutError(e)
      const message = isTimeout
        ? `请求超时（${timeoutMs}ms）: ${url}\n错误: ${e.message || String(err)}`
        : `抓取网页失败: ${e.message || String(err)}\nURL: ${url}`
      return {
        tool_call_id: '',
        content: message,
        is_error: true,
      }
    }
  },
}
