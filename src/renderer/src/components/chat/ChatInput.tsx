import { useState, useRef, useCallback, useMemo, useEffect, type KeyboardEvent } from 'react'
import {
  ArrowUp,
  Square,
  AlertCircle,
  X,
  FileText,
  HelpCircle,
  Eraser,
  Archive,
  Plus,
  Download,
  ToggleLeft,
  ListTodo,
  Quote,
  Loader2,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { ModelSelector, parseModelName } from './ModelSelector'
import { ThinkingLevelSelector } from './ThinkingLevelSelector'
import { QuestionCard } from './QuestionCard'
import { Tooltip } from '@/components/ui/Tooltip'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { ipc } from '@/services/ipc'
import { toast } from '@/stores/toastStore'
import { cn } from '@/utils/cn'
import { SLASH_COMMANDS, filterCommands, parseSlashCommand } from '@/utils/slashCommands'
import type { AgentMode } from '@shared/types/ipc'

interface AttachmentItem {
  path: string
  filename: string
  size: number
}

export function ChatInput() {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)

  const selectedModel = useUIStore((s) => s.selectedModel)
  const setSelectedModel = useUIStore((s) => s.setSelectedModel)
  const thinkingLevel = useUIStore((s) => s.thinkingLevel)
  const agentMode = useUIStore((s) => s.agentMode)
  const setAgentMode = useUIStore((s) => s.setAgentMode)
  const quotedText = useUIStore((s) => s.quotedText)
  const setQuotedText = useUIStore((s) => s.setQuotedText)
  const pendingInput = useUIStore((s) => s.pendingInput)
  const setPendingInput = useUIStore((s) => s.setPendingInput)

  useEffect(() => {
    if (pendingInput) {
      setInput(pendingInput)
      setPendingInput('')
      requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (textarea) {
          textarea.focus()
          textarea.style.height = 'auto'
          textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
        }
      })
    }
  }, [pendingInput, setPendingInput])

  const autoAccept = useSettingsStore((s) => s.getSetting<boolean>('permission.autoAccept', true))

  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopStreaming = useChatStore((s) => s.stopStreaming)
  const createConversation = useChatStore((s) => s.createConversation)
  const loadConversations = useChatStore((s) => s.loadConversations)
  const compressConversation = useChatStore((s) => s.compressConversation)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const currentConversationId = useChatStore((s) => s.currentConversationId)
  const messages = useChatStore((s) => s.messages)
  const error = useChatStore((s) => s.error)
  const clearError = useChatStore((s) => s.clearError)
  const pendingQuestion = useChatStore((s) => s.pendingQuestion)
  const replyQuestion = useChatStore((s) => s.replyQuestion)
  const cancelQuestion = useChatStore((s) => s.cancelQuestion)

  const currentProject = useProjectStore((s) => s.currentProject)
  const visualStyle = useSettingsStore((s) => s.getSetting<string>('theme.visualStyle', 'apple'))
  const isApple = visualStyle === 'apple'
  const isClaude = visualStyle === 'claude'

  const handleInput = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
    }
  }

  const commandIconMap: Record<string, typeof HelpCircle> = {
    help: HelpCircle,
    clear: Eraser,
    compact: Archive,
    new: Plus,
    export: Download,
    mode: ToggleLeft,
    todo: ListTodo,
    stop: Square,
  }

  const matchedCommands = useMemo(() => {
    if (!input.startsWith('/')) return []
    return filterCommands(input)
  }, [input])

  const handleSlashCommand = useCallback(
    async (rawInput: string): Promise<boolean> => {
      const parsed = parseSlashCommand(rawInput)
      if (!parsed) return false

      const { command, args } = parsed

      switch (command) {
        case 'help': {
          const helpText = SLASH_COMMANDS.map(
            (c) => `${c.usage} — ${c.description}`,
          ).join('\n')
          toast.info('可用命令', helpText)
          return true
        }
        case 'clear': {
          if (!currentConversationId) {
            toast.warning('无法清空', '当前没有活动对话')
            return true
          }
          try {
            await ipc.conversation.deleteMessages(currentConversationId)
            await useChatStore.getState().loadMessages(currentConversationId)
            toast.success('已清空', '对话消息已清除')
          } catch (err) {
            toast.error('清空失败', (err as Error).message)
          }
          return true
        }
        case 'compact': {
          if (!currentConversationId) {
            toast.warning('无法压缩', '当前没有活动对话')
            return true
          }
          toast.info('正在压缩', '正在压缩对话历史...')
          await compressConversation()
          return true
        }
        case 'new': {
          const title = args.join(' ') || '新对话'
          const projectId = useProjectStore.getState().currentProject?.id
          await createConversation(projectId ?? null, title)
          await loadConversations(projectId)
          toast.success('已创建', `新对话: ${title}`)
          return true
        }
        case 'export': {
          if (!currentConversationId || messages.length === 0) {
            toast.warning('无法导出', '当前没有消息可导出')
            return true
          }
          const md = messages
            .map((m) => {
              const role = m.role === 'user' ? '👤 **User**' : m.role === 'assistant' ? '🤖 **Assistant**' : `**${m.role}**`
              return `### ${role}\n\n${m.content}\n`
            })
            .join('\n---\n\n')
          const blob = new Blob([`# 对话导出\n\n${md}`], { type: 'text/markdown' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `conversation-${currentConversationId.slice(0, 8)}-${Date.now()}.md`
          a.click()
          URL.revokeObjectURL(url)
          toast.success('已导出', '对话已导出为 Markdown 文件')
          return true
        }
        case 'mode': {
          const target = args[0]?.toLowerCase()
          if (target !== 'chat' && target !== 'plan' && target !== 'build') {
            toast.warning('无效模式', '可用模式: chat, plan, build')
            return true
          }
          setAgentMode(target as AgentMode)
          const modeLabel = { chat: '聊天', plan: '规划', build: '构建' }[target]
          toast.success('已切换', `当前模式: ${modeLabel}`)
          return true
        }
        case 'todo': {
          const todos = useChatStore.getState().todos
          if (todos.length === 0) {
            toast.info('任务清单', '当前没有任务')
          } else {
            const todoText = todos
              .map((t) => `[${t.status === 'completed' ? 'x' : t.status === 'in_progress' ? '~' : ' '}] ${t.content}`)
              .join('\n')
            toast.info(`任务清单 (${todos.length})`, todoText)
          }
          return true
        }
        case 'stop': {
          await stopStreaming()
          toast.info('已停止', '已停止生成')
          return true
        }
        default:
          toast.warning('未知命令', `未知命令: /${command}。输入 /help 查看可用命令`)
          return true
      }
    },
    [
      currentConversationId,
      currentProject?.id,
      createConversation,
      loadConversations,
      compressConversation,
      stopStreaming,
      setAgentMode,
      messages,
    ],
  )

  const handleAttach = useCallback(async () => {
    if (uploading) return
    setUploading(true)
    try {
      const items = await ipc.upload.attachment()
      if (items && items.length > 0) {
        setAttachments((prev) => [...prev, ...items])
      }
    } catch (err) {
      toast.error('附件上传失败', (err as Error).message)
    } finally {
      setUploading(false)
    }
  }, [uploading])

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if ((!text && attachments.length === 0 && !quotedText) || sending || isStreaming) return

    if (text.startsWith('/')) {
      setSending(true)
      setInput('')
      setQuotedText('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      try {
        await handleSlashCommand(text)
      } catch (err) {
        toast.error('命令执行失败', (err as Error).message)
      } finally {
        setSending(false)
      }
      return
    }

    setSending(true)
    setInput('')
    setQuotedText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    const attachmentPaths = attachments.map((a) => a.path)

    try {
      if (!currentConversationId) {
        const title =
          text.length > 20
            ? text.slice(0, 20) + '...'
            : attachments.length > 0
              ? attachments[0].filename
              : '新对话'
        const projectId = useProjectStore.getState().currentProject?.id
        await createConversation(projectId ?? null, title)
        await loadConversations(projectId)
      }

      let finalText = text || '（仅附件）'
      if (quotedText) {
        const quoteBlock = quotedText
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
        finalText = `${quoteBlock}\n\n${finalText}`
      }

      if (currentProject?.id && text.includes('@')) {
        const mentionRegex = /@"([^"]+)"|@(\S+)/g
        const mentions: Array<{ full: string; path: string }> = []
        let m: RegExpExecArray | null
        while ((m = mentionRegex.exec(text)) !== null) {
          mentions.push({ full: m[0], path: m[1] || m[2] })
        }

        if (mentions.length > 0) {
          const fileContents: string[] = []
          for (const mention of mentions) {
            const result = await ipc.file.readContent(currentProject.id, mention.path)
            if (result.ok && result.content) {
              const ext = mention.path.split('.').pop() || ''
              fileContents.push(`\n\n--- @${mention.path} ---\n\`\`\`${ext}\n${result.content}\n\`\`\`\n--- end of ${mention.path} ---`)
            } else {
              fileContents.push(`\n\n[@${mention.path} 读取失败: ${result.error || '未知错误'}]`)
            }
          }
          finalText = text.replace(mentionRegex, '').trim()
          if (fileContents.length > 0) {
            finalText = `${finalText}\n${fileContents.join('')}`
          }
          if (!finalText.trim()) finalText = '（请查看引用的文件内容）'
        }
      }

      await sendMessage(finalText, {
        model: parseModelName(selectedModel),
        thinkingLevel,
        mode: agentMode,
        autoAccept,
        attachments: attachmentPaths.length > 0 ? attachmentPaths : undefined,
      })
      setAttachments([])
    } catch (err) {
      console.error('发送消息失败:', err)
    } finally {
      setSending(false)
    }
  }, [
    input,
    attachments,
    sending,
    isStreaming,
    currentConversationId,
    createConversation,
    loadConversations,
    currentProject?.id,
    sendMessage,
    selectedModel,
    thinkingLevel,
    agentMode,
    autoAccept,
    handleSlashCommand,
  ])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleStop = () => {
    void stopStreaming()
  }

  const canSend = (input.trim().length > 0 || attachments.length > 0 || quotedText.length > 0) && !sending && !isStreaming

  return (
    <div className="border-t border-border-subtle p-3 transition-smooth">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-md border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1 break-all">{error}</span>
              <button
                type="button"
                onClick={clearError}
                className="flex-shrink-0 rounded p-0.5 transition-smooth-fast hover:bg-accent-red/20"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingQuestion && (
          <QuestionCard
            questions={pendingQuestion.questions}
            onReply={(answers) => {
              void replyQuestion(answers)
            }}
            onCancel={() => {
              void cancelQuestion()
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {matchedCommands.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mb-2 overflow-hidden rounded-lg border border-border-default bg-bg-secondary shadow-md"
          >
            <div className="border-b border-border-default px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
              命令列表
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {matchedCommands.map((cmd) => {
                const Icon = commandIconMap[cmd.name] ?? HelpCircle
                return (
                  <button
                    key={cmd.name}
                    type="button"
                    onClick={() => {
                      setInput(`/${cmd.name} `)
                      textareaRef.current?.focus()
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-smooth-fast hover:bg-white/5"
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0 text-accent-blue" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-text-primary">/{cmd.name}</span>
                        {cmd.argsHint && (
                          <span className="text-[10px] text-text-tertiary">{cmd.argsHint}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-text-tertiary truncate">{cmd.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn(
        isApple
          ? 'rounded-2xl border border-border-default bg-bg-secondary/80 backdrop-blur-lg focus-within:border-accent-blue/50 focus-within:shadow-[0_0_0_3px_rgba(0,122,255,0.15)]'
          : isClaude
            ? 'rounded-xl border border-border-default bg-bg-tertiary shadow-inset focus-within:border-[rgba(217,119,87,0.4)] focus-within:shadow-[0_0_0_3px_rgba(217,119,87,0.1)]'
            : 'rounded-xl border border-border-default bg-bg-tertiary shadow-inset focus-within:border-accent-blue/40 focus-within:shadow-glow',
      )}>
        <AnimatePresence>
          {quotedText && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden border-b border-border-default"
            >
              <div className="flex items-start gap-2 p-2">
                <Quote className="mt-0.5 h-3 w-3 flex-shrink-0 text-accent-purple" />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                    引用
                  </div>
                  <div className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-accent-purple/40 pl-2 text-xs text-text-secondary">
                    {quotedText.length > 200 ? quotedText.slice(0, 200) + '...' : quotedText}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuotedText('')}
                  className="flex-shrink-0 rounded p-0.5 text-text-tertiary transition-smooth-fast hover:bg-accent-red/20 hover:text-accent-red"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-b border-border-default"
            >
              <div className="flex flex-wrap gap-1.5 p-2">
                {attachments.map((a, idx) => (
                  <div
                    key={`${a.path}-${idx}`}
                    className="group flex items-center gap-1.5 rounded border border-border-default bg-bg-primary px-2 py-1 text-xs text-text-secondary"
                  >
                    <FileText className="h-3 w-3 text-accent-blue" />
                    <span className="max-w-[140px] truncate">{a.filename}</span>
                    <span className="text-text-tertiary">{formatSize(a.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="ml-0.5 rounded p-0.5 text-text-tertiary transition-smooth-fast hover:bg-accent-red/20 hover:text-accent-red"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? '正在生成回复...'
              : uploading
                ? '正在选择附件...'
                : '输入消息... (Enter 发送, Shift+Enter 换行)'
          }
          disabled={isStreaming}
          className="w-full resize-none bg-transparent px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none disabled:opacity-60"
          rows={1}
          style={{ maxHeight: '200px' }}
        />

        <div className="flex items-center gap-2 border-t border-border-subtle px-2 py-1.5">
          <ModelSelector />
          <ThinkingLevelSelector />

          <div className="ml-auto flex items-center gap-2">
            <AnimatePresence>
              {isStreaming && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Tooltip content="停止生成">
                    <button
                      onClick={handleStop}
                      aria-label="停止生成"
                      className="flex h-7 w-7 animate-pulse-soft items-center justify-center rounded-md bg-accent-red text-white transition-smooth-fast hover:bg-accent-red/90 active:scale-95"
                    >
                      <Square className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button
              onClick={handleSend}
              disabled={!canSend}
              whileHover={canSend ? { scale: 1.06 } : undefined}
              whileTap={canSend ? { scale: 0.92 } : undefined}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'flex items-center justify-center',
                isApple
                  ? 'h-8 w-8 rounded-full transition-smooth-fast'
                  : isClaude
                    ? 'h-7 w-7 rounded-lg'
                    : 'h-7 w-7 rounded-lg transition-smooth-fast',
                canSend
                  ? isClaude
                    ? 'bg-gradient-to-br from-[#d97757] to-[#b0683f] text-white shadow-sm'
                    : 'bg-accent-blue text-white shadow-sm'
                  : 'bg-white/5 text-text-tertiary cursor-not-allowed',
              )}
            >
              <ArrowUp className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
