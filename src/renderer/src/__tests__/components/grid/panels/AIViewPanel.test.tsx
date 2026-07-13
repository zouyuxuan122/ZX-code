import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Message } from '@shared/types/conversation'

afterEach(cleanup)

const mockStopStreaming = vi.fn()

let mockState: Record<string, unknown> = {
  isStreaming: false,
  streamingContent: '',
  streamingThinking: '',
  toolCalls: {},
  messages: [],
}

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      ...mockState,
      stopStreaming: mockStopStreaming,
    }
    return selector(state)
  }),
}))

import { AIViewPanel } from '@/components/grid/panels/AIViewPanel'

function setMockState(next: Record<string, unknown>) {
  mockState = { ...mockState, ...next }
}

describe('AIViewPanel', () => {
  beforeEach(() => {
    mockState = {
      isStreaming: false,
      streamingContent: '',
      streamingThinking: '',
      toolCalls: {},
      messages: [],
    }
  })

  it('renders idle placeholder when no activity', () => {
    render(<AIViewPanel />)
    expect(screen.getByText('AI 待命中')).toBeInTheDocument()
  })

  it('renders top stage summary bar with idle status', () => {
    render(<AIViewPanel />)
    const bar = screen.getByTestId('ai-stage-summary')
    expect(bar).toBeInTheDocument()
    expect(bar).toHaveTextContent('空闲')
  })

  it('shows thinking status label in summary bar during streaming thinking', () => {
    setMockState({ isStreaming: true, streamingThinking: 'Let me think...', streamingContent: '' })
    render(<AIViewPanel />)
    expect(screen.getByTestId('ai-stage-summary')).toHaveTextContent('思考中')
  })

  it('shows executing status label when a tool is running', () => {
    setMockState({
      isStreaming: true,
      toolCalls: {
        tc1: { toolCallId: 'tc1', name: 'read_file', args: '{"path":"src/main.ts"}', status: 'running', startedAt: Date.now() },
      },
    })
    render(<AIViewPanel />)
    expect(screen.getByTestId('ai-stage-summary')).toHaveTextContent('执行中')
  })

  it('shows completed / total count in summary bar', () => {
    const messages: Message[] = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'assistant',
        content: '',
        metadata: JSON.stringify({
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'read_file', arguments: '{}' },
            },
          ],
        }),
        created_at: Date.now(),
      },
    ]
    setMockState({
      isStreaming: true,
      messages,
      toolCalls: {
        tc2: { toolCallId: 'tc2', name: 'edit', args: '{}', status: 'running', startedAt: Date.now() },
      },
    })
    render(<AIViewPanel />)
    expect(screen.getByTestId('ai-stage-summary')).toHaveTextContent('1/2')
  })

  it('renders a running tool entry with pulse animation indicator', () => {
    setMockState({
      isStreaming: true,
      toolCalls: {
        tc1: { toolCallId: 'tc1', name: 'read_file', args: '{"path":"hello.txt"}', status: 'running', startedAt: Date.now() },
      },
    })
    render(<AIViewPanel />)
    const item = screen.getByTestId('work-item-live-tc1')
    expect(item).toBeInTheDocument()
    expect(item).toHaveTextContent('读取文件')
    expect(item).toHaveTextContent('hello.txt')
    expect(item.querySelector('[data-testid="running-pulse"]')).toBeInTheDocument()
  })

  it('renders a completed tool entry with check icon', () => {
    const messages: Message[] = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'assistant',
        content: '',
        metadata: JSON.stringify({
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'edit', arguments: '{"path":"src/main.ts"}' },
            },
          ],
        }),
        created_at: Date.now(),
      },
    ]
    setMockState({ isStreaming: false, messages })
    render(<AIViewPanel />)
    const item = screen.getByTestId('work-item-tc-tc1')
    expect(item).toBeInTheDocument()
    expect(item).toHaveTextContent('编辑文件')
    expect(item.querySelector('[data-testid="completed-check"]')).toBeInTheDocument()
  })

  it('renders a MiniDiff for edit tool result when expanded', async () => {
    const messages: Message[] = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'tool',
        tool_name: 'edit',
        tool_call_id: 'tc1',
        content: 'ok',
        metadata: JSON.stringify({
          is_error: false,
          result_metadata: {
            diff: {
              filepath: 'src/main.ts',
              additions: 2,
              deletions: 1,
            },
          },
        }),
        created_at: Date.now(),
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: '',
        metadata: JSON.stringify({
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'edit', arguments: '{"path":"src/main.ts"}' },
            },
          ],
        }),
        created_at: Date.now() + 1,
      },
    ]
    setMockState({ isStreaming: false, messages })
    render(<AIViewPanel />)
    const item = screen.getByTestId('work-item-tc-tc1')
    await userEvent.click(item)
    expect(screen.getByTestId('mini-diff')).toBeInTheDocument()
    expect(screen.getByTestId('mini-diff')).toHaveTextContent('src/main.ts')
  })

  it('renders ResultPreview image thumbnail for write_file result', async () => {
    const messages: Message[] = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'tool',
        tool_name: 'write_file',
        tool_call_id: 'tc1',
        content: 'image data',
        metadata: JSON.stringify({
          is_error: false,
          result_metadata: {
            diff: {
              filepath: 'assets/preview.png',
              additions: 1,
              deletions: 0,
            },
            preview_image: 'data:image/png;base64,AAA',
          },
        }),
        created_at: Date.now(),
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: '',
        metadata: JSON.stringify({
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'write_file', arguments: '{"path":"assets/preview.png"}' },
            },
          ],
        }),
        created_at: Date.now() + 1,
      },
    ]
    setMockState({ isStreaming: false, messages })
    render(<AIViewPanel />)
    const item = screen.getByTestId('work-item-tc-tc1')
    await userEvent.click(item)
    expect(screen.getByTestId('result-preview-image')).toBeInTheDocument()
    expect(screen.getByTestId('result-preview-image')).toHaveAttribute('src', 'data:image/png;base64,AAA')
  })

  it('renders collapsible code block for non-image result', async () => {
    const messages: Message[] = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'tool',
        tool_name: 'run_command',
        tool_call_id: 'tc1',
        content: 'hello world',
        metadata: JSON.stringify({
          is_error: false,
          result_metadata: {
            command: { command: 'echo hello' },
          },
        }),
        created_at: Date.now(),
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: '',
        metadata: JSON.stringify({
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'run_command', arguments: '{"command":"echo hello"}' },
            },
          ],
        }),
        created_at: Date.now() + 1,
      },
    ]
    setMockState({ isStreaming: false, messages })
    render(<AIViewPanel />)
    const item = screen.getByTestId('work-item-tc-tc1')
    await userEvent.click(item)
    expect(screen.getByTestId('result-preview-code')).toBeInTheDocument()
    expect(screen.getByTestId('result-preview-code')).toHaveTextContent('hello world')
  })

  it('renders MiniDiff with green added lines for write_file with patch', async () => {
    const messages: Message[] = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'tool',
        tool_name: 'write_file',
        tool_call_id: 'tc1',
        content: '已创建文件: hello.txt',
        metadata: JSON.stringify({
          is_error: false,
          result_metadata: {
            diff: {
              filepath: 'hello.txt',
              patch: '@@ -0,0 +1,3 @@\n+line1\n+line2\n+line3',
              additions: 3,
              deletions: 0,
            },
          },
        }),
        created_at: Date.now(),
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: '',
        metadata: JSON.stringify({
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'write_file', arguments: '{"path":"hello.txt","content":"line1\\nline2\\nline3"}' },
            },
          ],
        }),
        created_at: Date.now() + 1,
      },
    ]
    setMockState({ isStreaming: false, messages })
    render(<AIViewPanel />)
    const item = screen.getByTestId('work-item-tc-tc1')
    await userEvent.click(item)
    const diff = screen.getByTestId('mini-diff')
    expect(diff).toBeInTheDocument()
    expect(diff).toHaveTextContent('hello.txt')
    expect(diff).toHaveTextContent('创建')
    expect(diff).toHaveTextContent('+3')
    // 每行新增内容都应出现
    expect(diff).toHaveTextContent('line1')
    expect(diff).toHaveTextContent('line2')
    expect(diff).toHaveTextContent('line3')
  })

  it('renders MiniDiff with red removed and green added lines for edit with patch', async () => {
    const messages: Message[] = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'tool',
        tool_name: 'edit',
        tool_call_id: 'tc1',
        content: '已更新文件: src/main.ts (+1 -1)',
        metadata: JSON.stringify({
          is_error: false,
          result_metadata: {
            diff: {
              filepath: 'src/main.ts',
              patch: '@@ -1,2 +1,2 @@\n old line\n-bad line\n+new line',
              additions: 1,
              deletions: 1,
            },
          },
        }),
        created_at: Date.now(),
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: '',
        metadata: JSON.stringify({
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'edit', arguments: '{"path":"src/main.ts","oldString":"old line\\nbad line","newString":"old line\\nnew line"}' },
            },
          ],
        }),
        created_at: Date.now() + 1,
      },
    ]
    setMockState({ isStreaming: false, messages })
    render(<AIViewPanel />)
    const item = screen.getByTestId('work-item-tc-tc1')
    await userEvent.click(item)
    const diff = screen.getByTestId('mini-diff')
    expect(diff).toHaveTextContent('src/main.ts')
    expect(diff).toHaveTextContent('编辑')
    expect(diff).toHaveTextContent('+1')
    expect(diff).toHaveTextContent('-1')
    // 删除的行和新增的行都应出现
    expect(diff).toHaveTextContent('bad line')
    expect(diff).toHaveTextContent('new line')
    // 上下文行也应出现
    expect(diff).toHaveTextContent('old line')
  })

  it('renders file info card without diff for read_file', async () => {
    const messages: Message[] = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'tool',
        tool_name: 'read_file',
        tool_call_id: 'tc1',
        content: 'file contents here',
        metadata: JSON.stringify({
          is_error: false,
        }),
        created_at: Date.now(),
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: '',
        metadata: JSON.stringify({
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path":"src/main.ts"}' },
            },
          ],
        }),
        created_at: Date.now() + 1,
      },
    ]
    setMockState({ isStreaming: false, messages })
    render(<AIViewPanel />)
    const item = screen.getByTestId('work-item-tc-tc1')
    await userEvent.click(item)
    const diff = screen.getByTestId('mini-diff')
    expect(diff).toHaveTextContent('src/main.ts')
    expect(diff).toHaveTextContent('读取')
  })

  it('supports collapsing and expanding MiniDiff body via toggle', async () => {
    const messages: Message[] = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'tool',
        tool_name: 'write_file',
        tool_call_id: 'tc1',
        content: 'ok',
        metadata: JSON.stringify({
          is_error: false,
          result_metadata: {
            diff: {
              filepath: 'hello.txt',
              patch: '@@ -0,0 +1,2 @@\n+alpha\n+beta',
              additions: 2,
              deletions: 0,
            },
          },
        }),
        created_at: Date.now(),
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: '',
        metadata: JSON.stringify({
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'write_file', arguments: '{"path":"hello.txt","content":"alpha\\nbeta"}' },
            },
          ],
        }),
        created_at: Date.now() + 1,
      },
    ]
    setMockState({ isStreaming: false, messages })
    const user = userEvent.setup()
    render(<AIViewPanel />)
    const item = screen.getByTestId('work-item-tc-tc1')
    await user.click(item)
    const diff = screen.getByTestId('mini-diff')
    // diff 内容可见
    expect(diff).toHaveTextContent('alpha')
    expect(diff).toHaveTextContent('beta')
    // 点击折叠按钮
    const toggle = screen.getByTestId('mini-diff-toggle')
    await user.click(toggle)
    // 折叠后 diff 内容不可见（但仍可见文件头）
    expect(screen.getByTestId('mini-diff')).toHaveTextContent('hello.txt')
    expect(screen.getByTestId('mini-diff')).not.toHaveTextContent('alpha')
    expect(screen.getByTestId('mini-diff')).not.toHaveTextContent('beta')
    // 再次点击展开
    await user.click(toggle)
    expect(screen.getByTestId('mini-diff')).toHaveTextContent('alpha')
  })

  it('shows file operation stats in WorkItem header', async () => {
    const messages: Message[] = [
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'tool',
        tool_name: 'edit',
        tool_call_id: 'tc1',
        content: 'ok',
        metadata: JSON.stringify({
          is_error: false,
          result_metadata: {
            diff: {
              filepath: 'src/main.ts',
              patch: '@@ -1,1 +1,2 @@\n-old\n+new\n+extra',
              additions: 2,
              deletions: 1,
            },
          },
        }),
        created_at: Date.now(),
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: '',
        metadata: JSON.stringify({
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'edit', arguments: '{"path":"src/main.ts","oldString":"old","newString":"new\\nextra"}' },
            },
          ],
        }),
        created_at: Date.now() + 1,
      },
    ]
    setMockState({ isStreaming: false, messages })
    render(<AIViewPanel />)
    const item = screen.getByTestId('work-item-tc-tc1')
    // 未展开时就应显示 +2 -1 统计
    expect(item).toHaveTextContent('+2')
    expect(item).toHaveTextContent('-1')
  })

  // ─── 实时跟随：逐行代码渲染 ───────────────────────────────

  it('实时跟随：文件操作运行时不自动切换到编辑器标签（保持在实时跟随）', () => {
    setMockState({
      isStreaming: true,
      toolCalls: {
        tc1: {
          toolCallId: 'tc1',
          name: 'write_file',
          args: '{"path":"hello.html"}',
          status: 'running',
          startedAt: Date.now(),
        },
      },
    })
    render(<AIViewPanel />)
    // 默认 tab 应为实时跟随，且不应因文件操作运行而切走
    const liveTab = screen.getByText('实时跟随')
    expect(liveTab).toBeInTheDocument()
    // 实时跟随 tab 按钮应有 active 样式（text-text-primary）
    expect(liveTab.className).toContain('text-text-primary')
  })

  it('实时跟随：AI 流式输出时逐行渲染代码（带行号）', () => {
    const html = '<!DOCTYPE html>\n<html>\n<head>\n<title>Test</title>\n</head>\n<body>\n<h1>Hello</h1>\n</body>\n</html>'
    setMockState({
      isStreaming: true,
      streamingContent: html,
      streamingThinking: '',
    })
    render(<AIViewPanel />)
    // 应渲染 code-line 容器
    const lines = document.querySelectorAll('[data-testid="live-code-line"]')
    expect(lines.length).toBeGreaterThan(0)
    // 行数应等于内容行数
    const expectedLines = html.split('\n').length
    expect(lines.length).toBe(expectedLines)
    // 每行应包含行号
    const firstLine = lines[0] as HTMLElement
    expect(firstLine.textContent ?? '').toContain('1')
  })

  it('实时跟随：显示全部流式内容，不截断为最后 400 字符', () => {
    // 构造超过 400 字符的内容
    const longLine = 'A'.repeat(100)
    const lines: string[] = []
    for (let i = 0; i < 6; i++) lines.push(`line-${i}-${longLine}`)
    const full = lines.join('\n')
    expect(full.length).toBeGreaterThan(400)

    setMockState({
      isStreaming: true,
      streamingContent: full,
      streamingThinking: '',
    })
    render(<AIViewPanel />)
    const lineEls = document.querySelectorAll('[data-testid="live-code-line"]')
    expect(lineEls.length).toBe(6)
    // 第一行内容应可见（未被截断）
    expect(lineEls[0].textContent ?? '').toContain('line-0-')
    // 最后一行也应可见
    expect(lineEls[5].textContent ?? '').toContain('line-5-')
  })

  it('实时跟随：无内容时显示思考中指示', () => {
    setMockState({
      isStreaming: true,
      streamingContent: '',
      streamingThinking: '正在思考解决方案...',
    })
    render(<AIViewPanel />)
    // 思考内容应逐行显示
    const lines = document.querySelectorAll('[data-testid="live-code-line"]')
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].textContent ?? '').toContain('正在思考解决方案')
  })
})
