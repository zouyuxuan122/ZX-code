import type { RecallResultItem } from '../../shared/types/memory'
import type { ExtractedMemory } from '../services/memory-extract.service'
import type { Message } from '../../shared/types/conversation'
import type { UserProfileSummary } from '../../shared/types/user-profile'

/** LLM 补全函数类型 */
type CompleteFn = (params: { content: string; systemPrompt?: string }) => Promise<{ content: string }>

/** 用户画像 section 的最大字符数(含标题) */
const MAX_PROFILE_SECTION_LEN = 500

/**
 * 构建记忆检索 section,注入 system prompt
 */
export function buildMemoryRecallSection(memories: RecallResultItem[]): string {
  if (memories.length === 0) return ''

  const lines: string[] = ['## 相关记忆']
  for (const item of memories) {
    const content = item.node.content.length > 200
      ? item.node.content.slice(0, 200) + '...'
      : item.node.content
    lines.push(`- [${item.node.partition}] ${item.node.title}: ${content}`)
  }
  return lines.join('\n')
}

/**
 * 创建记忆抽取函数(用于注入 MemoryExtractService)
 * 调用 LLM 从对话中抽取关键信息
 */
export function createMemoryExtractor(complete: CompleteFn): (messages: Message[]) => Promise<ExtractedMemory[]> {
  return async (messages: Message[]) => {
    if (messages.length === 0) return []

    try {
      // 构建对话摘要
      const conversationText = messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n')
        .slice(0, 8000) // 限制长度

      const systemPrompt = `你是一个记忆抽取器。从以下对话中抽取关键信息,返回 JSON 数组。
每条记忆包含: partition(分区: project/decision/error/preference/general), title(简短标题), content(详细内容), tags(标签数组)。
只抽取有价值的信息,忽略寒暄和无关内容。返回纯 JSON 数组,不要其他文字。

对话内容:
${conversationText}`

      const result = await complete({ content: '', systemPrompt })

      // 解析 JSON
      const jsonStr = result.content.trim()
      // 尝试提取 JSON(LLM 可能包裹在 markdown 代码块中)
      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []

      const parsed = JSON.parse(jsonMatch[0])
      if (!Array.isArray(parsed)) return []

      return parsed.filter((item: any) =>
        item && item.partition && item.title && item.content
      ).map((item: any) => ({
        partition: item.partition,
        title: String(item.title),
        content: String(item.content),
        tags: Array.isArray(item.tags) ? item.tags : []
      }))
    } catch (err) {
      console.warn('[MemoryExtractor] 抽取失败:', err)
      return []
    }
  }
}

/**
 * 构建用户画像 section,注入 system prompt
 * - 无摘要或空 raw 时返回空字符串
 * - 有画像时返回格式化的 "## 用户画像" section
 */
export function buildUserProfileSection(summary?: UserProfileSummary | null): string {
  if (!summary || !summary.raw) return ''
  const section = `## 用户画像\n${summary.raw}`
  if (section.length > MAX_PROFILE_SECTION_LEN) {
    return section.slice(0, MAX_PROFILE_SECTION_LEN)
  }
  return section
}

/**
 * 从用户消息提取检索关键词
 */
export function extractKeywords(message: string): string[] {
  const stopWords = new Set([
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '都', '一', '上', '也', '到', '说', '要', '去', '你', '会', '着', '看', '好', '这',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'not'
  ])

  const words = message
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()))

  return [...new Set(words)].slice(0, 5)
}
