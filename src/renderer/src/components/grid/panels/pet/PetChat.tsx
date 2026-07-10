import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Send, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { usePetStore } from '@/stores/petStore'

/**
 * 宠物独立对话系统：可折叠的迷你对话区
 */
export function PetChat() {
  const petMessages = usePetStore((s) => s.petMessages)
  const isChatOpen = usePetStore((s) => s.isChatOpen)
  const toggleChat = usePetStore((s) => s.toggleChat)
  const sendPetMessage = usePetStore((s) => s.sendPetMessage)
  const character = usePetStore((s) => s.character)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (isChatOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [petMessages, isChatOpen])

  // 打开时自动聚焦
  useEffect(() => {
    if (isChatOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isChatOpen])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    sendPetMessage(text)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 最近 5 条消息
  const recentMessages = petMessages.slice(-5)

  return (
    <div className="flex flex-col border-t border-border-default bg-bg-secondary">
      {/* 折叠按钮 */}
      <button
        onClick={toggleChat}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
      >
        <MessageCircle size={13} />
        <span className="font-medium">{character.name}</span>
        {petMessages.length > 0 && (
          <span className="rounded-full bg-pink-500/20 px-1.5 py-0 text-[10px] text-pink-400">
            {petMessages.length}
          </span>
        )}
        <ChevronDown
          size={13}
          className={cn('ml-auto transition-transform', isChatOpen && 'rotate-180')}
        />
      </button>

      {/* 展开的对话区 */}
      <AnimatePresence initial={false}>
        {isChatOpen && (
          <motion.div
            key="chat-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex max-h-[200px] flex-col">
              {/* 消息列表 */}
              <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
                {recentMessages.length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-text-tertiary">
                    {character.greeting}
                  </p>
                ) : (
                  recentMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex',
                        msg.role === 'user' ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[80%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed',
                          msg.role === 'user'
                            ? 'bg-blue-500/80 text-white'
                            : 'bg-pink-500/20 text-pink-200',
                        )}
                      >
                        {msg.role === 'pet' && (
                          <span className="mr-1">{character.avatar}</span>
                        )}
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 输入区 */}
              <div className="flex items-center gap-1.5 border-t border-border-default px-2 py-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`和${character.name}说点什么...`}
                  className="h-[32px] flex-1 rounded-lg border border-border-default bg-bg-tertiary px-2.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-pink-500/50 focus:outline-none"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="flex h-[32px] w-[32px] items-center justify-center rounded-lg bg-pink-500/80 text-white transition-colors hover:bg-pink-500 disabled:opacity-30 disabled:hover:bg-pink-500/80"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
