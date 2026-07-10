import { memo, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PanelLeftClose } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { useProjectStore } from '@/stores/projectStore'
import type { Project } from '@shared/types/project'
import type { Conversation } from '@shared/types/conversation'
import { cn } from '@/utils/cn'

const EMPTY_CONVERSATIONS: Conversation[] = []

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

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}

const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: ConversationItemProps) {
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

  return (
    <div
      className={cn(
        'group relative mb-0.5 flex items-center gap-2 rounded-md border py-1.5 pl-7 pr-2 text-sm transition-smooth cursor-pointer',
        isActive
          ? 'border-glow-active border bg-white/5 text-text-primary'
          : 'border-transparent text-text-secondary hover:border-border-strong hover:bg-white/5 hover:text-text-primary',
      )}
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
    >
      {isActive && !editing && (
        <motion.span
          layoutId="conversation-active-indicator"
          className="absolute left-1 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-blue shadow-glow"
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        />
      )}

      <span className="flex-shrink-0 text-text-tertiary text-xs">📄</span>

      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitRename()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setEditValue(conversation.title)
              setEditing(false)
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-border-strong bg-bg-primary px-1.5 py-0.5 text-xs text-text-primary shadow-inset focus-visible:outline-none focus:border-accent-blue"
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
            className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-white/10 hover:text-text-primary"
            title="重命名"
          >
            ✏
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(`确定删除对话「${conversation.title}」吗？`)) {
                onDelete()
              }
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-white/10 hover:text-accent-red"
            title="删除"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  )
})

interface WorkspacePanelProps {
  project: Project
  onClose?: () => void
  onCollapse?: () => void
}

export const WorkspacePanel = memo(function WorkspacePanel({
  project,
  onClose,
  onCollapse,
}: WorkspacePanelProps) {
  const conversations = useChatStore(
    (s) => s.conversationsByWorkspace[project.id] ?? EMPTY_CONVERSATIONS,
  )
  const loadingThis = useChatStore(
    (s) => s.loadingByWorkspace[project.id] ?? false,
  )
  const currentConversationId = useChatStore((s) => s.currentConversationId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const loadWorkspaceConversations = useChatStore((s) => s.loadWorkspaceConversations)
  const switchProject = useProjectStore((s) => s.switchProject)
  const creatingRef = useRef(false)

  useEffect(() => {
    void loadWorkspaceConversations(project.id)
  }, [project.id, loadWorkspaceConversations])

  const handleNewConversation = async () => {
    if (creatingRef.current) return
    creatingRef.current = true
    try {
      await switchProject(project.id)
      const id = await createConversation(project.id)
      await loadWorkspaceConversations(project.id)
      await selectConversation(id)
    } finally {
      creatingRef.current = false
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 工作区信息头部 */}
      <div className="border-b border-border-default px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-shimmer-gray text-sm font-semibold text-text-primary truncate">
            {project.name}
          </h3>
          <div className="flex items-center gap-1">
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-hover-surface transition-smooth-fast"
                title="收起面板"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-hover-surface transition-smooth-fast"
                title="关闭"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
        </div>
        <p className="mt-0.5 text-xs text-text-tertiary truncate">
          {project.workspace_path || project.id}
        </p>
      </div>

      {/* 新建会话按钮 */}
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={handleNewConversation}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border-default px-3 py-1.5 text-xs text-text-secondary hover:border-border-strong hover:bg-white/5 hover:text-text-primary transition-smooth-fast"
        >
          <span className="text-sm leading-none">+</span>
          <span>新建会话</span>
        </button>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        {loadingThis && conversations.length === 0 ? (
          <div className="flex items-center justify-center gap-1.5 px-3 py-4 text-xs text-text-tertiary">
            <span className="animate-pulse-soft">⟳</span>
            <span>加载中...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text-tertiary">
            暂无对话
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === currentConversationId}
              onSelect={async () => {
                await selectConversation(conv.id)
                await switchProject(project.id)
              }}
              onDelete={() => void deleteConversation(conv.id)}
              onRename={(title) => void renameConversation(conv.id, title)}
            />
          ))
        )}
      </div>
    </div>
  )
})
