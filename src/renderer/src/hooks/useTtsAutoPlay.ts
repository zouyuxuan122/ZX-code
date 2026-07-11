import { useRef, useEffect } from 'react'
import type { Message } from '@shared/types/conversation'
import type { TtsMode } from '@shared/types/tts'
import { useTtsStore } from '@/stores/ttsStore'

interface UseTtsAutoPlayParams {
  /** 当前是否正在流式输出 */
  isStreaming: boolean
  /** 消息列表 */
  messages: Message[]
  /** TTS 是否启用 */
  ttsEnabled: boolean
  /** TTS 模式（auto=自动朗读, manual=手动） */
  ttsMode: TtsMode
}

/**
 * TTS 自动朗读 Hook
 *
 * 当流式输出从 true → false（AI 回复完成），且 TTS 已启用且模式为 auto 时，
 * 自动朗读最后一条 AI 助手消息。
 *
 * 被主页面 ChatPage 和九宫格 ChatPanel 共用。
 */
export function useTtsAutoPlay({
  isStreaming,
  messages,
  ttsEnabled,
  ttsMode,
}: UseTtsAutoPlayParams): void {
  const prevStreamingRef = useRef(isStreaming)

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current
    prevStreamingRef.current = isStreaming

    // 只在 true → false 转换时触发
    if (!wasStreaming || isStreaming) return

    // TTS 未启用或模式非 auto 时不触发
    if (!ttsEnabled || ttsMode !== 'auto') return

    // 找到最后一条 AI 助手消息
    let lastAssistant: Message | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content.trim()) {
        lastAssistant = messages[i]
        break
      }
    }
    if (!lastAssistant) return

    // 触发自动朗读
    void useTtsStore.getState().speak(lastAssistant.id, lastAssistant.content)
  }, [isStreaming, messages, ttsEnabled, ttsMode])
}
