import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

// 使用 vi.hoisted 确保 mock 函数在 vi.mock 提升时可引用
const setQuotedText = vi.hoisted(() => vi.fn())

vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: unknown) => unknown) =>
    selector({ setQuotedText }),
}))

import { SelectionToolbar } from '@/components/chat/SelectionToolbar'

/**
 * 模拟一个位于 [data-message-role="assistant"] 容器内的选区，
 * 并派发 selectionchange 事件触发 SelectionToolbar 的逻辑。
 */
function fireSelectionChange(text: string, anchorNode: Node, rect: DOMRect) {
  const sel = {
    isCollapsed: false,
    rangeCount: 1,
    toString: () => text,
    anchorNode,
    getRangeAt: () => ({ getBoundingClientRect: () => rect }),
    removeAllRanges: vi.fn(),
  }
  vi.spyOn(window, 'getSelection').mockReturnValue(sel as unknown as Selection)
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
  })
}

function makeRect(left: number, top: number, width = 80, height = 20): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('SelectionToolbar', () => {
  let messageContainer: HTMLElement
  let textNode: Text

  beforeEach(() => {
    // 创建带 data-message-role 的 AI 消息容器（含真实文本节点作为 anchorNode）
    messageContainer = document.createElement('div')
    messageContainer.setAttribute('data-message-role', 'assistant')
    messageContainer.innerHTML = '<p class="chat-message-content">AI 回复的正文内容</p>'
    document.body.appendChild(messageContainer)
    textNode = messageContainer.querySelector('p')!.firstChild as Text
    setQuotedText.mockClear()
    // 让 requestAnimationFrame 同步执行，使 selectionchange 后的状态更新在 act 内完成
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('选区位于 AI 消息内时显示引用/复制工具栏', () => {
    render(<SelectionToolbar />)

    fireSelectionChange('AI 回复', textNode, makeRect(100, 200))

    expect(screen.getByText('引用')).toBeInTheDocument()
    expect(screen.getByText('复制')).toBeInTheDocument()
  })

  it('工具栏通过 Portal 渲染到 document.body，绕过 transform 祖先导致 fixed 定位失效', () => {
    render(<SelectionToolbar />)

    fireSelectionChange('AI 回复', textNode, makeRect(100, 200))

    const quoteBtn = screen.getByText('引用')
    // motion.div 工具栏容器（带 pointer-events-auto）
    const toolbar = quoteBtn.closest('div')
    expect(toolbar).not.toBeNull()
    // 关键断言：工具栏应直接挂载在 document.body 下（Portal），
    // 而不是在带 transform 的组件树祖先内
    expect(toolbar!.parentElement).toBe(document.body)
  })

  it('点击「引用」按钮将选中文本注入 quotedText', () => {
    render(<SelectionToolbar />)

    fireSelectionChange('需要引用的片段', textNode, makeRect(100, 200))

    fireEvent.click(screen.getByText('引用'))
    expect(setQuotedText).toHaveBeenCalledWith('需要引用的片段')
  })

  it('选区不在消息容器内时不显示工具栏', () => {
    // 创建一个不在 data-message-role 容器内的节点
    const outside = document.createElement('div')
    outside.textContent = '外部文本'
    document.body.appendChild(outside)
    const outsideText = outside.firstChild as Text

    render(<SelectionToolbar />)

    fireSelectionChange('外部文本', outsideText, makeRect(50, 50))

    expect(screen.queryByText('引用')).not.toBeInTheDocument()
  })
})
