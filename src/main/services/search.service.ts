import fs from 'fs/promises'
import path from 'path'
import type Database from 'better-sqlite3'
import type { Message } from '../../shared/types/conversation'
import {
  searchMessages,
  getConversationsByFts,
  type SearchResult,
  type ConversationSearchResult,
} from '../database/repositories/search.repo'
import { isIgnoredDir } from '../tools/builtin/path.util'
import type { FileSearchResult, SearchOptions } from '../../shared/types/search'

/** 对话摘要生成函数类型（便于测试注入，参考 memory-extract.service.ts 模式） */
export type ConversationSummarizer = (
  conversationId: string,
  messages: Message[],
) => Promise<string>

/**
 * 按文件名 / 内容搜索工作区文件
 * @param options 搜索选项
 * @returns 匹配的文件列表
 */
export async function searchFiles(options: SearchOptions): Promise<FileSearchResult[]> {
  const {
    workspacePath,
    query,
    mode = 'all',
    maxResults = 100,
    useRegex = false,
    caseSensitive = false,
  } = options

  if (!query || !workspacePath) return []

  const results: FileSearchResult[] = []
  const lowerQuery = caseSensitive ? query : query.toLowerCase()

  let regex: RegExp | null = null
  if (useRegex) {
    try {
      regex = new RegExp(query, caseSensitive ? '' : 'i')
    } catch {
      return []
    }
  }

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxResults) return
    let items: import('fs').Dirent[]
    try {
      items = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items) {
      if (results.length >= maxResults) return
      const abs = path.join(dir, item.name)
      if (item.isDirectory()) {
        if (!isIgnoredDir(item.name)) await walk(abs)
      } else if (item.isFile()) {
        const rel = path.relative(workspacePath, abs)
        const nameToMatch = caseSensitive ? item.name : item.name.toLowerCase()
        const nameMatched = useRegex
          ? (regex?.test(item.name) ?? false)
          : nameToMatch.includes(lowerQuery)
        if ((mode === 'filename' || mode === 'all') && nameMatched) {
          results.push({
            filepath: rel,
            absolutePath: abs,
            filename: item.name,
            matchType: 'filename',
            score: 1,
          })
          continue
        }
        if (mode === 'content' || mode === 'all') {
          try {
            const lines = (await fs.readFile(abs, 'utf-8')).split('\n')
            for (let i = 0; i < lines.length; i++) {
              if (results.length >= maxResults) return
              const line = lines[i]
              const target = caseSensitive ? line : line.toLowerCase()
              const matched = useRegex
                ? (regex?.test(line) ?? false)
                : target.includes(lowerQuery)
              if (matched) {
                results.push({
                  filepath: rel,
                  absolutePath: abs,
                  filename: item.name,
                  line: i + 1,
                  preview: line.slice(0, 200),
                  matchType: 'content',
                  score: 0.5,
                })
                break
              }
            }
          } catch {
            // 跳过二进制或不可读文件
          }
        }
      }
    }
  }

  await walk(workspacePath)
  return results
}

/** 带摘要的对话搜索结果 */
export interface SearchResultWithSummary {
  conversationId: string
  matchCount: number
  bestSnippet: string
  summary: string
}

/**
 * 搜索服务
 * - search: 消息级 FTS5 全文搜索
 * - searchWithSummary: 对话级搜索 + LLM 摘要（summarizer 通过构造函数注入）
 */
export class SearchService {
  constructor(
    private db: Database.Database,
    private summarizer?: ConversationSummarizer,
  ) {}

  /** 消息级搜索，返回带高亮片段的结果 */
  search(keyword: string, limit?: number): SearchResult[] {
    return searchMessages(this.db, keyword, limit)
  }

  /**
   * 对话级搜索并为每个匹配对话生成一句话摘要。
   * 1. 调用 getConversationsByFts 获取匹配对话
   * 2. 对每个对话取若干条消息
   * 3. 调用注入的 summarizer 生成摘要（失败时 summary 为空）
   */
  async searchWithSummary(
    keyword: string,
    limit?: number,
  ): Promise<SearchResultWithSummary[]> {
    const conversations = getConversationsByFts(this.db, keyword, limit)
    const results: SearchResultWithSummary[] = []

    for (const conv of conversations) {
      let summary = ''
      if (this.summarizer) {
        try {
          const messages = this.fetchConversationMessages(conv.conversationId, 5)
          summary = await this.summarizer(conv.conversationId, messages)
        } catch {
          summary = ''
        }
      }
      results.push({
        conversationId: conv.conversationId,
        matchCount: conv.matchCount,
        bestSnippet: conv.bestSnippet,
        summary,
      })
    }

    return results
  }

  /** 获取对话内最近若干条消息（按时间正序） */
  private fetchConversationMessages(conversationId: string, limit: number): Message[] {
    return this.db
      .prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?',
      )
      .all(conversationId, limit) as Message[]
  }
}

/** 重新导出 repo 类型，便于外部使用 */
export type { SearchResult, ConversationSearchResult }
