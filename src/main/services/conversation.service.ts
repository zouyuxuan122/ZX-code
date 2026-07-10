import * as conversationRepo from '../database/repositories/conversation.repo'
import * as projectRepo from '../database/repositories/project.repo'
import * as providerRepo from '../database/repositories/provider.repo'
import * as settingsRepo from '../database/repositories/settings.repo'
import { chatWithProvider } from '../providers'
import { agentEngine } from '../agent/engine'
import { getToolDefinitions } from '../tools'
import { buildContext, DEFAULT_SYSTEM_PROMPT } from './context.builder'
import { getContextSettings, getContextUsage } from './context-usage.service'
import { logger } from './logger.service'
import { recordUsage } from './usage-stats.service'
import { getAllowedDirectories } from './permission.service'
import type { Conversation, Message, MessageMetadata, ToolCall } from '@shared/types/conversation'
import type { ChatParams } from '@shared/types/model'
import type { AgentEvent, AgentRunOptions, AgentMode } from '../agent/types'
import type { ToolDefinition } from '@shared/types/tool'

/**
 * 对话管理服务
 * 与项目其他 service 一致，采用函数式导出
 */

/** 根据 Agent 工作模式构建系统提示前缀 */
export function buildSystemPromptForMode(mode: AgentMode, systemPrompt?: string): string {
  const base = systemPrompt ? systemPrompt : DEFAULT_SYSTEM_PROMPT
  if (mode === 'plan') {
    return (
      base +
      '\n\n# 当前模式：Plan（规划模式）\n' +
      '你现在处于规划模式，只能使用只读工具（read_file, list_files, search_files, grep）来研究代码库。\n' +
      '禁止修改任何文件或执行命令。请：\n' +
      '1. 分析用户需求，研究相关代码\n' +
      '2. 使用 todo_write 工具记录计划步骤——高质量的、可验证的步骤\n' +
      '3. 计划应列出涉及的文件、模块和具体步骤\n' +
      '4. 等待用户切换到 Build 模式后再执行修改\n' +
      '若需要澄清需求，使用 question 工具向用户提问。'
    )
  }
  if (mode === 'build') {
    return (
      base +
      '\n\n# 当前模式：Build（构建模式）\n' +
      '你正在构建模式下，可以直接修改文件和执行命令。\n' +
      '**重要行为准则（融合 Codex preamble 原则）**：\n' +
      '1. **先说明再行动**：在调用任何工具之前，发送简短 preamble（1-2 句话，8-12 词）说明你即将做什么\n' +
      '2. **逻辑分组**：多个相关操作在一个 preamble 中描述，而非每个操作单独说明\n' +
      '3. **工具调用后总结**：工具执行完成后，简要说明结果和下一步计划\n' +
      '4. **不要只调工具不说话**：每次工具调用前后都要有文字说明，用户需要知道你在做什么\n' +
      '5. **使用 todo_write 记录计划**：对于多步骤任务，先创建任务清单，再逐步执行\n' +
      '6. **每完成一步立即更新任务清单**：将已完成步骤标记为 completed，开始下一步前标记为 in_progress——不要批量完成\n' +
      '7. **完成后总结**：所有步骤完成后，给出完整的改动总结\n' +
      '你可以使用 write_file/edit/run_command 等工具，也可以使用只读工具研究代码。'
    )
  }
  // chat 模式：纯对话，不修改文件不执行命令
  return (
    base +
    '\n\n# 当前模式：Chat（对话模式）\n' +
    '你现在处于对话模式，这是一个纯交流模式。\n' +
    '**你不能修改任何文件、不能执行命令、不能写入代码**——这些操作在当前模式下被禁用。\n' +
    '你可以：\n' +
    '- 回答编程相关问题、解释概念、提供代码建议（在回复中以代码块形式展示）\n' +
    '- 使用只读工具（read_file, list_files, search_files, grep）查看代码库以提供更准确的回答\n' +
    '- 使用 websearch/webfetch 工具搜索网络信息\n' +
    '- 使用 todo_write 工具记录待办事项\n' +
    '如果用户需要实际修改代码或执行命令，请明确告知用户：\n' +
    '"> 当前处于 Chat 对话模式，无法修改文件或执行命令。请切换到 Build 模式（左侧模式切换器）以执行实际操作。"\n' +
    '若需要澄清需求，使用 question 工具向用户提问。'
  )
}

/** 将附件路径拼接到消息内容前 */
function buildMessageContent(content: string, attachments?: string[]): string {
  if (!attachments || attachments.length === 0) return content
  const lines: string[] = []
  for (const p of attachments) {
    // 仅取 basename 避免泄露完整路径
    const filename = p.split(/[\\/]/).pop() || p
    lines.push(`[附件: ${filename}]`)
  }
  lines.push('')
  lines.push(content)
  return lines.join('\n')
}

/** 创建新对话 */
export function createConversation(
  projectId: string | null,
  title?: string,
): Conversation {
  logger.info(`创建对话: projectId=${projectId}, title=${title || '新对话'}`)
  return conversationRepo.create({
    project_id: projectId || undefined,
    title,
  })
}

/** 获取对话（含消息列表） */
export function getConversation(id: string): { conversation: Conversation; messages: Message[] } | null {
  const conversation = conversationRepo.findById(id)
  if (!conversation) return null
  const messages = conversationRepo.findMessages(id)
  return { conversation, messages }
}

/** 列出对话 */
export function listConversations(projectId?: string): Conversation[] {
  return conversationRepo.findAll(projectId)
}

/** 更新对话 */
export function updateConversation(
  id: string,
  data: { title?: string; model?: string; thinking_level?: string },
): Conversation {
  return conversationRepo.update(id, data)
}

/** 删除对话 */
export function deleteConversation(id: string): void {
  conversationRepo.remove(id)
  logger.info(`删除对话: ${id}`)
}

/** 添加消息 */
export function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string,
  metadata?: MessageMetadata,
  toolCallId?: string,
  toolName?: string,
): Message {
  return conversationRepo.addMessage({
    conversation_id: conversationId,
    role,
    content,
    metadata: metadata ? JSON.stringify(metadata) : null,
    tool_call_id: toolCallId || null,
    tool_name: toolName || null,
  })
}

/** runChat 入参 */
export interface RunChatParams {
  /** 对话 ID */
  conversationId: string
  /** 用户输入文本 */
  content: string
  /** Provider ID；若未提供，将根据对话 model 自动查找 */
  providerId?: string
  /** 模型 ID；若未提供，使用对话保存的 model */
  model?: string
  /** 运行选项 */
  options?: AgentRunOptions
  /** 附件文件本地路径列表（会以 "[附件: filename]\n路径" 形式拼接到消息内容前） */
  attachments?: string[]
}

/**
 * 运行一次聊天
 *
 * 自动完成：
 * 1. 添加用户消息到数据库
 * 2. 构建上下文（system + 历史 + 当前用户消息）
 * 3. 运行 Agent
 * 4. 累积助手回复并写入数据库
 * 5. 更新对话的 updated_at
 *
 * 通过异步生成器向调用者（IPC 层）转发 AgentEvent
 */
export async function* runChat(params: RunChatParams): AsyncGenerator<AgentEvent> {
  const { conversationId, content, providerId, model, options, attachments } = params

  const conversation = conversationRepo.findById(conversationId)
  if (!conversation) {
    yield { type: 'error', message: `对话不存在: ${conversationId}` }
    yield { type: 'finish', reason: 'error' }
    return
  }

  // 1. 写入用户消息（如有附件，把附件信息拼到内容前）
  const finalContent = buildMessageContent(content, attachments)
  addMessage(conversationId, 'user', finalContent)
  conversationRepo.touch(conversationId)

  // 2. 解析 providerId / model
  const effectiveModel = model || conversation.model || ''
  if (!effectiveModel) {
    yield { type: 'error', message: '未指定模型，请先在对话或参数中设置 model' }
    yield { type: 'finish', reason: 'error' }
    return
  }

  let effectiveProviderId = providerId || ''
  // 查找模型的 context_length（用于按模型单独设置上下文长度）
  let modelContextLength = 0
  if (!effectiveProviderId) {
    // 通过 model 反查 provider
    const provider = providerRepo.findEnabled().find(p => {
      const models = providerRepo.findModels(p.id)
      const found = models.find(m => m.id === effectiveModel || m.name === effectiveModel)
      if (found) {
        modelContextLength = found.context_length
        return true
      }
      return false
    })
    if (!provider) {
      yield { type: 'error', message: `未找到支持模型 ${effectiveModel} 的 Provider` }
      yield { type: 'finish', reason: 'error' }
      return
    }
    effectiveProviderId = provider.id
  } else {
    // providerId 已指定，直接从该 provider 查找模型
    const models = providerRepo.findModels(effectiveProviderId)
    const found = models.find(m => m.id === effectiveModel || m.name === effectiveModel)
    if (found) {
      modelContextLength = found.context_length
    }
  }

  // 2.5 自动压缩检查：若使用率超过阈值且开启自动压缩，先执行压缩
  const ctxSettings = getContextSettings()
  // 按模型 context_length 优先：模型有独立设置时用它，否则用全局设置
  const effectiveMaxContext = modelContextLength > 0 ? modelContextLength : ctxSettings.maxContextLength
  if (ctxSettings.autoCompress) {
    const usageBefore = getContextUsage(conversationId)
    if (
      usageBefore &&
      usageBefore.usagePercent >= ctxSettings.compressThreshold &&
      usageBefore.totalTokens > 2000 // 太少不压缩
    ) {
      logger.info(
        `自动压缩触发 [conv=${conversationId}]: usage=${usageBefore.usagePercent}% threshold=${ctxSettings.compressThreshold}%`,
      )
      yield { type: 'content', content: '\n\n_正在自动压缩历史对话以释放上下文空间..._\n' }
      try {
        const compressResult = await compressConversation(conversationId, {
          keepRecent: ctxSettings.compressKeepRecent,
          providerId: effectiveProviderId,
          model: effectiveModel,
        })
        if (compressResult.compressed) {
          yield { type: 'content', content: `_压缩完成，已保留最近 ${ctxSettings.compressKeepRecent} 条消息。_\n\n` }
        }
      } catch (err) {
        logger.warn(`自动压缩失败 [conv=${conversationId}]: ${(err as Error).message}`)
        yield { type: 'content', content: `_自动压缩失败，将使用裁剪策略。_\n\n` }
      }
    }
  }

  // 3. 构建上下文（按 maxContextLength 裁剪，避免超出模型上下文窗口）
  //    根据 mode 调整系统提示，引导模型按对应模式工作
  const mode = options?.mode ?? 'chat'
  const systemPrompt = buildSystemPromptForMode(mode, options?.systemPrompt)
  const messages = buildContext(conversationId, {
    includeSystem: true,
    systemPrompt,
    maxContextTokens: effectiveMaxContext,
  })

  // 4. 解析 workspacePath
  let workspacePath = ''
  let projectId: string | null = conversation.project_id
  if (conversation.project_id) {
    const project = projectRepo.findById(conversation.project_id)
    if (project) {
      workspacePath = project.workspace_path
    }
  }

  // 4.1 读取白名单外部目录（允许工具访问工作区外的目录）
  const allowedDirectories = (() => {
    try {
      return getAllowedDirectories()
    } catch (err) {
      logger.warn(`读取白名单目录失败: ${(err as Error).message}`)
      return []
    }
  })()

  // 5. 工具定义
  //    plan/chat 模式下禁止修改性工具（write_file/edit/run_command/terminal_read），
  //    仅 build 模式提供完整工具集
  const allTools: ToolDefinition[] = getToolDefinitions()
  /** 禁止的工具（修改性工具）—— plan 和 chat 模式均禁用 */
  const blockedTools = new Set(['write_file', 'edit', 'run_command', 'terminal_read'])
  const filteredTools =
    mode === 'build'
      ? allTools
      : allTools.filter((t) => !blockedTools.has(t.function.name))
  const toolDefs = filteredTools.length > 0 ? filteredTools : undefined

  // 6. 运行 Agent
  let assistantContent = ''
  let thinkingContent = ''
  const toolCallArgsMap = new Map<string, { name: string; args: string }>()
  let lastUsage: import('../agent/types').AgentUsage | undefined
  // 跟踪是否已经持久化了中间 assistant 消息（带 tool_calls 的那一轮）
  let intermediateAssistantSaved = false
  // 跟踪最终 assistant 消息是否已保存（避免 finally 块重复保存）
  let finalAssistantSaved = false

  try {
    for await (const event of agentEngine.runConversation({
      conversationId,
      providerId: effectiveProviderId,
      model: effectiveModel,
      messages,
      tools: toolDefs,
      context: {
        workspacePath,
        projectId,
        autoAccept: options?.autoAccept ?? false,
        allowedDirectories,
      },
      thinkingLevel: options?.thinkingLevel,
      maxIterations: options?.maxIterations,
      temperature: options?.temperature,
      onToolCall: options?.onToolCall,
      onQuestion: options?.onQuestion,
      spawnSubAgent: options?.spawnSubAgent,
      ...(options?.signal ? { signal: options.signal } : {}),
    })) {
      // 累积 assistant 内容
      if (event.type === 'content') {
        assistantContent += event.content
      }
      // 累积思考过程（当 content 为空时作为 fallback）
      if (event.type === 'thinking') {
        thinkingContent += event.content
      }
      // 收到本批所有工具调用：持久化中间 assistant 消息（含完整 tool_calls）
      // 每一批工具调用都保存一条独立的 assistant 消息，保留所有 preamble 和说明文本
      if (event.type === 'tool_calls_batch') {
        for (const tc of event.tool_calls) {
          toolCallArgsMap.set(tc.id, { name: tc.name, args: tc.args })
        }
        const intermediateToolCalls: ToolCall[] = event.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.args },
        }))
        const meta: MessageMetadata = {
          model: effectiveModel,
          tool_calls: intermediateToolCalls,
        }
        // 每次都保存：preamble 文本（assistantContent）+ tool_calls
        addMessage(conversationId, 'assistant', assistantContent, meta)
        intermediateAssistantSaved = true
        // 重置内容缓冲：后续 content 是工具执行后的下一轮回复
        assistantContent = ''
      }
      // 记录工具调用（用于审批等场景）
      if (event.type === 'tool_call_start') {
        if (!toolCallArgsMap.has(event.tool_call_id)) {
          toolCallArgsMap.set(event.tool_call_id, {
            name: event.name,
            args: event.args,
          })
        }
      }
      // 工具执行完成：持久化 tool 角色消息（含结果元数据，如 diff）
      if (event.type === 'tool_call_end') {
        const info = toolCallArgsMap.get(event.tool_call_id)
        // 把工具结果元数据存入消息 metadata，供前端还原 DiffView 等
        const toolMeta: MessageMetadata | undefined = event.result.metadata
          ? {
              result_metadata: event.result.metadata,
              is_error: event.result.is_error,
            }
          : undefined
        addMessage(
          conversationId,
          'tool',
          event.result.content,
          toolMeta,
          event.tool_call_id,
          info?.name || 'tool',
        )
      }
      if (event.type === 'finish') {
        lastUsage = event.usage
        // 关键：在 yield finish 之前先持久化最终 assistant 消息，
        // 否则前端收到 chat:complete 后立即 loadMessages 会查不到 AI 回复，
        // 导致 AI 消息"闪一下消失"。
        persistFinalAssistantMessage(
          conversationId,
          effectiveModel,
          assistantContent,
          thinkingContent,
          intermediateAssistantSaved,
          toolCallArgsMap,
          lastUsage,
        )
        finalAssistantSaved = true
      }
      yield event
    }
  } catch (err) {
    const message = (err as Error).message || String(err)
    logger.error(`runChat 异常 [conv=${conversationId}]: ${message}`, err as Error)
    yield { type: 'error', message }
  } finally {
    // 安全网：若因异常导致 finish 事件未触发（最终消息未保存），在此补保存
    if (!finalAssistantSaved && (assistantContent || thinkingContent || (!intermediateAssistantSaved && toolCallArgsMap.size > 0))) {
      persistFinalAssistantMessage(
        conversationId,
        effectiveModel,
        assistantContent,
        thinkingContent,
        intermediateAssistantSaved,
        toolCallArgsMap,
        lastUsage,
      )
    }
    // 更新对话时间戳
    conversationRepo.touch(conversationId)
  }
}

/**
 * 持久化最终 assistant 消息（含去重保护）
 * - 若已有中间 assistant（带 tool_calls），只保存工具执行后的最终回复
 * - 若无中间消息，一次性保存完整 assistant 消息（可能含 tool_calls）
 */
function persistFinalAssistantMessage(
  conversationId: string,
  model: string,
  assistantContent: string,
  thinkingContent: string,
  intermediateAssistantSaved: boolean,
  toolCallArgsMap: Map<string, { name: string; args: string }>,
  lastUsage: import('../agent/types').AgentUsage | undefined,
): void {
  // 记录 Token 用量到统计表（用于九宫格热力图面板）
  if (lastUsage?.total_tokens) {
    try {
      recordUsage({
        conversationId,
        model,
        promptTokens: lastUsage.prompt_tokens ?? 0,
        completionTokens: lastUsage.completion_tokens ?? 0,
        totalTokens: lastUsage.total_tokens,
        timestamp: Date.now(),
      })
    } catch {
      // 统计记录失败不影响对话流程
    }
  }

  if (intermediateAssistantSaved) {
    if (assistantContent) {
      const meta: MessageMetadata = {
        model,
        ...(lastUsage?.total_tokens ? { tokens: lastUsage.total_tokens } : {}),
      }
      addMessage(conversationId, 'assistant', assistantContent, meta)
    }
  } else {
    const allToolCalls: ToolCall[] = []
    toolCallArgsMap.forEach((info, id) => {
      allToolCalls.push({
        id,
        type: 'function',
        function: { name: info.name, arguments: info.args },
      })
    })
    // 即使内容为空且无工具调用，也必须落库一条 assistant 消息。
    // 否则前端 onComplete → loadMessages 会用 DB（无 assistant 消息）覆盖 store，
    // 导致正在显示的 streamingContent 被清空 → "回复框闪退"。
    // 空回复时优先使用思考过程作为 fallback，其次使用占位文本提示用户
    const finalContent =
      assistantContent || thinkingContent || (allToolCalls.length === 0 ? `(模型 [${model}] 未返回内容。请检查模型名、API Key、base_url 是否正确，或重试。)` : '')
    if (finalContent || allToolCalls.length > 0) {
      const meta: MessageMetadata = {
        model,
        ...(lastUsage?.total_tokens ? { tokens: lastUsage.total_tokens } : {}),
        ...(allToolCalls.length > 0 ? { tool_calls: allToolCalls } : {}),
      }
      addMessage(conversationId, 'assistant', finalContent, meta)
    }
  }
}

/**
 * 压缩对话历史
 * - 取出全部消息
 * - 调用 Provider 生成摘要
 * - 删除旧消息（保留最近 N 条 + 系统消息）
 * - 插入摘要消息
 */
export async function compressConversation(
  conversationId: string,
  options: { keepRecent?: number; providerId?: string; model?: string } = {},
): Promise<{ compressed: boolean; summary?: string; reason?: string }> {
  const { keepRecent = 6, providerId, model } = options
  const conversation = conversationRepo.findById(conversationId)
  if (!conversation) {
    return { compressed: false, reason: '对话不存在' }
  }

  const allMessages = conversationRepo.findMessages(conversationId)
  if (allMessages.length <= keepRecent + 1) {
    return { compressed: false, reason: '消息数量过少，无需压缩' }
  }

  // 解析 provider / model
  const effectiveModel = model || conversation.model || ''
  if (!effectiveModel) {
    return { compressed: false, reason: '未指定模型，无法生成摘要' }
  }

  let effectiveProviderId = providerId || ''
  if (!effectiveProviderId) {
    const provider = providerRepo.findEnabled().find(p => {
      const models = providerRepo.findModels(p.id)
      return models.some(m => m.id === effectiveModel || m.name === effectiveModel)
    })
    if (!provider) {
      return { compressed: false, reason: `未找到支持模型 ${effectiveModel} 的 Provider` }
    }
    effectiveProviderId = provider.id
  }

  // 取需要被压缩的旧消息（除最近 keepRecent 条以外的）
  const toCompress = allMessages.slice(0, allMessages.length - keepRecent)
  if (toCompress.length === 0) {
    return { compressed: false, reason: '无旧消息可压缩' }
  }

  // 构造摘要请求
  const summaryMessages = [
    {
      role: 'system' as const,
      content: '你是一个对话摘要助手。请把下面的对话历史压缩为一份简洁的中文摘要，保留关键事实、决策、文件改动与未完成事项。仅输出摘要正文。',
    },
    {
      role: 'user' as const,
      content: toCompress
        .map(m => `[${m.role}] ${m.content}`)
        .join('\n\n'),
    },
  ]

  const chatParams: ChatParams = {
    model: effectiveModel,
    messages: summaryMessages,
    stream: false,
    temperature: 0.3,
    max_tokens: 1200,
  }

  let summary = ''
  try {
    for await (const chunk of chatWithProvider(effectiveProviderId, chatParams)) {
      if (chunk.content) summary += chunk.content
    }
  } catch (err) {
    logger.error(`压缩对话失败 [conv=${conversationId}]: ${(err as Error).message}`, err as Error)
    return { compressed: false, reason: (err as Error).message }
  }

  if (!summary) {
    return { compressed: false, reason: '生成的摘要为空' }
  }

  // 删除被压缩的旧消息（deleteOldMessages 按 created_at 保留最近 keepRecent 条）
  conversationRepo.deleteOldMessages(conversationId, keepRecent)

  // 插入摘要消息（作为 system 摘要）
  addMessage(conversationId, 'system', `[对话历史摘要]\n${summary}`)

  conversationRepo.touch(conversationId)
  logger.info(`对话 ${conversationId} 已压缩，摘要长度 ${summary.length}`)

  return { compressed: true, summary }
}
