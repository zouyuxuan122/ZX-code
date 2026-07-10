import { useEffect, useRef, useMemo, memo } from 'react'
import { motion } from 'framer-motion'
import { useChatStore } from '@/stores/chatStore'
import type { Message, MessageMetadata } from '@shared/types/conversation'
import { MessageItem } from './MessageItem'
import { ChangesPanel } from './ChangesPanel'
import { TypingIndicator } from './TypingIndicator'

function parseMetadata(metadata: string | null): MessageMetadata | null {
  if (!metadata) return null
  try {
    return JSON.parse(metadata) as MessageMetadata
  } catch {
    return null
  }
}

/** 渲染块：单条消息 或 一组连续的工具调用 */
type RenderBlock =
  | { type: 'message'; message: Message; isLast: boolean }
  | { type: 'changes'; messages: Message[]; isLast: boolean }

/**
 * 把消息序列分成渲染块：
 * - 连续的 assistant(带 tool_calls) + tool 消息 → changes 块（用 ChangesPanel 收起）
 * - user / 无 tool_calls 的 assistant → message 块（用 MessageItem 独立显示）
 * - 流式临时消息(temp-assistant-) → message 块（保持展开，显示正在运行的工具）
 */
function groupMessages(messages: Message[]): RenderBlock[] {
  const blocks: RenderBlock[] = []
  let i = 0
  while (i < messages.length) {
    const msg = messages[i]
    // 流式临时消息：独立显示
    if (msg.role === 'assistant' && msg.id.startsWith('temp-assistant-')) {
      blocks.push({ type: 'message', message: msg, isLast: i === messages.length - 1 })
      i++
      continue
    }
    if (msg.role === 'assistant') {
      const meta = parseMetadata(msg.metadata)
      const hasToolCalls = !!(meta?.tool_calls && meta.tool_calls.length > 0)
      if (hasToolCalls) {
        // 开始 changes 块：收集连续的 tool + assistant(带 tool_calls)
        const group: Message[] = [msg]
        let j = i + 1
        while (j < messages.length) {
          const next = messages[j]
          if (next.role === 'tool') {
            group.push(next)
            j++
          } else if (next.role === 'assistant' && !next.id.startsWith('temp-assistant-')) {
            const nextMeta = parseMetadata(next.metadata)
            const nextHasToolCalls = !!(nextMeta?.tool_calls && nextMeta.tool_calls.length > 0)
            if (nextHasToolCalls) {
              group.push(next)
              j++
            } else {
              break
            }
          } else {
            break
          }
        }
        blocks.push({ type: 'changes', messages: group, isLast: j === messages.length })
        i = j
      } else {
        blocks.push({ type: 'message', message: msg, isLast: i === messages.length - 1 })
        i++
      }
    } else {
      // user / system / 孤立的 tool
      blocks.push({ type: 'message', message: msg, isLast: i === messages.length - 1 })
      i++
    }
  }
  return blocks
}

const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="surface-3d flex h-14 w-14 items-center justify-center rounded-xl"
      >
        <svg className="h-7 w-7 animate-float text-accent-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="text-center"
      >
        <h2 className="text-lg font-semibold text-text-primary">开始新对话</h2>
        <p className="mt-1 text-sm text-text-secondary">
          输入消息开始与 AI 助手对话
        </p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="mt-2 flex items-center gap-1.5 text-xs text-text-tertiary"
      >
        <span>支持 Markdown、代码高亮与工具调用</span>
      </motion.div>
    </div>
  )
})

export const MessageList = memo(function MessageList() {
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const streamingThinking = useChatStore((s) => s.streamingThinking)
  const toolCalls = useChatStore((s) => s.toolCalls)
  const loadingMessages = useChatStore((s) => s.loadingMessages)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const toolResultMap = useMemo(() => {
    const map = new Map<string, Message>()
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.tool_call_id) {
        map.set(msg.tool_call_id, msg)
      }
    }
    return map
  }, [messages])

  // 分组 + 流式临时消息
  const renderBlocks = useMemo(() => {
    let workingMessages = messages
    if (isStreaming) {
      const last = messages[messages.length - 1]
      if (!last || last.role !== 'assistant' || !last.id.startsWith('temp-assistant-')) {
        const streamingMessage: Message = {
          id: `temp-assistant-${Date.now()}`,
          conversation_id: '',
          role: 'assistant',
          content: '',
          metadata: null,
          created_at: Date.now(),
        }
        workingMessages = [...messages, streamingMessage]
      }
    }
    return groupMessages(workingMessages)
  }, [messages, isStreaming])

  const activeTools = useMemo(() => {
    return Object.values(toolCalls).filter((tc) => tc.status === 'running')
  }, [toolCalls])

  const showTypingIndicator = isStreaming && !streamingContent && activeTools.length === 0

  useEffect(() => {
    const el = bottomRef.current
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [renderBlocks, streamingContent, streamingThinking, isStreaming])

  if (loadingMessages && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
        加载消息中...
      </div>
    )
  }

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="h-full overflow-auto">
        <EmptyState />
      </div>
    )
  }

  return (
    <div ref={scrollContainerRef} className="h-full overflow-auto px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {renderBlocks.map((block, idx) => {
          const key = block.type === 'message'
            ? block.message.id
            : `changes-${idx}`
          const isLast = block.isLast

          if (block.type === 'changes') {
            return (
              <ChangesPanel
                key={key}
                messages={block.messages}
                toolCalls={toolCalls}
                toolResultMap={toolResultMap}
                isStreaming={isStreaming && isLast}
              />
            )
          }

          const msg = block.message
          const isStreamingMsg = isStreaming && isLast && msg.role === 'assistant'
          if (msg.role === 'tool') return null
          return (
            <MessageItem
              key={key}
              message={msg}
              isStreaming={isStreamingMsg}
              streamingContent={isStreamingMsg ? streamingContent : undefined}
              streamingThinking={isStreamingMsg ? streamingThinking : undefined}
              toolCalls={toolCalls}
              toolResultMap={toolResultMap}
            />
          )
        })}
        {showTypingIndicator && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  )
})
