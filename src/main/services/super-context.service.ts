import * as fs from 'fs'
import * as path from 'path'
import type { MemoryRecallService } from './memory-recall.service'
import type Database from 'better-sqlite3'
import type {
  ContextBriefing,
  BriefingFileItem,
  BriefingMemoryItem,
  BriefingHistoryItem,
} from '../../shared/types/supercontext'
import { getConversationsByFts } from '../database/repositories/search.repo'

/**
 * SuperContext 上下文预热服务
 *
 * 在用户发送消息前，异步构建上下文简报（相关文件 / 相关记忆 / 历史相似对话），
 * 消除冷启动。性能约束 ≤800ms，超时降级为空简报（degraded=true）。
 */
export class SuperContextService {
  constructor(
    private recallService: MemoryRecallService,
    private db: Database.Database,
  ) {}

  async buildBriefing(
    workspacePath: string,
    userMessage: string,
    timeoutMs: number = 800,
  ): Promise<ContextBriefing> {
    const startTime = Date.now()

    // 注意：必须先创建 timeoutPromise 再创建 buildPromise。
    // doBuild 首步会 yield 到事件循环（setTimeout 0），让超时定时器有机会触发；
    // 当 timeoutMs 极短（如 1ms）时，先注册的超时定时器会先触发并赢得 race，从而稳定降级。
    const timeoutPromise = new Promise<ContextBriefing>((resolve) => {
      setTimeout(() => {
        resolve({
          files: [],
          memories: [],
          histories: [],
          durationMs: Date.now() - startTime,
          degraded: true,
        })
      }, timeoutMs)
    })

    const buildPromise = this.doBuild(workspacePath, userMessage, startTime)

    return Promise.race([buildPromise, timeoutPromise])
  }

  private async doBuild(
    workspacePath: string,
    userMessage: string,
    startTime: number,
  ): Promise<ContextBriefing> {
    // yield 到事件循环，保证超时定时器有机会在极短 timeoutMs 下触发降级
    await new Promise((resolve) => setTimeout(resolve, 0))

    const [files, memories, histories] = await Promise.all([
      this.scanFiles(workspacePath, userMessage),
      this.searchMemories(userMessage),
      this.searchHistories(userMessage),
    ])

    return {
      files,
      memories,
      histories,
      durationMs: Date.now() - startTime,
      degraded: false,
    }
  }

  /** 扫描工作区文件，返回与用户消息相关的文件（≤10） */
  private async scanFiles(workspacePath: string, userMessage: string): Promise<BriefingFileItem[]> {
    const keywords = this.extractKeywords(userMessage)
    if (keywords.length === 0) return []

    const files: BriefingFileItem[] = []

    try {
      this.walkDir(workspacePath, (filePath, relativePath) => {
        if (files.length >= 10) return

        // 跳过 node_modules, .git, dist 等
        if (
          relativePath.includes('node_modules') ||
          relativePath.includes('.git') ||
          relativePath.includes('dist')
        )
          return

        const fileName = path.basename(filePath).toLowerCase()
        for (const kw of keywords) {
          if (fileName.includes(kw.toLowerCase())) {
            files.push({ path: relativePath, reason: `文件名匹配关键词"${kw}"` })
            return
          }
        }

        // 关键词匹配文件内容（只读小文件）
        try {
          const stat = fs.statSync(filePath)
          if (stat.size < 10000 && /\.(ts|tsx|js|jsx|md|json|py)$/.test(fileName)) {
            const content = fs.readFileSync(filePath, 'utf-8').toLowerCase()
            for (const kw of keywords) {
              if (content.includes(kw.toLowerCase())) {
                files.push({ path: relativePath, reason: `内容包含关键词"${kw}"` })
                return
              }
            }
          }
        } catch {
          // 读取失败忽略
        }
      })
    } catch {
      // 扫描失败忽略
    }

    return files.slice(0, 10)
  }

  /** 检索相关记忆（≤3） */
  private async searchMemories(userMessage: string): Promise<BriefingMemoryItem[]> {
    const keywords = this.extractKeywords(userMessage)
    if (keywords.length === 0) return []

    const items: BriefingMemoryItem[] = []
    for (const kw of keywords) {
      if (items.length >= 3) break
      const results = this.recallService.queryNodes({ keyword: kw, limit: 3 })
      for (const r of results) {
        if (items.length >= 3) break
        if (!items.find((i) => i.id === r.node.id)) {
          items.push({
            id: r.node.id,
            title: r.node.title,
            partition: r.node.partition,
            snippet: r.node.content.slice(0, 200),
          })
        }
      }
    }
    return items
  }

  /** 搜索历史相似对话（≤2），使用 FTS5 全文检索替代 LIKE 匹配 */
  private async searchHistories(userMessage: string): Promise<BriefingHistoryItem[]> {
    const keywords = this.extractKeywords(userMessage)
    if (keywords.length === 0) return []

    try {
      const ftsQuery = keywords.join(' ')
      const ftsResults = getConversationsByFts(this.db, ftsQuery, 2)

      if (ftsResults.length === 0) return []

      // 获取对话标题
      const conversationIds = ftsResults.map((r) => r.conversationId)
      const placeholders = conversationIds.map(() => '?').join(',')
      const convs = this.db
        .prepare(`SELECT id, title FROM conversations WHERE id IN (${placeholders})`)
        .all(...conversationIds) as Array<{ id: string; title: string }>

      const titleMap = new Map(convs.map((c) => [c.id, c.title]))

      return ftsResults.map((r) => ({
        conversationId: r.conversationId,
        title: titleMap.get(r.conversationId) ?? '',
        summary: '',
      }))
    } catch {
      return []
    }
  }

  /** 从用户消息提取关键词（简单分词） */
  private extractKeywords(message: string): string[] {
    const stopWords = new Set([
      '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
      '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
      '自己', '这',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at',
      'for', 'with', 'and', 'or', 'not',
    ])

    const words = message
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !stopWords.has(w.toLowerCase()))

    return [...new Set(words)].slice(0, 5)
  }

  /** 递归遍历目录，relativePath 始终相对于根 workspacePath */
  private walkDir(
    rootDir: string,
    callback: (filePath: string, relativePath: string) => void,
  ): void {
    this.walkDirInternal(rootDir, rootDir, callback)
  }

  private walkDirInternal(
    rootDir: string,
    currentDir: string,
    callback: (filePath: string, relativePath: string) => void,
  ): void {
    if (!fs.existsSync(currentDir)) return
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        this.walkDirInternal(rootDir, fullPath, callback)
      } else {
        callback(fullPath, path.relative(rootDir, fullPath))
      }
    }
  }

  /** 格式化简报为可注入的文本 */
  formatBriefingAsText(briefing: ContextBriefing): string {
    if (
      briefing.degraded ||
      (briefing.files.length === 0 &&
        briefing.memories.length === 0 &&
        briefing.histories.length === 0)
    ) {
      return ''
    }

    const parts: string[] = []

    if (briefing.files.length > 0) {
      parts.push('## 相关文件')
      for (const f of briefing.files) {
        parts.push(`- ${f.path} (${f.reason})`)
      }
    }

    if (briefing.memories.length > 0) {
      parts.push('\n## 相关记忆')
      for (const m of briefing.memories) {
        parts.push(`- [${m.partition}] ${m.title}: ${m.snippet}`)
      }
    }

    if (briefing.histories.length > 0) {
      parts.push('\n## 历史对话')
      for (const h of briefing.histories) {
        parts.push(`- ${h.title}${h.summary ? ': ' + h.summary : ''}`)
      }
    }

    return parts.join('\n')
  }
}
