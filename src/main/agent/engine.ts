import { chatWithProvider } from '../providers'
import { toolRegistry } from '../tools/registry'
import { logger } from '../services/logger.service'
import { checkPermissionWithPath, getAllowedDirectories } from '../services/permission.service'
import type { ChatParams, ChatChunk } from '@shared/types/model'
import type { ChatMessage, ToolCall } from '@shared/types/conversation'
import type { ToolExecutionResult, ToolContext, SubAgentParams, SubAgentResult, ToolDefinition } from '@shared/types/tool'
import type { AgentEvent, AgentRunParams, AgentUsage } from './types'

/**
 * Agent 引擎
 *
 * 负责：
 * 1. 编排与 Provider 的多轮对话
 * 2. 处理流式响应（content + tool_calls）
 * 3. 工具调用循环（含审批）
 * 4. 把工具结果作为 'tool' 角色消息回填到上下文
 *
 * 通过 runConversation 异步生成器向外推送 AgentEvent
 */
export class AgentEngine {
  /**
   * 运行一次完整的对话
   */
  async *runConversation(params: AgentRunParams): AsyncGenerator<AgentEvent> {
    const {
      conversationId,
      providerId,
      model,
      messages,
      tools,
      context,
      thinkingLevel,
      maxIterations = 20,
      temperature,
      onToolCall,
      onQuestion,
      spawnSubAgent,
      signal,
    } = params

    // 工作副本，循环中会持续追加
    const workingMessages: ChatMessage[] = messages.map(m => ({ ...m }))
    let lastUsage: AgentUsage | undefined
    let lastFinishReason: 'stop' | 'length' | 'tool_calls' | null = null

    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        // 外层循环顶部检查 abort：工具执行后 signal 可能已被 abort
        if (signal?.aborted) {
          logger.info(`Agent 因 signal abort 停止 [conv=${conversationId}, iter=${iteration}]`)
          yield { type: 'finish', reason: 'stop', usage: lastUsage }
          return
        }
        const chatParams: ChatParams = {
          model,
          messages: workingMessages.map(m => ({
            role: m.role,
            // 带 tool_calls 的 assistant 消息 content 为空时设为 null（OpenAI 规范）
            // DeepSeek 等严格 API 对 content="" 会返回空响应或 400
            content: (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0 && !m.content)
              ? null
              : m.content,
            ...(m.tool_calls ? { tool_calls: m.tool_calls as unknown[] } : {}),
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            // DeepSeek 等 OpenAI 兼容 API 要求 tool 角色消息必须带 name 字段
            ...(m.name ? { name: m.name } : {}),
          })),
          stream: true,
          ...(signal ? { signal } : {}),
          ...(tools && tools.length > 0 ? { tools } : {}),
          ...(thinkingLevel ? { thinking_level: thinkingLevel } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
        }

        // 诊断日志：记录每轮发送给 Provider 的消息概要
        const msgDebug = chatParams.messages.map((m, i) => {
          const c = m.content === null ? 'null' : m.content === '' ? '""' : `[${m.content.length}c]`
          const tc = (m.tool_calls as unknown[] | undefined)?.length ?? 0
          const tid = m.tool_call_id ? `tid=${m.tool_call_id.slice(0, 8)}` : ''
          const nm = (m as { name?: string }).name ? `name=${(m as { name?: string }).name}` : ''
          return `[${i}]${m.role}:${c}${tc > 0 ? `+${tc}tc` : ''}${tid ? ' ' + tid : ''}${nm ? ' ' + nm : ''}`
        }).join(' ')
        logger.info(`[Engine] iter=${iteration} model=${model} msgs=${chatParams.messages.length} ${msgDebug}`)

        // 累积本轮响应
        let contentBuffer = ''
        // 使用 index 作为 key 累积流式 tool_calls（OpenAI 兼容 API 的续片只有 index，没有 id/name）
        const toolCallByIndex = new Map<number, { id: string; name: string; args: string }>()
        let chunkFinishReason: 'stop' | 'length' | 'tool_calls' | null = null
        let chunkUsage: AgentUsage | undefined

        try {
          for await (const chunk of chatWithProvider(providerId, chatParams) as AsyncGenerator<ChatChunk>) {
            // 内层循环检查 abort：流式消费中 signal 可能已被 abort
            if (signal?.aborted) break
            if (chunk.content) {
              contentBuffer += chunk.content
              yield { type: 'content', content: chunk.content }
            }
            if (chunk.reasoning_content) {
              yield { type: 'thinking', content: chunk.reasoning_content }
            }
            if (chunk.tool_calls && chunk.tool_calls.length > 0) {
              for (const tc of chunk.tool_calls) {
                // 流式可能分多片返回同一 tool_call 的 arguments，用 index 累积
                const idx = tc.index ?? 0
                const existing = toolCallByIndex.get(idx)
                if (existing) {
                  // 续片：只追加 arguments
                  if (tc.function.arguments) {
                    existing.args += tc.function.arguments
                    // 透传 args 增量到前端，用于实时渲染文件写入过程
                    yield {
                      type: 'tool_call_args_delta',
                      tool_call_id: existing.id,
                      name: existing.name,
                      args: existing.args,
                    }
                  }
                } else {
                  // 首片：带 id 和 name
                  const id = tc.id || `call_${idx}_${Date.now()}`
                  const name = tc.function.name || ''
                  const args = tc.function.arguments || ''
                  toolCallByIndex.set(idx, { id, name, args })
                  // 首片也透传（如果有 name）
                  if (name) {
                    yield {
                      type: 'tool_call_args_delta',
                      tool_call_id: id,
                      name,
                      args,
                    }
                  }
                }
              }
            }
            if (chunk.finish_reason) {
              chunkFinishReason = chunk.finish_reason
            }
            if (chunk.usage) {
              chunkUsage = {
                prompt_tokens: chunk.usage.prompt_tokens,
                completion_tokens: chunk.usage.completion_tokens,
                total_tokens: chunk.usage.total_tokens,
              }
            }
          }
        } catch (err) {
          const message = (err as Error).message || String(err)
          logger.error(`Agent 对话失败 [conv=${conversationId}]: ${message}`, err as Error)
          yield { type: 'error', message }
          yield { type: 'finish', reason: 'error', usage: lastUsage }
          return
        }

        lastUsage = chunkUsage || lastUsage
        lastFinishReason = chunkFinishReason

        const toolCalls = Array.from(toolCallByIndex.values())

        // 把本轮 assistant 消息追加到上下文（含 tool_calls）
        // 重要：带 tool_calls 的 assistant 消息，content 为空时必须设为 null（OpenAI 规范）
        // DeepSeek 等严格 API 对 content="" 的 assistant 消息会返回空响应或 400
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: (toolCalls.length > 0 && !contentBuffer) ? null : contentBuffer,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.args },
          })) } : {}),
        }
        workingMessages.push(assistantMessage)

        if (toolCalls.length === 0) {
          // 没有工具调用：本轮即结束
          const reason: 'stop' | 'length' =
            chunkFinishReason === 'length' ? 'length' : 'stop'
          yield { type: 'finish', reason, usage: lastUsage }
          return
        }

        // 通知本批所有工具调用（供 service 层持久化中间 assistant 消息）
        yield {
          type: 'tool_calls_batch',
          tool_calls: toolCalls.map(tc => ({ id: tc.id, name: tc.name, args: tc.args })),
        }

        // 处理工具调用
        const shouldContinue = yield* this.handleToolCalls(
          toolCalls,
          context,
          conversationId,
          onToolCall,
          onQuestion,
          spawnSubAgent,
          workingMessages,
        )

        if (!shouldContinue) {
          // 工具被拒绝或失败导致无法继续，直接结束
          yield { type: 'finish', reason: 'stop', usage: lastUsage }
          return
        }

        // 继续下一轮（让模型基于工具结果继续生成）
      }

      // 达到最大迭代次数
      logger.warn(`Agent 达到最大迭代次数 ${maxIterations} [conv=${conversationId}]`)
      yield { type: 'finish', reason: 'max_iterations', usage: lastUsage }
    } catch (err) {
      const message = (err as Error).message || String(err)
      logger.error(`Agent 运行异常 [conv=${conversationId}]: ${message}`, err as Error)
      yield { type: 'error', message }
      yield { type: 'finish', reason: 'error', usage: lastUsage }
    }
  }

  /**
   * 处理一批工具调用
   *
   * 权限判定逻辑：
   * 1. autoAccept=true 时，跳过所有审批（批量自动模式）
   * 2. autoAccept=false 时，查询权限规则：
   *    - allow: 直接执行
   *    - ask:   发起审批事件，等待用户确认
   *    - deny:  直接拒绝
   *
   * @returns 是否应继续下一轮（true=继续；false=终止）
   */
  private async *handleToolCalls(
    toolCalls: Array<{ id: string; name: string; args: string }>,
    context: AgentRunParams['context'],
    conversationId: string,
    onToolCall: AgentRunParams['onToolCall'],
    onQuestion: AgentRunParams['onQuestion'],
    spawnSubAgent: AgentRunParams['spawnSubAgent'],
    workingMessages: ChatMessage[],
  ): AsyncGenerator<AgentEvent, boolean> {
    for (const call of toolCalls) {
      // 1. 权限检查（autoAccept=true 时跳过所有审批）
      if (context && !context.autoAccept) {
        // 从工具参数中提取目标路径（文件类工具的 path 字段）
        let targetPath: string | undefined
        try {
          const parsed = JSON.parse(call.args)
          if (typeof parsed?.path === 'string') {
            targetPath = parsed.path
          } else if (typeof parsed?.file_path === 'string') {
            targetPath = parsed.file_path
          }
        } catch {
          // 非 JSON 参数或解析失败，忽略
        }
        const workspacePath = context.workspacePath
        const permission = checkPermissionWithPath(call.name, targetPath, workspacePath)
        if (permission === 'deny') {
          // 直接拒绝
          const denyResult: ToolExecutionResult = {
            tool_call_id: call.id,
            content: `工具 ${call.name} 已被权限规则禁止执行`,
            is_error: true,
          }
          workingMessages.push({
            role: 'tool',
            content: denyResult.content,
            tool_call_id: call.id,
            name: call.name,
          })
          yield { type: 'tool_call_end', tool_call_id: call.id, result: denyResult }
          continue
        }
        if (permission === 'ask' && onToolCall) {
          // 需要审批
          yield {
            type: 'tool_call_approval',
            tool_call_id: call.id,
            name: call.name,
            args: call.args,
          }
          let approved: boolean
          try {
            approved = await onToolCall(call.id, call.name, call.args, targetPath, workspacePath)
          } catch (err) {
            logger.error(`工具审批回调异常 [conv=${conversationId}, tool=${call.name}]: ${(err as Error).message}`, err as Error)
            approved = false
          }
          if (!approved) {
            // 拒绝：回填一条工具结果消息，标记为错误
            const rejectResult: ToolExecutionResult = {
              tool_call_id: call.id,
              content: '用户已拒绝执行该工具调用',
              is_error: true,
            }
            workingMessages.push({
              role: 'tool',
              content: rejectResult.content,
              tool_call_id: call.id,
              name: call.name,
            })
            yield { type: 'tool_call_end', tool_call_id: call.id, result: rejectResult }
            continue
          }
        }
        // permission === 'allow'：直接执行
      }

      // 2. 执行工具
      yield {
        type: 'tool_call_start',
        tool_call_id: call.id,
        name: call.name,
        args: call.args,
      }

      const tool = toolRegistry.getTool(call.name)
      if (!tool) {
        const result: ToolExecutionResult = {
          tool_call_id: call.id,
          content: `未找到工具: ${call.name}`,
          is_error: true,
        }
        workingMessages.push({
          role: 'tool',
          content: result.content,
          tool_call_id: call.id,
          name: call.name,
        })
        yield { type: 'tool_call_end', tool_call_id: call.id, result }
        continue
      }

      // 解析参数
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = call.args ? JSON.parse(call.args) : {}
      } catch (err) {
        logger.warn(`工具 ${call.name} 参数解析失败 [conv=${conversationId}]: ${(err as Error).message}`)
      }

      // 构造 ToolContext
      const toolContext: ToolContext = {
        workspacePath: context?.workspacePath || '',
        projectId: context?.projectId ?? null,
        conversationId,
        autoAccept: context?.autoAccept ?? false,
        allowedDirectories: context?.allowedDirectories,
        onQuestion,
        spawnSubAgent,
      }

      let result: ToolExecutionResult
      try {
        result = await tool.execute(parsedArgs, toolContext)
        // 确保回传结果带正确的 tool_call_id
        result = { ...result, tool_call_id: call.id }
      } catch (err) {
        result = {
          tool_call_id: call.id,
          content: `工具执行异常: ${(err as Error).message}`,
          is_error: true,
        }
        logger.error(`工具 ${call.name} 执行异常 [conv=${conversationId}]: ${(err as Error).message}`, err as Error)
      }

      // 回填 'tool' 角色消息
      workingMessages.push({
        role: 'tool',
        content: result.content,
        tool_call_id: call.id,
        name: call.name,
      })

      yield { type: 'tool_call_end', tool_call_id: call.id, result }
    }

    // 即便有工具被拒绝，也允许模型继续生成（它会看到拒绝结果）
    // 但若所有工具都被拒绝且没有可继续的，模型仍可能选择停止
    return true
  }

  /**
   * 运行子智能体会话（独立上下文，受限工具集）
   *
   * 子智能体特点：
   * - 独立的 messages 上下文，不影响主对话
   * - 仅使用只读工具（read_file, list_files, search_files, grep）
   * - 自动接受（不需要审批）
   * - 运行到模型不再调用工具为止
   * - 收集最终回复作为结果返回
   */
  async runSubConversation(params: {
    providerId: string
    model: string
    subAgentParams: SubAgentParams
  }): Promise<SubAgentResult> {
    const { providerId, model, subAgentParams } = params
    const startTime = Date.now()

    // 子智能体系统提示
    const systemPrompt = this.buildSubAgentSystemPrompt(subAgentParams.subagentType || 'general')

    // 构建子会话消息上下文
    const subMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: subAgentParams.prompt },
    ]

    // 子智能体仅使用只读工具
    const subAgentToolNames = ['read_file', 'list_files', 'search_files', 'grep']
    const subTools: ToolDefinition[] = []
    for (const name of subAgentToolNames) {
      const tool = toolRegistry.getTool(name)
      if (tool) {
        subTools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: {
              type: 'object',
              properties: tool.parameters,
              required: tool.required || [],
            },
          },
        })
      }
    }

    let contentBuffer = ''
    let toolCallCount = 0
    const maxIterations = 10 // 子智能体迭代上限

    try {
      for (let iter = 0; iter < maxIterations; iter++) {
        const chatParams: ChatParams = {
          model,
          messages: subMessages.map(m => ({
            role: m.role,
            content: m.content,
            ...(m.tool_calls ? { tool_calls: m.tool_calls as unknown[] } : {}),
            ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
          })),
          stream: true,
          tools: subTools.length > 0 ? subTools : undefined,
          temperature: 0.3,
        }

        let iterContent = ''
        // 使用 index 作为 key 累积流式 tool_calls
        const toolCallByIndex = new Map<number, { id: string; name: string; args: string }>()
        let finishReason: 'stop' | 'length' | 'tool_calls' | null = null

        for await (const chunk of chatWithProvider(providerId, chatParams) as AsyncGenerator<ChatChunk>) {
          if (chunk.content) {
            iterContent += chunk.content
            contentBuffer += chunk.content
          }
          if (chunk.tool_calls && chunk.tool_calls.length > 0) {
            for (const tc of chunk.tool_calls) {
              const idx = tc.index ?? 0
              const existing = toolCallByIndex.get(idx)
              if (existing) {
                if (tc.function.arguments) existing.args += tc.function.arguments
              } else {
                toolCallByIndex.set(idx, {
                  id: tc.id || `call_${idx}_${Date.now()}`,
                  name: tc.function.name || '',
                  args: tc.function.arguments || '',
                })
              }
            }
          }
          if (chunk.finish_reason) {
            finishReason = chunk.finish_reason
          }
        }

        const toolCalls = Array.from(toolCallByIndex.values())

        // 追加 assistant 消息
        subMessages.push({
          role: 'assistant',
          content: iterContent,
          ...(toolCalls.length > 0 ? {
            tool_calls: toolCalls.map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.args },
            })),
          } : {}),
        })

        // 没有工具调用：子会话结束
        if (toolCalls.length === 0 || finishReason === 'stop') {
          break
        }

        // 执行工具调用（子智能体自动接受，不需要审批）
        for (const call of toolCalls) {
          toolCallCount++
          const tool = toolRegistry.getTool(call.name)
          if (!tool) {
            subMessages.push({
              role: 'tool',
              content: `未找到工具: ${call.name}`,
              tool_call_id: call.id,
              name: call.name,
            })
            continue
          }

          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = call.args ? JSON.parse(call.args) : {}
          } catch {
            // 参数解析失败，使用空对象
          }

          const toolContext: ToolContext = {
            workspacePath: subAgentParams.workspacePath,
            projectId: subAgentParams.projectId,
            conversationId: `subagent:${subAgentParams.parentConversationId}`,
            autoAccept: true, // 子智能体自动接受
            allowedDirectories: getAllowedDirectories(),
          }

          // 权限检查：子智能体不能访问工作区和白名单外的路径
          // 如果用户之前通过"始终允许"批准了某个目录，则该目录也在白名单中，子智能体可以访问
          const subTargetPath = (parsedArgs.path as string) || (parsedArgs.file_path as string) || (parsedArgs.cwd as string) || undefined
          if (subTargetPath && subAgentParams.workspacePath) {
            const subPermission = checkPermissionWithPath(call.name, subTargetPath, subAgentParams.workspacePath)
            if (subPermission !== 'allow') {
              result = {
                tool_call_id: call.id,
                content: `权限被拒绝：子智能体不能访问工作区外的路径 ${subTargetPath}（仅允许工作区和已批准的白名单目录）`,
                is_error: true,
              }
              subMessages.push({
                role: 'tool',
                content: result.content,
                tool_call_id: call.id,
                name: call.name,
              })
              continue
            }
          }

          let result: ToolExecutionResult
          try {
            result = await tool.execute(parsedArgs, toolContext)
          } catch (err) {
            result = {
              tool_call_id: call.id,
              content: `工具执行异常: ${(err as Error).message}`,
              is_error: true,
            }
          }

          subMessages.push({
            role: 'tool',
            content: result.content,
            tool_call_id: call.id,
            name: call.name,
          })
        }
      }

      return {
        content: contentBuffer || '（子智能体未产生输出）',
        state: 'completed',
        toolCallCount,
        duration: Date.now() - startTime,
      }
    } catch (err) {
      const message = (err as Error).message || String(err)
      logger.error(`子智能体执行异常 [parent=${subAgentParams.parentConversationId}]: ${message}`, err as Error)
      return {
        content: contentBuffer,
        state: 'error',
        toolCallCount,
        duration: Date.now() - startTime,
        error: message,
      }
    }
  }

  /** 构建子智能体系统提示（参考 Codex 子代理规范） */
  private buildSubAgentSystemPrompt(subagentType: string): string {
    const base = `你是一个子智能体，负责执行主智能体派发的独立子任务。你需要精确、专注地完成分配的任务。

# 自主性与持久性
持续工作直到任务完全解决。不要只做分析就停下来——要端到端地完成任务。
遇到障碍时先尝试自行诊断和解决：读取错误信息、检查假设、尝试聚焦修复，再考虑切换策略。
自主地将查询解决到最佳能力，使用可用工具，再回到主智能体。不要猜测或编造答案。

# 工具使用纪律
你只能使用只读工具（read_file, list_files, search_files, grep），不能修改任何文件。
工具参数以 JSON 字符串形式提供。拿到工具结果后，基于结果继续推理而非臆测。
可以在一条消息中并行调用多个无依赖的工具以提高效率。

# 规划
对于非平凡任务，使用 todo_write 工具规划步骤并跟踪进度。
同一时间只有一个任务处于 in_progress 状态。完成一个任务后立即标记为 completed。
不要从 pending 直接跳到 completed——必须先设为 in_progress。

# 上下文独立性
你的上下文是独立的，不会影响主对话。不要重复主智能体已提供的信息，专注于完成具体任务。

# 输出格式
完成任务后，输出一份简洁的结果报告：
- 任务目标（一句话）
- 关键发现/结果（条目化，突出重要信息）
- 建议（如有，简洁列出）
保持简洁，不要重述全部代码内容。`

    const typeSpecific: Record<string, string> = {
      general: '\n\n# 类型：通用\n你是通用子智能体，可以处理各种只读研究和分析任务。灵活运用工具完成任务。',
      research: '\n\n# 类型：研究\n你是研究型子智能体，专注于代码库研究、架构分析、依赖关系梳理。请深入阅读代码并给出详细分析。使用 search_files 和 grep 广泛搜索，用 read_file 深入理解关键文件。',
      coder: '\n\n# 类型：编码助手\n你是编码助手型子智能体，专注于阅读现有代码、理解实现逻辑、提供代码建议。你不能直接修改文件，但可以给出详细的修改建议，包括具体的代码片段和替换位置。',
    }

    return base + (typeSpecific[subagentType] || typeSpecific.general)
  }
}

/** Agent 引擎单例 */
export const agentEngine = new AgentEngine()
