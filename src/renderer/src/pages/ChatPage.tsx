import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageList } from '@/components/chat/MessageList'
import { ModeSwitcher } from '@/components/chat/ModeSwitcher'
import { ActivityBar } from '@/components/chat/ActivityBar'
import { TabBar } from '@/components/chat/TabBar'
import { SelectionToolbar } from '@/components/chat/SelectionToolbar'
import { ChatContextMenu } from '@/components/chat/ChatContextMenu'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { useChatEvents, useProviderModelsSync } from '@/hooks/useChatEvents'
import { useChatStore } from '@/stores/chatStore'
import { useProjectStore } from '@/stores/projectStore'
import { useTerminalStore } from '@/stores/terminalStore'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

const examplePrompts = [
  '帮我写一段 Python 代码',
  '解释这段代码的工作原理',
  '优化这个项目的性能',
  '帮我重构这个文件',
  '写一个单元测试',
]

export default function ChatPage() {
  useChatEvents()
  useProviderModelsSync()

  const currentConversationId = useChatStore((s) => s.currentConversationId)
  const currentConversation = useChatStore((s) => s.currentConversation)
  const loadConversations = useChatStore((s) => s.loadConversations)
  const loadAvailableModels = useChatStore((s) => s.loadAvailableModels)
  const currentProject = useProjectStore((s) => s.currentProject)
  const terminalOpen = useTerminalStore((s) => s.isOpen)
  const setPendingInput = useUIStore((s) => s.setPendingInput)
  const conversations = useChatStore((s) => s.conversations)

  useEffect(() => {
    void loadConversations(currentProject?.id)
    void loadAvailableModels()
  }, [loadConversations, loadAvailableModels, currentProject?.id])

  const hasConversation = currentConversationId !== null
  const hasAnyConversation = conversations.length > 0

  const backgroundStyle = useMemo<React.CSSProperties>(() => {
    if (!currentProject || currentProject.background_type === 'none' || !currentProject.background) {
      return {}
    }
    if (currentProject.background_type === 'image') {
      return {
        backgroundImage: `url(${currentProject.background})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    }
    return { backgroundColor: currentProject.background }
  }, [currentProject?.background, currentProject?.background_type])

  const hasImageBackground =
    !!currentProject && currentProject.background_type === 'image' && !!currentProject.background

  const handleExamplePrompt = (prompt: string) => {
    setPendingInput(prompt)
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={backgroundStyle}
    >
      {/* 顶部标题栏 */}
      <div className="flex h-9 flex-shrink-0 items-center gap-2 bg-bg-primary/80 px-3 backdrop-blur-sm transition-smooth">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-default bg-bg-tertiary">
          {currentProject?.ai_avatar ? (
            <img src={currentProject.ai_avatar} alt="AI" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-accent-blue">🤖</span>
          )}
        </div>

        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {currentProject ? (
            <>
              <span className="text-text-secondary">{currentProject.name}</span>
              {currentConversation && (
                <>
                  <span className="mx-1.5 text-text-tertiary">/</span>
                  <span>{currentConversation.title}</span>
                </>
              )}
            </>
          ) : (
            <span className="text-text-tertiary">未选择工作区</span>
          )}
        </div>

        <ModeSwitcher />
      </div>

      {/* 多会话标签栏 */}
      {hasAnyConversation && <TabBar />}

      {/* 消息区域 */}
      <div
        className={cn('min-h-0 flex-1 flex flex-col', hasImageBackground && 'bg-bg-primary/40 backdrop-blur-[2px]')}
        data-chat-area
      >
        <ActivityBar />
        {hasConversation ? (
          <MessageList />
        ) : (
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
              <h2 className="text-lg font-bold text-text-primary">
                {currentProject ? '开始新对话' : '请先选择工作区'}
              </h2>
              <p className="mt-1 text-sm font-medium text-text-primary">
                {currentProject
                  ? '输入消息开始与 AI 助手对话'
                  : '在左侧栏选择一个 AI 工作区，或新建一个工作区'}
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary font-medium"
            >
              <span>支持 Markdown、代码高亮与工具调用</span>
            </motion.div>

            {/* 欢迎页示例问题按钮 */}
            {currentProject && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-wrap gap-2 justify-center mt-4 max-w-md"
              >
                {examplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleExamplePrompt(prompt)}
                    className="px-3 py-1.5 text-xs font-medium rounded-full border border-border-default text-text-secondary hover:border-accent-blue hover:text-accent-blue transition-smooth"
                  >
                    {prompt}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {terminalOpen && <TerminalPanel key="terminal-panel" />}
      </AnimatePresence>

      <ChatInput />

      <SelectionToolbar />
      <ChatContextMenu />
    </div>
  )
}
