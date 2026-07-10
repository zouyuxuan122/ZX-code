import * as conversationRepo from '../database/repositories/conversation.repo'
import * as providerRepo from '../database/repositories/provider.repo'
import * as settingsRepo from '../database/repositories/settings.repo'
import { estimateTokens } from './token.estimator'
import { DEFAULT_SYSTEM_PROMPT } from './context.builder'
import type { ContextUsage, ContextBreakdown, MessageTokenInfo } from '@shared/types/context'
import type { Message, MessageMetadata } from '@shared/types/conversation'

/**
 * 上下文使用情况服务
 *
 * 提供给右侧栏的实时数据：
 * - 总 token / 上限 / 使用率
 * - 各角色（system/user/assistant/tool/summary）的 token 分布
 * - 单条消息的描述与 token 数（用于使用详情列表）
 * - 压缩历史（最近一次时间、累计次数）
 */

/** 默认配置（设置项未写入数据库时使用） */
const DEFAULTS = {
  maxContextLength: 32000,
  compressThreshold: 80,
  autoCompress: true,
  compressKeepRecent: 6,
} as const

/** 读取上下文相关设置 */
export function getContextSettings(): {
  maxContextLength: number
  compressThreshold: number
  autoCompress: boolean
  compressKeepRecent: number
} {
  return {
    maxContextLength: readNumber('api.maxContextLength', DEFAULTS.maxContextLength),
    compressThreshold: readNumber('api.compressThreshold', DEFAULTS.compressThreshold),
    autoCompress: readBool('api.autoCompress', DEFAULTS.autoCompress),
    compressKeepRecent: readNumber('api.compressKeepRecent', DEFAULTS.compressKeepRecent),
  }
}

/** 获取指定对话的上下文使用情况 */
export function getContextUsage(conversationId: string): ContextUsage | null {
  const conversation = conversationRepo.findById(conversationId)
  if (!conversation) return null

  const settings = getContextSettings()
  // 按模型 context_length 优先：对话有 model 且模型库中存在该模型的 context_length 时用它
  let effectiveMaxContext = settings.maxContextLength
  if (conversation.model) {
    const modelInfo = providerRepo.findModelByModelId(conversation.model)
    if (modelInfo && modelInfo.context_length > 0) {
      effectiveMaxContext = modelInfo.context_length
    }
  }
  const messages = conversationRepo.findMessages(conversationId)

  const breakdown: ContextBreakdown = {
    system: 0,
    user: 0,
    assistant: 0,
    tool: 0,
    summary: 0,
  }

  for (const msg of messages) {
    const tokens = estimateMessageTokens(msg)
    switch (msg.role) {
      case 'system':
        // 区分系统提示与历史摘要：以"[对话历史摘要]"开头视为摘要
        if (msg.content.startsWith('[对话历史摘要]')) {
          breakdown.summary += tokens
        } else {
          breakdown.system += tokens
        }
        break
      case 'user':
        breakdown.user += tokens
        break
      case 'assistant':
        breakdown.assistant += tokens
        break
      case 'tool':
        breakdown.tool += tokens
        break
    }
  }

  // 如果没有 system 消息，按默认提示估算
  const hasSystem = messages.some((m) => m.role === 'system' && !m.content.startsWith('[对话历史摘要]'))
  if (!hasSystem) {
    breakdown.system = estimateTokens(DEFAULT_SYSTEM_PROMPT)
  }

  const totalTokens = breakdown.system + breakdown.user + breakdown.assistant + breakdown.tool + breakdown.summary
  const usagePercent = Math.min(100, Math.round((totalTokens / effectiveMaxContext) * 100))

  // 压缩历史：扫描 system 消息里的 "[对话历史摘要]" 计数
  const compressCount = messages.filter(
    (m) => m.role === 'system' && m.content.startsWith('[对话历史摘要]'),
  ).length
  const lastSummaryMsg = [...messages]
    .reverse()
    .find((m) => m.role === 'system' && m.content.startsWith('[对话历史摘要]'))
  const lastCompressedAt = lastSummaryMsg?.created_at ?? 0

  return {
    conversationId,
    totalTokens,
    maxContextLength: effectiveMaxContext,
    compressThreshold: settings.compressThreshold,
    autoCompress: settings.autoCompress,
    usagePercent,
    breakdown,
    lastCompressedAt,
    compressCount,
  }
}

/** 获取对话内每条消息的 token 信息（用于使用详情列表） */
export function getMessageTokenList(conversationId: string): MessageTokenInfo[] {
  const messages = conversationRepo.findMessages(conversationId)
  return messages.map((msg) => ({
    messageId: msg.id,
    role: msg.role,
    tokens: estimateMessageTokens(msg),
    description: describeMessage(msg),
  }))
}

/** 估算单条消息的 token（含 metadata 中的 tool_calls） */
function estimateMessageTokens(msg: Message): number {
  let total = estimateTokens(msg.content || '')
  if (msg.metadata) {
    try {
      const meta = JSON.parse(msg.metadata) as MessageMetadata
      if (meta.tool_calls && meta.tool_calls.length > 0) {
        for (const tc of meta.tool_calls) {
          total += estimateTokens(tc.function.name)
          total += estimateTokens(tc.function.arguments)
        }
      }
      if (meta.thinking) {
        total += estimateTokens(meta.thinking)
      }
    } catch {
      // 忽略
    }
  }
  return total
}

/** 生成消息的简短描述 */
function describeMessage(msg: Message): string {
  switch (msg.role) {
    case 'system':
      return msg.content.startsWith('[对话历史摘要]')
        ? '历史摘要'
        : '系统提示'
    case 'user':
      return msg.content.length > 40 ? `用户消息: ${msg.content.slice(0, 40)}...` : `用户消息: ${msg.content}`
    case 'assistant': {
      const hasToolCalls = msg.metadata && msg.metadata.includes('"tool_calls"')
      return hasToolCalls ? '助手回复（含工具调用）' : '助手回复'
    }
    case 'tool': {
      const name = msg.tool_name || '工具'
      const isError = msg.metadata && msg.metadata.includes('"is_error":true')
      return `${name} ${isError ? '（错误）' : '结果'}`
    }
    default:
      return msg.role
  }
}

function readNumber(key: string, def: number): number {
  const v = settingsRepo.get(key)
  return typeof v === 'number' ? v : def
}

function readBool(key: string, def: boolean): boolean {
  const v = settingsRepo.get(key)
  return typeof v === 'boolean' ? v : def
}
