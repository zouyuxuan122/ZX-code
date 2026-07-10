import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { Message } from '@shared/types/conversation'
import type { AgentMode } from '@shared/types/ipc'
import { usePetStore } from '@/stores/petStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { parseModelName } from '@/components/chat/ModelSelector'

/**
 * 九宫格对话格专用独立桌宠对话 Store。
 *
 * - 独立 conversationId（project_id: undefined，不关联编程项目）
 * - 纯 Chat 模式，不触发工具/Agent
 * - 注入角色卡（petStore.character.roleCard）到 systemPrompt
 * - 注入编程项目上下文摘要（chatStore.currentTaskName + artifacts）
 * - 回复时同步驱动 petStore：气泡、情绪、动作表情
 */
interface GridChatState {
  conversationId: string | null
  conversationTitle: string
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  error: string | null

  sendMessage: (content: string) => Promise<void>
  stopStreaming: () => Promise<void>
  clearError: () => void
  reset: () => void
}

/** 派生编程项目上下文摘要（粗粒度，控制 token） */
function getMainProjectContext(): string {
  const taskName = useChatStore.getState().currentTaskName
  const artifacts = useChatStore.getState().artifacts
  if (!taskName && artifacts.length === 0) return ''

  const parts: string[] = []
  if (taskName) parts.push(`当前正在执行：${taskName}`)
  // 取最近 3 条产物摘要
  const recent = artifacts.slice(-3)
  for (const a of recent) {
    if (a.tool === 'write_file' || a.tool === 'edit') {
      parts.push(`最近编辑：${a.filepath}（+${a.additions} -${a.deletions}）`)
    } else if (a.summary) {
      parts.push(`最近${a.tool === 'run_command' ? '执行命令' : a.tool === 'task' ? '子任务' : '操作'}：${a.summary}`)
    }
  }
  return parts.join('；')
}

/** 构建完整 systemPrompt = 角色卡 + 项目上下文 */
function buildGridSystemPrompt(): string {
  const character = usePetStore.getState().character
  const projectCtx = getMainProjectContext()

  let prompt = character.roleCard || `你是${character.name}，一个 AI 桌宠助手。`
  prompt += `\n\n# 你的性格\n${character.personality || '活泼可爱'}`
  prompt += `\n\n# 行为准则\n- 你是用户的桌面宠物，通过对话与用户互动\n- 回复要简短自然（通常 1-3 句话），像聊天一样\n- 你的回复会以气泡形式显示在桌宠旁边\n- 保持角色设定，用符合性格的语气说话`
  if (projectCtx) {
    prompt += `\n\n# 主人当前的工作状态（仅供参考，你可以偶尔提及但不要过度关注）\n${projectCtx}`
  }
  return prompt
}

export const useGridChatStore = create<GridChatState>((set, get) => {
  // ─── 模块加载时订阅 IPC 事件，按 conversationId 过滤 ───

  ipc.chat.onChunk((payload) => {
    if (payload.conversationId !== get().conversationId) return
    set((s) => ({ streamingContent: s.streamingContent + payload.content }))
    // 流式过程中实时更新气泡（逐字显示效果）
    const content = get().streamingContent
    if (content) {
      usePetStore.getState().showBubble(content)
      // 流式中保持 talking 情绪
      if (usePetStore.getState().mood !== 'talking') {
        usePetStore.getState().setMood('talking')
      }
    }
  })

  ipc.chat.onThinking((payload) => {
    if (payload.conversationId !== get().conversationId) return
    set((s) => ({ streamingThinking: s.streamingThinking + payload.content }))
  })

  ipc.chat.onMessage((message) => {
    if (message.conversationId !== get().conversationId) return
    set((s) => {
      // 只移除流式临时占位（temp-streaming），保留用户乐观消息（temp-user-）。
      // 之前过滤所有 temp- 前缀消息会导致用户消息在 AI 回复到达时丢失。
      const withoutStreamingPlaceholder = s.messages.filter((m) => m.id !== 'temp-streaming')
      return {
        messages: [...withoutStreamingPlaceholder, message],
        streamingContent: '',
        streamingThinking: '',
      }
    })
    // 追加到 petStore 并保持气泡显示最终回复
    usePetStore.getState().pushPetMessage(message.content, 'pet')
    // 触发动作表情决策（异步，不阻塞）
    import('@/services/petAnimation.service').then(({ generatePetAnimation }) => {
      const character = usePetStore.getState().character
      generatePetAnimation('', message.content, character, 'talking')
        .then(({ animation, expression }) => {
          usePetStore.getState().setPendingAnimation(animation)
          usePetStore.getState().setPendingExpression(expression)
        })
        .catch(() => {
          // fallback
          usePetStore.getState().setPendingAnimation('idle')
          usePetStore.getState().setPendingExpression('talking')
        })
    })
  })

  ipc.chat.onError((payload) => {
    if (payload.conversationId !== get().conversationId) return
    set({ isStreaming: false, error: payload.message, streamingContent: '' })
    // 出错时恢复 idle
    if (usePetStore.getState().mood === 'talking') {
      usePetStore.getState().setMood('idle')
    }
  })

  ipc.chat.onComplete((payload) => {
    if (payload.conversationId !== get().conversationId) return
    set({ isStreaming: false, streamingContent: '', streamingThinking: '' })
    // 回复完毕，2 秒后恢复情绪（若主项目无任务）
    setTimeout(() => {
      const petState = usePetStore.getState()
      if (petState.mood === 'talking' && !useChatStore.getState().currentTaskName) {
        petState.setMood('idle')
      }
    }, 2000)
  })

  return {
    conversationId: null,
    conversationTitle: '迷你对话',
    messages: [],
    isStreaming: false,
    streamingContent: '',
    streamingThinking: '',
    error: null,

    sendMessage: async (content: string) => {
      const state = get()
      if (state.isStreaming) return

      let conversationId = state.conversationId
      if (!conversationId) {
        try {
          const title = content.slice(0, 20) || '迷你对话'
          const conversation = await ipc.conversation.create({
            project_id: undefined,
            title,
          })
          conversationId = conversation.id
          set({
            conversationId,
            conversationTitle: title,
            messages: [],
            error: null,
          })
        } catch (err) {
          set({ error: (err as Error).message })
          return
        }
      }

      // 乐观追加用户消息
      const tempUserMessage: Message = {
        id: `temp-user-${Date.now()}`,
        conversation_id: conversationId,
        role: 'user',
        content,
        metadata: null,
        created_at: Date.now(),
      }

      // 同步到 petStore（user 消息不显示气泡）
      usePetStore.getState().pushPetMessage(content, 'user')

      // 切换到 talking 情绪
      usePetStore.getState().setMood('talking')

      set((s) => ({
        messages: [...s.messages, tempUserMessage],
        isStreaming: true,
        streamingContent: '',
        streamingThinking: '',
        error: null,
      }))

      // 构建带角色卡 + 项目上下文的 systemPrompt
      const systemPrompt = buildGridSystemPrompt()

      const options = {
        mode: 'chat' as AgentMode,
        autoAccept: true,
        systemPrompt,
        model: parseModelName(useUIStore.getState().selectedModel),
      }

      void ipc.chat.send(conversationId, content, options).catch((err) => {
        set({
          isStreaming: false,
          error: (err as Error).message || '发送失败',
          streamingContent: '',
        })
        if (usePetStore.getState().mood === 'talking') {
          usePetStore.getState().setMood('idle')
        }
      })
    },

    stopStreaming: async () => {
      const conversationId = get().conversationId
      if (!conversationId) return
      try {
        await ipc.chat.stop(conversationId)
      } catch {
        // 忽略
      }
      set({ isStreaming: false, streamingContent: '' })
    },

    clearError: () => set({ error: null }),

    reset: () =>
      set({
        conversationId: null,
        conversationTitle: '迷你对话',
        messages: [],
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        error: null,
      }),
  }
})
