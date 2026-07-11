import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { Send, Square, Maximize2, Plus } from 'lucide-react'
import { useGridChatStore } from '@/stores/gridChatStore'
import { useGridStore } from '@/stores/gridStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { TtsButton } from '@/components/chat/TtsButton'
import { useTtsAutoPlay } from '@/hooks/useTtsAutoPlay'
import type { Message } from '@shared/types/conversation'
import { cn } from '@/utils/cn'

/** 极简消息气泡 */
function MessageBubble({ message, isStreaming, streamingContent }: {
  message: Message
  isStreaming?: boolean
  streamingContent?: string
}) {
  const isUser = message.role === 'user'
  const content = isStreaming ? (streamingContent || '') : message.content

  if (!isStreaming && !content.trim()) return null

  return (
    <div className={cn('flex w-full flex-col gap-0.5', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-1.5 text-[12px] leading-relaxed break-words',
          isUser
            ? 'bg-text-primary text-bg-primary rounded-br-sm'
            : 'bg-bg-tertiary text-text-primary rounded-bl-sm',
        )}
      >
        {content || '…'}
      </div>
      {/* AI 消息语音按钮（非流式时显示） */}
      {!isUser && !isStreaming && content.trim() && (
        <TtsButton messageId={message.id} text={content} size="sm" />
      )}
    </div>
  )
}

/** 极简消息列表 */
function MiniMessageList() {
  const messages = useGridChatStore((s) => s.messages)
  const isStreaming = useGridChatStore((s) => s.isStreaming)
  const streamingContent = useGridChatStore((s) => s.streamingContent)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 组装渲染列表：流式时追加一条临时 assistant 消息
  const renderItems = useMemo(() => {
    const items: Array<{ key: string; message: Message; isStreaming?: boolean }> = messages.map(
      (m) => ({ key: m.id, message: m }),
    )
    if (isStreaming) {
      const last = messages[messages.length - 1]
      const showTemp = !last || last.role !== 'assistant' || !last.id.startsWith('temp-')
      if (showTemp) {
        items.push({
          key: `temp-streaming`,
          message: {
            id: 'temp-streaming',
            conversation_id: '',
            role: 'assistant',
            content: '',
            metadata: null,
            created_at: Date.now(),
          },
          isStreaming: true,
        })
      } else if (last && last.role === 'assistant') {
        // 更新最后一条为流式
        items[items.length - 1] = {
          key: last.id,
          message: last,
          isStreaming: true,
        }
      }
    }
    return items
  }, [messages, isStreaming])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [renderItems, streamingContent, isStreaming])

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-4">
        <svg
          className="h-7 w-7 text-text-tertiary/40"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        >
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        <span className="text-[11px] text-text-tertiary/60">独立对话 · 不影响编程项目</span>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden px-2.5 py-2 space-y-2">
      {renderItems.map((item) => (
        <MessageBubble
          key={item.key}
          message={item.message}
          isStreaming={item.isStreaming}
          streamingContent={item.isStreaming ? streamingContent : undefined}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

/** 极简输入框 */
function MiniChatInput({ input, setInput }: { input: string; setInput: (v: string) => void }) {
  const sendMessage = useGridChatStore((s) => s.sendMessage)
  const isStreaming = useGridChatStore((s) => s.isStreaming)
  const stopStreaming = useGridChatStore((s) => s.stopStreaming)
  const messages = useGridChatStore((s) => s.messages)

  // 最后一条 AI 助手消息（用于语音朗读按钮）
  const lastAssistantMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content.trim()) {
        return messages[i]
      }
    }
    return null
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    await sendMessage(text)
  }, [input, isStreaming, sendMessage, setInput])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 px-2 pb-1.5">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息..."
        disabled={isStreaming}
        className={cn(
          'min-w-0 flex-1 rounded-full border border-border-default/40 bg-bg-tertiary/40 px-3 py-1.5',
          'text-[12px] text-text-primary placeholder:text-text-tertiary',
          'outline-none transition-colors',
          'focus:border-text-tertiary/40 focus:bg-bg-tertiary/60',
          'disabled:opacity-40',
        )}
      />
      {/* 语音朗读按钮 — 朗读最后一条 AI 回复 */}
      {lastAssistantMsg && !isStreaming && (
        <TtsButton
          messageId={lastAssistantMsg.id}
          text={lastAssistantMsg.content}
          size="sm"
        />
      )}
      {isStreaming ? (
        <button
          type="button"
          onClick={() => void stopStreaming()}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-state-error/15 text-state-error transition-colors hover:bg-state-error/25"
          title="停止"
        >
          <Square size={11} className="fill-current" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!input.trim()}
          className={cn(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors',
            input.trim()
              ? 'bg-text-primary text-bg-primary hover:opacity-80'
              : 'bg-bg-tertiary/40 text-text-tertiary cursor-not-allowed',
          )}
          title="发送"
        >
          <Send size={11} />
        </button>
      )}
    </div>
  )
}

/** 九宫格迷你对话面板 — 独立对话，不影响编程项目 */
export function ChatPanel() {
  const conversationTitle = useGridChatStore((s) => s.conversationTitle)
  const hasMessages = useGridChatStore((s) => s.messages.length > 0)
  const error = useGridChatStore((s) => s.error)
  const clearError = useGridChatStore((s) => s.clearError)
  const reset = useGridChatStore((s) => s.reset)
  const messages = useGridChatStore((s) => s.messages)
  const isStreaming = useGridChatStore((s) => s.isStreaming)
  const setGridMode = useGridStore((s) => s.setGridMode)
  const ttsEnabled = useSettingsStore((s) => s.getSetting<boolean>('tts.enabled', false))
  const ttsMode = useSettingsStore((s) => s.getSetting<'auto' | 'manual'>('tts.mode', 'manual'))
  const [input, setInput] = useState('')

  // TTS 自动朗读：流式结束后自动播放最后一条 AI 消息
  useTtsAutoPlay({ isStreaming, messages, ttsEnabled, ttsMode })

  const handleExitGrid = useCallback(() => {
    setGridMode(false)
  }, [setGridMode])

  const handleNewChat = useCallback(() => {
    reset()
    setInput('')
  }, [reset])

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      {/* 极简标题栏 — 点击进入标准对话界面 */}
      <div className="flex h-7 flex-shrink-0 items-center justify-between border-b border-border-default/30 px-2.5">
        <button
          type="button"
          onClick={handleExitGrid}
          className="group flex min-w-0 flex-1 cursor-pointer items-center gap-1.5"
          title="点击进入标准对话界面"
        >
          <span className="truncate text-[11px] font-medium text-text-tertiary group-hover:text-text-secondary">
            {hasMessages ? conversationTitle : '迷你对话'}
          </span>
          <Maximize2 className="h-3 w-3 flex-shrink-0 text-text-tertiary/40 transition-colors group-hover:text-text-secondary" />
        </button>
        {hasMessages && (
          <button
            type="button"
            onClick={handleNewChat}
            className="flex flex-shrink-0 cursor-pointer items-center justify-center rounded p-0.5 text-text-tertiary/60 transition-colors hover:bg-bg-tertiary/40 hover:text-text-secondary"
            title="新建对话"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 消息列表 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MiniMessageList />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex flex-shrink-0 items-center gap-1.5 border-t border-state-error/20 bg-state-error/5 px-2 py-1">
          <span className="flex-1 truncate text-[10px] text-state-error">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="flex-shrink-0 text-[10px] text-text-tertiary hover:text-text-primary"
          >
            ×
          </button>
        </div>
      )}

      {/* 模型选择器 + 输入框 */}
      <div className="flex flex-shrink-0 flex-col gap-1 border-t border-border-default/40 px-2 pt-1.5">
        <ModelSelector />
        <MiniChatInput input={input} setInput={setInput} />
      </div>
    </div>
  )
}
