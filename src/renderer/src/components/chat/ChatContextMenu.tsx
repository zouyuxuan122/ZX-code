import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Scissors, ClipboardPaste, CopyCheck, Quote } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'

interface MenuState {
  visible: boolean
  x: number
  y: number
  canCopy: boolean
  canCut: boolean
  canPaste: boolean
  canSelectAll: boolean
  canQuote: boolean
  canCopyAll: boolean
  target: 'input' | 'message' | 'other' | null
  /** 右键所在的消息元素（用于"复制全部"） */
  messageEl: Element | null
}

const HIDDEN: MenuState = {
  visible: false,
  x: 0,
  y: 0,
  canCopy: false,
  canCut: false,
  canPaste: false,
  canSelectAll: false,
  canQuote: false,
  canCopyAll: false,
  target: null,
  messageEl: null,
}

/**
 * 聊天区域右键上下文菜单。
 * - 在 input/textarea 内右键：放行使用浏览器原生菜单
 * - 在聊天区域（[data-chat-area] 或 .chat-message-content）右键：显示自定义菜单
 *   - 复制 / 剪切 / 粘贴 / 全选
 * 遵循项目硬约束：纯黑底 + 白色边框
 */
export function ChatContextMenu() {
  const [state, setState] = useState<MenuState>(HIDDEN)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const setQuotedText = useUIStore((s) => s.setQuotedText)

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target) return

      // 1) input/textarea：放行浏览器原生菜单
      const inputEl = target.closest('input, textarea') as HTMLElement | null
      if (inputEl) {
        setState(HIDDEN)
        return
      }

      // 2) 仅在聊天区域内显示自定义菜单
      const inChat =
        !!target.closest('[data-chat-area]') || !!target.closest('.chat-message-content')
      if (!inChat) {
        setState(HIDDEN)
        return
      }

      e.preventDefault()

      const sel = window.getSelection()
      const selectedText = sel?.toString() ?? ''
      const hasSelection = selectedText.length > 0
      // 是否在可编辑元素内
      const editable = (target.closest('[contenteditable="true"]') as HTMLElement | null) ?? null
      const canCut = hasSelection && editable !== null
      // 找到右键所在的消息内容元素（用于"复制全部"）
      const messageEl = target.closest('.chat-message-content') || target.closest('[data-message-role]')

      setState({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        canCopy: hasSelection,
        canCut,
        canPaste: editable !== null,
        canSelectAll: true,
        canQuote: hasSelection,
        canCopyAll: !hasSelection && messageEl !== null,
        target: 'message',
        messageEl,
      })
    }

    const handleClick = (e: MouseEvent) => {
      // 点击菜单外则关闭
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target as Node)) {
        setState(HIDDEN)
      }
    }

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(HIDDEN)
    }

    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [])

  // 测量菜单尺寸，修正位置防止溢出视口
  useLayoutEffect(() => {
    if (!state.visible) return
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 4
    let x = state.x
    let y = state.y
    if (x + rect.width + margin > window.innerWidth) {
      x = Math.max(margin, window.innerWidth - rect.width - margin)
    }
    if (y + rect.height + margin > window.innerHeight) {
      y = Math.max(margin, state.y - rect.height)
    }
    setAdjustedPos({ x, y })
  }, [state.visible, state.x, state.y])

  const close = () => setState(HIDDEN)

  const handleCopy = async () => {
    const sel = window.getSelection()
    if (sel && sel.toString()) {
      try {
        await navigator.clipboard.writeText(sel.toString())
      } catch {
        // 忽略
      }
    }
    close()
  }

  const handleCut = async () => {
    const sel = window.getSelection()
    if (sel && sel.toString()) {
      try {
        await navigator.clipboard.writeText(sel.toString())
      } catch {
        // 忽略
      }
      if (sel.rangeCount > 0) {
        sel.deleteFromDocument()
      }
    }
    close()
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      // 向当前聚焦的可编辑元素插入文本
      const active = document.activeElement as HTMLElement | null
      if (active && active.isContentEditable) {
        document.execCommand('insertText', false, text)
      }
    } catch {
      // 忽略剪贴板权限错误
    }
    close()
  }

  const handleSelectAll = () => {
    // 选中聊天消息区域所有内容
    const chatArea = document.querySelector('[data-chat-area]')
    if (chatArea) {
      const range = document.createRange()
      range.selectNodeContents(chatArea)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    close()
  }

  const handleQuote = () => {
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (text) {
      setQuotedText(text)
    }
    sel?.removeAllRanges()
    close()
  }

  const handleCopyAll = async () => {
    if (!state.messageEl) {
      close()
      return
    }
    // 获取消息元素的纯文本内容
    const text = state.messageEl.textContent || state.messageEl.innerHTML || ''
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 忽略剪贴板权限错误
    }
    close()
  }

  return (
    <AnimatePresence>
      {state.visible && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'fixed',
            left: adjustedPos.x || state.x,
            top: adjustedPos.y || state.y,
            zIndex: 300,
          }}
          className="pointer-events-auto min-w-[160px] rounded-md border border-border-default bg-bg-tertiary py-1 shadow-xl"
        >
          <MenuItem
            icon={Copy}
            label="复制"
            shortcut="Ctrl+C"
            disabled={!state.canCopy}
            onClick={handleCopy}
          />
          {state.canCopyAll && (
            <MenuItem
              icon={CopyCheck}
              label="复制全部"
              onClick={handleCopyAll}
            />
          )}
          <MenuItem
            icon={Quote}
            label="引用提问"
            disabled={!state.canQuote}
            onClick={handleQuote}
          />
          <MenuItem
            icon={Scissors}
            label="剪切"
            shortcut="Ctrl+X"
            disabled={!state.canCut}
            onClick={handleCut}
          />
          <MenuItem
            icon={ClipboardPaste}
            label="粘贴"
            shortcut="Ctrl+V"
            disabled={!state.canPaste}
            onClick={handlePaste}
          />
          <div className="my-1 h-px bg-border-default" />
          <MenuItem
            icon={CopyCheck}
            label="全选"
            shortcut="Ctrl+A"
            disabled={!state.canSelectAll}
            onClick={handleSelectAll}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  icon: typeof Copy
  label: string
  shortcut?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary transition-smooth-fast hover:bg-white/10 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-text-tertiary text-[10px]">{shortcut}</span>}
    </button>
  )
}
