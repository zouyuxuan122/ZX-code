import { memo, useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Plus, Trash2, MessageSquare, Check, Pencil, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useChatStore } from '@/stores/chatStore'
import { useProjectStore } from '@/stores/projectStore'
import type { Conversation } from '@shared/types/conversation'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/utils/cn'

/** 格式化最后更新时间 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** 单条对话项 */
const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(conversation.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commitRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== conversation.title) {
      onRename(trimmed)
    } else {
      setEditValue(conversation.title)
    }
    setEditing(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditValue(conversation.title)
      setEditing(false)
    }
  }

  return (
    <div
      className={cn(
        'group border-shimmer relative mb-0.5 flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm transition-smooth',
        isActive
          ? 'border-border-default bg-white/5 text-text-primary'
          : 'text-text-secondary hover:border-border-strong hover:bg-white/5 hover:text-text-primary',
      )}
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !editing) {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      {/* 选中项左侧蓝色指示条 */}
      {isActive && !editing && (
        <motion.span
          layoutId="conversation-active-indicator"
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-blue shadow-glow"
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        />
      )}
      <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" />

      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-border-strong bg-bg-primary px-1.5 py-0.5 text-xs text-text-primary shadow-inset transition-smooth-fast focus-visible:outline-none focus:border-accent-blue"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
      )}

      <span className="flex-shrink-0 text-xs text-text-tertiary">
        {formatRelativeTime(conversation.updated_at)}
      </span>

      {!editing && (
        <div className="flex flex-shrink-0 items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary transition-colors duration-200 hover:bg-white/10 hover:text-text-primary"
            title="重命名"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(`确定删除对话「${conversation.title}」吗？`)) {
                onDelete()
              }
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary transition-colors duration-200 hover:bg-white/10 hover:text-accent-red"
            title="删除"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {isActive && !editing && (
        <Check className="h-3 w-3 flex-shrink-0 text-accent-blue" />
      )}
    </div>
  )
})

interface ConversationHistoryProps {
  /** 可选的容器类名 */
  className?: string
  /** 是否展示标题栏（默认 true） */
  showHeader?: boolean
}

export const ConversationHistory = memo(function ConversationHistory({
  className,
  showHeader = true,
}: ConversationHistoryProps) {
  const conversations = useChatStore((s) => s.conversations)
  const currentConversationId = useChatStore((s) => s.currentConversationId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const loadConversations = useChatStore((s) => s.loadConversations)
  const loadingConversations = useChatStore((s) => s.loadingConversations)

  const currentProject = useProjectStore((s) => s.currentProject)
  const creatingRef = useRef(false)

  // 首次挂载加载对话列表
  useEffect(() => {
    void loadConversations(currentProject?.id)
  }, [loadConversations, currentProject?.id])

  const handleNew = async () => {
    if (creatingRef.current) return
    creatingRef.current = true
    try {
      const id = await createConversation(currentProject?.id ?? null)
      await loadConversations(currentProject?.id)
      await selectConversation(id)
    } finally {
      creatingRef.current = false
    }
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {showHeader && (
        <div className="flex h-9 items-center justify-between px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            对话
          </span>
          <Tooltip content="新建对话">
            <button
              type="button"
              onClick={handleNew}
              className="lift-button flex h-6 w-6 items-center justify-center rounded text-text-secondary transition-smooth-fast hover:bg-white/5 hover:text-text-primary"
            >
              <Plus className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      )}

      <div className="flex-1 overflow-auto px-2">
        {loadingConversations && conversations.length === 0 ? (
          <div className="flex items-center justify-center gap-1.5 px-2 py-4 text-xs text-text-tertiary">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>加载中...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-text-tertiary">
            暂无对话
            <div className="mt-2">
              <button
                type="button"
                onClick={handleNew}
                className="rounded border border-dashed border-border-default px-2 py-1 text-accent-blue transition-smooth hover:border-border-strong hover:bg-white/5"
              >
                点击新建
              </button>
            </div>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === currentConversationId}
              onSelect={() => void selectConversation(conv.id)}
              onDelete={() => void deleteConversation(conv.id)}
              onRename={(title) => void renameConversation(conv.id, title)}
            />
          ))
        )}
      </div>
    </div>
  )
})
