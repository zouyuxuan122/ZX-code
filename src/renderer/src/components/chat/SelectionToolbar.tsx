import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Quote, Copy } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'

interface ToolbarState {
  visible: boolean
  x: number
  y: number
  isAssistant: boolean
  text: string
}

const INITIAL: ToolbarState = { visible: false, x: 0, y: 0, isAssistant: false, text: '' }

/**
 * 框选工具栏：用户在消息内容上长按拖选时浮现。
 * - 选中 AI 消息内容时使用弹簧（Q弹）动画
 * - 选中用户消息内容时使用标准 ease 动画
 * - 「引用」：将选中文本注入输入框 quotedText
 * - 「复制」：写入系统剪贴板
 */
export function SelectionToolbar() {
  const setQuotedText = useUIStore((s) => s.setQuotedText)
  const [state, setState] = useState<ToolbarState>(INITIAL)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const handleSelectionChange = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setState((s) => (s.visible ? INITIAL : s))
          return
        }
        const text = sel.toString().trim()
        if (!text) {
          setState((s) => (s.visible ? INITIAL : s))
          return
        }
        // 必须位于消息容器内（带 data-message-role）
        const anchor = sel.anchorNode as Node | null
        if (!anchor) {
          setState((s) => (s.visible ? INITIAL : s))
          return
        }
        const container = (anchor.nodeType === Node.ELEMENT_NODE
          ? (anchor as Element)
          : anchor.parentElement
        )?.closest('[data-message-role]') as Element | null
        if (!container) {
          setState((s) => (s.visible ? INITIAL : s))
          return
        }
        const role = container.getAttribute('data-message-role')
        const isAssistant = role === 'assistant'

        const rect = sel.getRangeAt(0).getBoundingClientRect()
        // 工具栏位于选区上方居中
        const x = rect.left + rect.width / 2
        const y = rect.top - 8
        setState({ visible: true, x, y, isAssistant, text })
      })
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleQuote = () => {
    setQuotedText(state.text)
    // 清除选区并隐藏工具栏
    window.getSelection()?.removeAllRanges()
    setState(INITIAL)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(state.text)
    } catch {
      // 忽略剪贴板权限错误
    }
    window.getSelection()?.removeAllRanges()
    setState(INITIAL)
  }

  // AI 消息使用 Q 弹弹簧动画（更弹、带轻微旋转回弹），用户消息使用标准 ease
  const transition = state.isAssistant
    ? { type: 'spring' as const, stiffness: 500, damping: 12, mass: 0.6 }
    : { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const }

  // AI 消息的 Q 弹初始动画（带轻微缩放过冲 + 上浮）
  const initialAnim = state.isAssistant
    ? { opacity: 0, scale: 0.5, y: 12, rotate: -2 }
    : { opacity: 0, scale: 0.7, y: 6 }
  const animateAnim = state.isAssistant
    ? { opacity: 1, scale: 1, y: 0, rotate: 0 }
    : { opacity: 1, scale: 1, y: 0 }

  return createPortal(
    <AnimatePresence>
      {state.visible && (
        <motion.div
          key="selection-toolbar"
          initial={initialAnim}
          animate={animateAnim}
          exit={{ opacity: 0, scale: 0.85, y: 4 }}
          transition={transition}
          style={{
            position: 'fixed',
            left: state.x,
            top: state.y,
            transform: 'translate(-50%, -100%)',
            zIndex: 200,
          }}
          className="pointer-events-auto flex items-center gap-0.5 rounded-md border border-border-default bg-bg-tertiary px-1 py-0.5 shadow-lg"
          whileHover={state.isAssistant ? { scale: 1.05 } : undefined}
          whileTap={state.isAssistant ? { scale: 0.95 } : undefined}
        >
          <button
            type="button"
            onClick={handleQuote}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary transition-smooth-fast hover:bg-white/10 hover:text-accent-purple"
            title="引用到输入框"
          >
            <Quote className="h-3 w-3" />
            <span>引用</span>
          </button>
          <div className="h-3 w-px bg-border-default" />
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary transition-smooth-fast hover:bg-white/10 hover:text-accent-blue"
            title="复制"
          >
            <Copy className="h-3 w-3" />
            <span>复制</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
