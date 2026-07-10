import { useEffect } from 'react'
import { ipc } from '@/services/ipc'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { getRiskLevelForTool } from '../../../main/utils/permission-risk'

/**
 * 订阅 chat 相关 IPC 事件并转发到 chatStore。
 * 应在 ChatPage 顶层调用一次。
 *
 * 事件路由按 conversationId 分发：所有事件都更新对应对话的并行状态，
 * 仅当事件属于当前对话时才同步全局状态（兼容旧组件）。
 * 切换对话不会丢失原对话的流式状态。
 */
export function useChatEvents(): void {
  useEffect(() => {
    const unsubscribers: Array<() => void> = []

    // 文本内容增量 — 更新对应对话的并行状态
    unsubscribers.push(
      ipc.chat.onChunk((payload) => {
        const store = useChatStore.getState()
        const state = store.getStreamingState(payload.conversationId)
        // 竞态2修复：对话已停止流式时丢弃迟到的 chunk（旧请求残留）
        if (!state.isStreaming) return
        store.setParallelContent(payload.conversationId, state.streamingContent + payload.content)
        // 如果是当前对话，同步到全局字段（兼容旧组件）
        if (store.currentConversationId === payload.conversationId) {
          store.appendChunk(payload.content)
        }
      }),
    )

    // 思考过程增量
    unsubscribers.push(
      ipc.chat.onThinking((payload) => {
        const store = useChatStore.getState()
        const state = store.getStreamingState(payload.conversationId)
        // 竞态2修复：对话已停止流式时丢弃迟到的 thinking
        if (!state.isStreaming) return
        store.setParallelThinking(payload.conversationId, state.streamingThinking + payload.content)
        if (store.currentConversationId === payload.conversationId) {
          store.appendThinking(payload.content)
        }
      }),
    )

    // 工具调用开始
    unsubscribers.push(
      ipc.chat.onToolCallStart((payload) => {
        const store = useChatStore.getState()
        store.addParallelToolCall(payload.conversationId, {
          toolCallId: payload.tool_call_id,
          name: payload.name,
          args: payload.args,
          status: 'running',
          startedAt: Date.now(),
        })
        if (store.currentConversationId === payload.conversationId) {
          store.setToolCallStart(payload.tool_call_id, payload.name, payload.args)
        }
      }),
    )

    // 工具调用参数流式增量（实时渲染文件写入过程）
    unsubscribers.push(
      ipc.chat.onToolCallArgsDelta((payload) => {
        const store = useChatStore.getState()
        // 更新并行状态
        const state = store.getStreamingState(payload.conversationId)
        const existing = state.toolCalls[payload.tool_call_id]
        if (existing) {
          store.updateParallelToolCall(payload.conversationId, payload.tool_call_id, {
            streamingArgs: payload.args,
            name: existing.name || payload.name,
          })
        } else {
          store.addParallelToolCall(payload.conversationId, {
            toolCallId: payload.tool_call_id,
            name: payload.name,
            args: '',
            streamingArgs: payload.args,
            status: 'running',
            startedAt: Date.now(),
          })
        }
        // 同步全局状态
        if (store.currentConversationId === payload.conversationId) {
          store.updateToolCallArgs(payload.tool_call_id, payload.args)
        }
      }),
    )

    // 工具调用结束
    unsubscribers.push(
      ipc.chat.onToolCallEnd((payload) => {
        const store = useChatStore.getState()
        store.updateParallelToolCall(payload.conversationId, payload.tool_call_id, {
          result: payload.result,
          status: payload.result?.is_error ? 'error' : 'completed',
          endedAt: Date.now(),
        })
        if (store.currentConversationId === payload.conversationId) {
          store.setToolCallEnd(payload.tool_call_id, payload.result)
        }
      }),
    )

    // 工具调用需要审批
    unsubscribers.push(
      ipc.chat.onToolCallApproval((payload) => {
        const store = useChatStore.getState()
        store.addParallelApproval(payload.conversationId, {
          conversationId: payload.conversationId,
          toolCallId: payload.tool_call_id,
          name: payload.name,
          args: payload.args,
        })
        if (store.currentConversationId === payload.conversationId) {
          store.addPendingApproval({
            conversationId: payload.conversationId,
            toolCallId: payload.tool_call_id,
            name: payload.name,
            args: payload.args,
          })
          // 自动弹出权限对话框（始终允许/拒绝/仅本次允许）
          // 仅当当前没有显示其他权限请求时才弹出，避免覆盖正在处理的请求
          const uiStore = useUIStore.getState()
          if (!uiStore.pendingPermissionRequest) {
            uiStore.setPendingPermissionRequest({
              requestId: payload.tool_call_id,
              sessionId: payload.conversationId,
              toolName: payload.name,
              toolInput: payload.args,
              riskLevel: getRiskLevelForTool(payload.name),
            })
          }
        }
      }),
    )

    // AI 向用户提问
    unsubscribers.push(
      ipc.question.onAsk((payload) => {
        const store = useChatStore.getState()
        store.setParallelQuestion(payload.conversationId, {
          conversationId: payload.conversationId,
          questionId: payload.questionId,
          questions: payload.questions,
        })
        if (store.currentConversationId === payload.conversationId) {
          store.setPendingQuestion({
            conversationId: payload.conversationId,
            questionId: payload.questionId,
            questions: payload.questions,
          })
        }
      }),
    )

    // 完整 assistant 消息（聊天结束时触发）
    unsubscribers.push(
      ipc.chat.onMessage((message) => {
        const store = useChatStore.getState()
        if (store.currentConversationId === message.conversationId) {
          const { conversationId: _conversationId, ...messageData } = message
          void _conversationId
          store.onMessageComplete(messageData)
        }
      }),
    )

    // 错误事件 — 只重置出错对话的流式状态，不影响其他对话
    unsubscribers.push(
      ipc.chat.onError((error) => {
        const store = useChatStore.getState()
        // 只重置出错对话的并行流式状态
        store.setParallelStreaming(error.conversationId, false)
        store.setParallelError(error.conversationId, error.message)
        // 如果是当前对话，同步全局状态
        if (store.currentConversationId === error.conversationId) {
          store.setStreaming(false)
          store.setError(error.message)
          // 重新加载该对话的消息，确保 store 与数据库一致（仅当前对话，避免覆盖其他对话的全局状态）
          void store.loadMessages(error.conversationId)
        }
      }),
    )

    // 聊天完成事件 — 只重置对应对话的流式状态
    unsubscribers.push(
      ipc.chat.onComplete((payload) => {
        const store = useChatStore.getState()
        // 只重置完成对话的并行流式状态
        store.setParallelStreaming(payload.conversationId, false)
        // 如果是当前对话，同步全局状态并重载消息
        if (store.currentConversationId === payload.conversationId) {
          store.setStreaming(false)
          void store.loadMessages(payload.conversationId)
        }
      }),
    )

    return () => {
      unsubscribers.forEach((unsub) => {
        try {
          unsub()
        } catch {
          // 忽略取消订阅时的错误
        }
      })
    }
  }, [])
}

/**
 * 监听 provider 模型列表变更事件，自动刷新 availableModels。
 * 应在 ChatPage 顶层调用一次。
 */
export function useProviderModelsSync(): void {
  useEffect(() => {
    const unsub = ipc.provider.onModelsChanged(() => {
      void useChatStore.getState().loadAvailableModels()
    })
    return () => {
      try { unsub() } catch { /* 忽略 */ }
    }
  }, [])
}
