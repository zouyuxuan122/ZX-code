import { memo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/stores/chatStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSearchStore } from '@/stores/searchStore'
import { cn } from '@/utils/cn'

function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  return `${Math.floor(diff / day)} 天前`
}

export const TabBar = memo(function TabBar() {
  const conversations = useChatStore((s) => s.conversations)
  const currentConversationId = useChatStore((s) => s.currentConversationId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const loadConversations = useChatStore((s) => s.loadConversations)
  const toolCalls = useChatStore((s) => s.toolCalls)
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeToolIds = Object.values(toolCalls)
    .filter((tc) => tc.status === 'running')
    .map((tc) => tc.toolCallId)

  const scrollToEnd = () => {
    const el = scrollRef.current
    if (el) {
      requestAnimationFrame(() => {
        el.scrollLeft = el.scrollWidth
      })
    }
  }

  useEffect(() => {
    scrollToEnd()
  }, [conversations.length])

  const handleNewConversation = async () => {
    const currentProject = useProjectStore.getState().currentProject
    await createConversation(currentProject?.id ?? null)
    await loadConversations(currentProject?.id)
  }

  const handleOpenSearch = () => {
    useSearchStore.getState().open()
  }

  if (conversations.length === 0) return null

  return (
    <div className="flex h-8 items-center border-b border-border-default bg-bg-secondary/60 backdrop-blur-sm">
      <div
        ref={scrollRef}
        className="flex flex-1 items-center gap-0 overflow-x-auto px-1 scrollbar-none"
      >
        <AnimatePresence initial={false}>
          {conversations.slice(0, 20).map((conv) => {
            const isActive = conv.id === currentConversationId
            const hasRunningTool = Object.values(toolCalls).some(
              (tc) => tc.status === 'running',
            )

            const statusDot = isActive && hasRunningTool
              ? 'text-accent-green animate-pulse-soft'
              : isActive
                ? 'text-accent-green'
                : 'text-text-tertiary'

            return (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex-shrink-0 overflow-hidden"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => void selectConversation(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void selectConversation(conv.id)
                    }
                  }}
                  className={cn(
                    'group relative flex items-center gap-1.5 px-2.5 py-1 text-xs transition-smooth-fast whitespace-nowrap cursor-pointer',
                    isActive
                      ? 'text-text-primary border-b-2 border-accent-blue'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.03]',
                  )}
                >
                  <span className={cn('inline-block w-1.5 h-1.5 rounded-full flex-shrink-0', statusDot)} />
                  <span className="max-w-[120px] truncate">{conv.title}</span>
                  <span className="text-[10px] text-text-tertiary ml-1 hidden group-hover:hidden">
                    {formatTime(conv.updated_at)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void deleteConversation(conv.id)
                    }}
                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-accent-red transition-smooth-fast"
                  >
                    ×
                  </button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={handleNewConversation}
        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-smooth-fast hover:bg-white/[0.03]"
        title="新建对话 (Ctrl+T)"
      >
        <span className="text-[16px] leading-none">+</span>
      </button>
      <button
        type="button"
        onClick={handleOpenSearch}
        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-smooth-fast hover:bg-white/[0.03]"
        title="搜索文件"
      >
        <span className="text-sm leading-none">🔍</span>
      </button>
    </div>
  )
})
