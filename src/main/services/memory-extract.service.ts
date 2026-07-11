import type { MemoryRecallService } from './memory-recall.service'
import type { Message } from '../../shared/types/conversation'
import type { CreateMemoryNodeDto, MemoryNode, MemoryPartition } from '../../shared/types/memory'

/** LLM 抽取的记忆条目 */
export interface ExtractedMemory {
  partition: MemoryPartition
  title: string
  content: string
  tags?: string[]
}

/** 抽取函数类型(便于测试注入) */
export type MemoryExtractor = (messages: Message[]) => Promise<ExtractedMemory[]>

/**
 * 记忆抽取服务
 * 对话结束后调用 LLM 抽取关键信息写入记忆树
 * extractor 通过构造函数注入,便于测试与后续集成真实 LLM
 */
export class MemoryExtractService {
  constructor(
    private recallService: MemoryRecallService,
    private extractor: MemoryExtractor
  ) {}

  async extractFromConversation(messages: Message[]): Promise<MemoryNode[]> {
    if (messages.length === 0) return []

    try {
      const extracted = await this.extractor(messages)
      const created: MemoryNode[] = []
      for (const item of extracted) {
        const dto: CreateMemoryNodeDto = {
          partition: item.partition,
          title: item.title,
          content: item.content,
          tags: item.tags
        }
        const node = this.recallService.createNode(dto)
        created.push(node)
      }
      return created
    } catch (err) {
      console.warn('[MemoryExtract] 抽取失败:', err)
      return []
    }
  }
}
