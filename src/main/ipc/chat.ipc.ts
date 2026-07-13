import { ipcMain, type WebContents } from 'electron'
import * as conversationService from '../services/conversation.service'
import * as conversationRepo from '../database/repositories/conversation.repo'
import * as providerRepo from '../database/repositories/provider.repo'
import { agentEngine } from '../agent/engine'
import { logger } from '../services/logger.service'
import { rememberApprovalWithPath } from '../services/permission.service'
import type { AgentEvent, AgentMode } from '../agent/types'
import type { QuestionItem, SubAgentParams, SubAgentResult } from '@shared/types/tool'

/** chat:send 的可选参数 */
interface ChatSendOptions {
  providerId?: string
  model?: string
  thinkingLevel?: 'fast' | 'standard' | 'deep'
  autoAccept?: boolean
  mode?: AgentMode
  attachments?: string[]
  /** 自定义 system prompt（角色卡） */
  systemPrompt?: string
}

/** 正在进行的聊天状态 */
interface RunningChat {
  conversationId: string
  aborted: boolean
  /** AbortController 用于中断底层 HTTP 请求（chat:stop 时调用 abort） */
  controller: AbortController
}

/** 工具审批超时时间（5 分钟） */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000

/** conversationId → 运行状态 */
const runningChats = new Map<string, RunningChat>()

/** `${conversationId}:${toolCallId}` → 审批 resolve 回调 + 工具名（用于 always 记忆） */
const pendingApprovals = new Map<
  string,
  {
    resolve: (approved: boolean) => void
    toolName: string
    targetPath?: string
    workspacePath?: string
  }
>()

/** `${conversationId}:${questionId}` → question resolve 回调 */
const pendingQuestions = new Map<string, (answers: string[][]) => void>()

/** `${conversationId}:${questionId}` → question reject 回调 */
const pendingQuestionRejects = new Map<string, (reason: string) => void>()

/** question ID 递增计数器 */
let questionIdCounter = 0

/**
 * 聊天相关 IPC handler
 * 流式聊天通过 webContents.send 将 AgentEvent 转发到渲染进程
 */
export function registerChatIpc(): void {
  // 发送消息并流式接收回复
  ipcMain.handle(
    'chat:send',
    async (event, conversationId: string, content: string, options?: ChatSendOptions) => {
      if (runningChats.has(conversationId)) {
        throw new Error('该对话已有进行中的请求')
      }

      const controller = new AbortController()
      const running: RunningChat = { conversationId, aborted: false, controller }
      runningChats.set(conversationId, running)

      const sender: WebContents = event.sender
      const autoAccept = options?.autoAccept ?? false

      // 工具审批回调：仅在 autoAccept=false 时由 Agent 调用
      const onToolCall = async (
        toolCallId: string,
        _name: string,
        _args: string,
        _targetPath?: string,
        _workspacePath?: string,
      ): Promise<boolean> => {
        return new Promise<boolean>((resolveParam) => {
          const key = `${conversationId}:${toolCallId}`
          let settled = false
          let timer: ReturnType<typeof setTimeout> | undefined

          // 包装 resolve：保证只结算一次，并清理超时定时器
          const wrappedResolve = (value: boolean): void => {
            if (settled) return
            settled = true
            if (timer) clearTimeout(timer)
            resolveParam(value)
          }

          // 超时自动拒绝，避免永久阻塞
          timer = setTimeout(() => {
            if (pendingApprovals.has(key)) {
              pendingApprovals.delete(key)
              wrappedResolve(false)
              logger.warn(`工具审批超时自动拒绝: ${key}`)
            }
          }, APPROVAL_TIMEOUT_MS)

          pendingApprovals.set(key, {
            resolve: wrappedResolve,
            toolName: _name,
            targetPath: _targetPath,
            workspacePath: _workspacePath,
          })
        })
      }

      // question 工具回调：向用户提问并等待回答
      const onQuestion = async (questions: QuestionItem[]): Promise<string[][]> => {
        const questionId = `que_${++questionIdCounter}`
        const key = `${conversationId}:${questionId}`

        // 发送提问事件到渲染进程
        sender.send('question:ask', {
          conversationId,
          questionId,
          questions,
        })

        return new Promise<string[][]>((resolveParam, reject) => {
          let settled = false
          let timer: ReturnType<typeof setTimeout> | undefined

          const wrappedResolve = (answers: string[][]): void => {
            if (settled) return
            settled = true
            if (timer) clearTimeout(timer)
            resolveParam(answers)
          }

          const wrappedReject = (reason: string): void => {
            if (settled) return
            settled = true
            if (timer) clearTimeout(timer)
            reject(new Error(reason))
          }

          // 超时自动拒绝（10 分钟）
          timer = setTimeout(() => {
            if (pendingQuestions.has(key)) {
              pendingQuestions.delete(key)
              wrappedReject('提问超时')
              logger.warn(`提问超时: ${key}`)
            }
          }, 10 * 60 * 1000)

          pendingQuestions.set(key, wrappedResolve)

          // 存储 reject 以便用户取消时调用
          pendingQuestionRejects.set(key, wrappedReject)
        })
      }

      // 跟踪是否已经通过 finish 事件发送过 chat:complete
      let completeSent = false
      try {
        for await (const agentEvent of conversationService.runChat({
          conversationId,
          content,
          providerId: options?.providerId,
          model: options?.model,
          attachments: options?.attachments,
          options: {
            thinkingLevel: options?.thinkingLevel,
            autoAccept,
            mode: options?.mode,
            systemPrompt: options?.systemPrompt,
            signal: controller.signal,
            onToolCall: autoAccept ? undefined : onToolCall,
            onQuestion,
            spawnSubAgent: async (subParams: SubAgentParams): Promise<SubAgentResult> => {
              // 子智能体使用父对话的 provider 和 model
              let subProviderId = options?.providerId || ''
              let subModel = options?.model || ''
              // 若未显式提供，从当前对话记录反查
              if (!subModel) {
                const conv = conversationRepo.findById(conversationId)
                subModel = conv?.model || ''
              }
              if (!subProviderId && subModel) {
                const provider = providerRepo.findEnabled().find(p => {
                  const models = providerRepo.findModels(p.id)
                  return models.some(m => m.id === subModel || m.name === subModel)
                })
                subProviderId = provider?.id || ''
              }
              if (!subProviderId || !subModel) {
                return {
                  content: '',
                  state: 'error',
                  toolCallCount: 0,
                  duration: 0,
                  error: '缺少 providerId 或 model，无法派发子智能体',
                }
              }
              logger.info(`派发子智能体 [parent=${conversationId}, type=${subParams.subagentType}]: ${subParams.description}`)
              // 通知前端子智能体开始
              sender.send('subagent:start', {
                conversationId,
                description: subParams.description,
                subagentType: subParams.subagentType || 'general',
              })
              const result = await agentEngine.runSubConversation({
                providerId: subProviderId,
                model: subModel,
                subAgentParams: subParams,
              })
              // 通知前端子智能体结束
              sender.send('subagent:end', {
                conversationId,
                description: subParams.description,
                state: result.state,
                duration: result.duration,
                toolCallCount: result.toolCallCount,
              })
              return result
            },
          },
        })) {
          // 被中止则停止消费
          if (running.aborted) break
          // 跟踪 finish 事件，避免 finally 块重复发送 chat:complete
          if (agentEvent.type === 'finish') {
            completeSent = true
          }
          forwardAgentEvent(sender, conversationId, agentEvent)
        }
      } catch (err) {
        const message = (err as Error).message || String(err)
        logger.error(`chat:send 异常 [conv=${conversationId}]: ${message}`, err as Error)
        // 必须发送 error 事件解除前端 streaming 状态
        sender.send('chat:error', { conversationId, message })
      } finally {
        // 竞态3修复：只删除自己的条目，不误删新请求的 runningChats 条目
        // 场景：chat:stop 已删除旧条目 → 用户发新请求创建新条目 →
        // 旧请求的 finally 执行时 runningChats.get(conversationId) 返回的是新条目，不应删除
        const currentRunning = runningChats.get(conversationId)
        if (currentRunning === running) {
          runningChats.delete(conversationId)
        }
        cleanupPendingApprovals(conversationId)
        // 发送完整的 assistant 消息（供 onMessage 回调）
        // 注意：必须在 chat:complete 之前发送，否则前端 onComplete 触发的 loadMessages
        // 会查不到刚追加的消息（虽然 runChat 已在 yield finish 前保存，但前端 onMessageComplete
        // 追加的消息可能在 loadMessages 的异步查询之后才到达，导致覆盖丢失）
        try {
          const messages = conversationRepo.findMessages(conversationId)
          const lastAssistant = [...messages]
            .reverse()
            .find((m) => m.role === 'assistant')
          if (lastAssistant) {
            sender.send('chat:message', { ...lastAssistant, conversationId })
          }
        } catch (err) {
          logger.warn(`查询最后 assistant 消息失败: ${(err as Error).message}`)
        }
        // 安全网：仅当 finish 事件未触发时才补发 chat:complete，
        // 避免重复发送导致前端多次 loadMessages
        if (!completeSent) {
          sender.send('chat:complete', { conversationId, reason: 'stop', usage: undefined })
        }
      }
    },
  )

  // 中止正在进行的聊天
  ipcMain.handle('chat:stop', (_event, conversationId: string): boolean => {
    const running = runningChats.get(conversationId)
    if (running) {
      running.aborted = true
      // 中断底层 HTTP 请求（联动 provider 的 fetchWithTimeout abort）
      running.controller.abort()
      logger.info(`中止聊天: ${conversationId}`)
      cleanupPendingApprovals(conversationId)
      cleanupPendingQuestions(conversationId)
      // 立即从 runningChats 删除，允许用户发新消息
      // 即使 for-await 循环卡住，也不会阻塞后续请求
      runningChats.delete(conversationId)
      return true
    }
    return false
  })

  // 强制重置对话状态（当 isStreaming 卡死时使用）
  ipcMain.handle('chat:forceReset', (_event, conversationId: string): boolean => {
    const running = runningChats.get(conversationId)
    if (running) {
      running.aborted = true
      running.controller.abort()
      cleanupPendingApprovals(conversationId)
      cleanupPendingQuestions(conversationId)
      runningChats.delete(conversationId)
      logger.info(`强制重置对话状态: ${conversationId}`)
      return true
    }
    // 即使没有 running chat，也返回 true（可能是已经结束但前端状态未更新）
    return true
  })

  // 压缩对话历史
  ipcMain.handle(
    'chat:compress',
    async (
      _event,
      conversationId: string,
      options?: { keepRecent?: number; providerId?: string; model?: string },
    ) => {
      try {
        const result = await conversationService.compressConversation(
          conversationId,
          options || {},
        )
        logger.info(`压缩对话 ${conversationId}: compressed=${result.compressed}`)
      } catch (err) {
        logger.error(`压缩对话失败: ${(err as Error).message}`, err as Error)
        throw err
      }
    },
  )

  // 工具调用审批响应
  ipcMain.handle(
    'chat:approveToolCall',
    async (
      _event,
      conversationId: string,
      toolCallId: string,
      approved: boolean,
      decision?: 'once' | 'always',
    ) => {
      const key = `${conversationId}:${toolCallId}`
      const entry = pendingApprovals.get(key)
      if (entry) {
        pendingApprovals.delete(key)
        // always 决策：路径感知记忆（工作区外目录加入白名单，工作区内无需操作）
        if (decision === 'always' && approved && entry.toolName) {
          try {
            rememberApprovalWithPath(
              entry.toolName,
              'always',
              entry.targetPath,
              entry.workspacePath,
            )
          } catch (err) {
            logger.error(`记住权限规则失败 [tool=${entry.toolName}]: ${(err as Error).message}`)
          }
        }
        entry.resolve(approved)
        logger.debug(`工具审批 ${key}: ${approved} (decision=${decision || 'once'})`)
      }
    },
  )

  // 用户回答 question 工具的提问
  ipcMain.handle(
    'question:reply',
    async (_event, conversationId: string, questionId: string, answers: string[][]) => {
      const key = `${conversationId}:${questionId}`
      const resolve = pendingQuestions.get(key)
      if (resolve) {
        pendingQuestions.delete(key)
        pendingQuestionRejects.delete(key)
        resolve(answers)
        logger.debug(`提问回答 ${key}: ${JSON.stringify(answers)}`)
      }
    },
  )

  // 用户取消 question 工具的提问
  ipcMain.handle(
    'question:cancel',
    async (_event, conversationId: string, questionId: string) => {
      const key = `${conversationId}:${questionId}`
      const reject = pendingQuestionRejects.get(key)
      if (reject) {
        pendingQuestions.delete(key)
        pendingQuestionRejects.delete(key)
        reject('用户取消了提问')
        logger.debug(`提问取消 ${key}`)
      }
    },
  )
}

/**
 * 将 AgentEvent 转发到渲染进程对应的通道
 */
function forwardAgentEvent(
  sender: WebContents,
  conversationId: string,
  event: AgentEvent,
): void {
  switch (event.type) {
    case 'content':
      sender.send('chat:chunk', { conversationId, content: event.content })
      break
    case 'thinking':
      sender.send('chat:thinking', { conversationId, content: event.content })
      break
    case 'tool_calls_batch':
      // 仅用于 service 层持久化，不需要转发到前端
      break
    case 'tool_call_start':
      sender.send('chat:toolCallStart', {
        conversationId,
        tool_call_id: event.tool_call_id,
        name: event.name,
        args: event.args,
      })
      break
    case 'tool_call_args_delta':
      sender.send('chat:toolCallArgsDelta', {
        conversationId,
        tool_call_id: event.tool_call_id,
        name: event.name,
        args: event.args,
      })
      break
    case 'tool_call_end':
      sender.send('chat:toolCallEnd', {
        conversationId,
        tool_call_id: event.tool_call_id,
        result: event.result,
      })
      break
    case 'tool_call_approval':
      sender.send('chat:toolCallApproval', {
        conversationId,
        tool_call_id: event.tool_call_id,
        name: event.name,
        args: event.args,
      })
      break
    case 'finish':
      sender.send('chat:complete', {
        conversationId,
        reason: event.reason,
        usage: event.usage,
      })
      break
    case 'error':
      sender.send('chat:error', { conversationId, message: event.message })
      break
  }
}

/**
 * 清理某个对话的全部待审批项（拒绝并移除）
 */
function cleanupPendingApprovals(conversationId: string): void {
  const prefix = `${conversationId}:`
  pendingApprovals.forEach((entry, key) => {
    if (key.startsWith(prefix)) {
      pendingApprovals.delete(key)
      entry.resolve(false)
    }
  })
}

/** 清理指定对话的所有待回答 question（reject 使 onQuestion Promise 立即结算） */
function cleanupPendingQuestions(conversationId: string): void {
  const prefix = `${conversationId}:`
  pendingQuestionRejects.forEach((reject, key) => {
    if (key.startsWith(prefix)) {
      pendingQuestionRejects.delete(key)
      pendingQuestions.delete(key)
      reject('用户已中止对话')
    }
  })
}
