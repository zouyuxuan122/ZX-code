# 九宫格新面板实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在九宫格界面新增 6 个面板：浏览器预览、时间、天气、Token 热力图、Skill/MCP 列表、AI 待办清单（投屏暂缓）。

**Architecture:** Store 驱动 + Record 映射。每个新面板需在 3 处注册：`gridStore.ts`（PanelType 联合类型 + UNIQUE_PANELS 判断是否唯一）、`GridSlot.tsx`（PANEL_COMPONENTS Record）、`GridPanelPlaceholder.tsx`（PANEL_OPTIONS 菜单）。新面板组件放 `src/renderer/src/components/grid/panels/`。热力图需新建主进程统计表 + IPC。

**Tech Stack:** React + Zustand + framer-motion + lucide-react + Tailwind；Electron IPC（preload + main）；SQLite（better-sqlite3）用于热力图统计表。

---

## 文件结构

### 新增文件
- `src/renderer/src/components/grid/panels/BrowserPreviewPanel.tsx` — 浏览器预览（iframe srcDoc 加载本地 HTML）
- `src/renderer/src/components/grid/panels/ClockPanel.tsx` — 时间显示
- `src/renderer/src/components/grid/panels/WeatherPanel.tsx` — 天气（wttr.in，可配置城市）
- `src/renderer/src/components/grid/panels/UsageHeatmapPanel.tsx` — Token 热力图（GitHub 风格日历）
- `src/renderer/src/components/grid/panels/ExtensionsPanel.tsx` — Skill + MCP 列表（Tab 切换）
- `src/renderer/src/components/grid/panels/TodoPanel.tsx` — AI 待办清单（只读）
- `src/renderer/src/stores/usageStatsStore.ts` — 热力图统计 store
- `src/main/services/usage-stats.service.ts` — 主进程统计服务（SQLite）
- `src/shared/types/usage.ts` — 统计类型定义
- 各面板对应测试文件

### 修改文件
- `src/renderer/src/stores/gridStore.ts` — PanelType 扩展
- `src/renderer/src/components/grid/GridSlot.tsx` — PANEL_COMPONENTS 映射
- `src/renderer/src/components/grid/GridPanelPlaceholder.tsx` — PANEL_OPTIONS 菜单
- `src/shared/types/settings.ts` — 新增 'usage' category（热力图配置）
- `src/shared/types/ipc.ts` — 新增 UsageStatsApi
- `src/preload/api.ts` — 暴露 usage IPC
- `src/main/ipc/usage.ipc.ts`（新建）— 注册 usage IPC handlers
- `src/main/index.ts` — 注册 usage IPC
- `src/main/services/agent/engine.ts` 或完成回调处 — 记录 token 用量

---

## Task 0: 架构注册（PanelType + 映射 + 菜单）

**Files:**
- Modify: `src/renderer/src/stores/gridStore.ts`
- Modify: `src/renderer/src/components/grid/GridSlot.tsx`
- Modify: `src/renderer/src/components/grid/GridPanelPlaceholder.tsx`
- Test: `src/renderer/src/__tests__/stores/gridStore.test.ts`
- Test: `src/renderer/src/__tests__/components/grid/GridPanelPlaceholder.test.tsx`

- [ ] **Step 1: 扩展 PanelType**

`src/renderer/src/stores/gridStore.ts` line 4：
```ts
export type PanelType = 'chat' | 'aiView' | 'pet' | 'browser' | 'clock' | 'weather' | 'heatmap' | 'extensions' | 'todo' | null
```
注意：新面板不加入 `UNIQUE_PANELS`（允许同类型多实例，如多个浏览器预览）。

- [ ] **Step 2: 写失败测试 — GridPanelPlaceholder 菜单含 6 个新选项**

在 `GridPanelPlaceholder.test.tsx`（若不存在则新建）中：
```tsx
it('菜单应包含 9 个面板选项（3 旧 + 6 新）', async () => {
  render(<GridPanelPlaceholder index={0} />)
  fireEvent.click(screen.getByRole('button', { name: '添加面板' }))
  const items = await screen.findAllByRole('button')
  const labels = items.map((b) => b.textContent)
  expect(labels).toEqual(expect.arrayContaining(['对话', '实时AI视图', '宠物窗口', '浏览器预览', '时钟', '天气', 'Token热力图', '扩展(Skill/MCP)', 'AI待办']))
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/renderer/src/__tests__/components/grid/GridPanelPlaceholder.test.tsx`
Expected: FAIL（菜单只有 3 项）

- [ ] **Step 4: 更新 PANEL_OPTIONS**

`src/renderer/src/components/grid/GridPanelPlaceholder.tsx` line 11-15：
```tsx
const PANEL_OPTIONS: { type: PanelType; label: string }[] = [
  { type: 'chat', label: '对话' },
  { type: 'aiView', label: '实时AI视图' },
  { type: 'pet', label: '宠物窗口' },
  { type: 'browser', label: '浏览器预览' },
  { type: 'clock', label: '时钟' },
  { type: 'weather', label: '天气' },
  { type: 'heatmap', label: 'Token热力图' },
  { type: 'extensions', label: '扩展(Skill/MCP)' },
  { type: 'todo', label: 'AI待办' },
]
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/renderer/src/__tests__/components/grid/GridPanelPlaceholder.test.tsx`
Expected: PASS

- [ ] **Step 6: 更新 PANEL_COMPONENTS（先占位，组件后续 Task 创建）**

`src/renderer/src/components/grid/GridSlot.tsx` line 24-28，临时用占位组件：
```tsx
import { BrowserPreviewPanel } from './panels/BrowserPreviewPanel'
import { ClockPanel } from './panels/ClockPanel'
import { WeatherPanel } from './panels/WeatherPanel'
import { UsageHeatmapPanel } from './panels/UsageHeatmapPanel'
import { ExtensionsPanel } from './panels/ExtensionsPanel'
import { TodoPanel } from './panels/TodoPanel'

const PANEL_COMPONENTS: Record<string, React.ComponentType> = {
  chat: ChatPanel,
  aiView: AIViewPanel,
  pet: PetPanel,
  browser: BrowserPreviewPanel,
  clock: ClockPanel,
  weather: WeatherPanel,
  heatmap: UsageHeatmapPanel,
  extensions: ExtensionsPanel,
  todo: TodoPanel,
}
```

- [ ] **Step 7: 创建 6 个占位组件文件**

每个文件内容相同模式（以 ClockPanel 为例）：
```tsx
export function ClockPanel() {
  return <div className="flex h-full items-center justify-center text-text-tertiary text-xs">时钟</div>
}
```
对其余 5 个面板同理（BrowserPreviewPanel/WeatherPanel/UsageHeatmapPanel/ExtensionsPanel/TodoPanel）。

- [ ] **Step 8: 运行全部测试 + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(grid): 注册 6 个新面板类型到九宫格架构"
```

---

## Task 1: ClockPanel（时钟）

**Files:**
- Modify: `src/renderer/src/components/grid/panels/ClockPanel.tsx`
- Test: `src/renderer/src/__tests__/components/grid/panels/ClockPanel.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ClockPanel } from '@/components/grid/panels/ClockPanel'

describe('ClockPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-09T14:30:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('显示当前时间 HH:MM', () => {
    render(<ClockPanel />)
    expect(screen.getByTestId('clock-time')).toHaveTextContent('14:30')
  })

  it('显示当前日期与星期', () => {
    render(<ClockPanel />)
    expect(screen.getByTestId('clock-date')).toHaveTextContent(/7月.*09.*星期四/)
  })

  it('每秒更新时间', () => {
    render(<ClockPanel />)
    expect(screen.getByTestId('clock-time')).toHaveTextContent('14:30')
    act(() => { vi.advanceTimersByTime(65000) })
    expect(screen.getByTestId('clock-time')).toHaveTextContent('14:31')
  })
})
```

- [ ] **Step 2: 运行确认失败** → Run: `npx vitest run src/renderer/src/__tests__/components/grid/panels/ClockPanel.test.tsx` → FAIL

- [ ] **Step 3: 实现 ClockPanel**

```tsx
import { useState, useEffect } from 'react'

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function ClockPanel() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const month = now.getMonth() + 1
  const day = String(now.getDate()).padStart(2, '0')
  const weekday = WEEKDAYS[now.getDay()]

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 bg-bg-primary">
      <div data-testid="clock-time" className="text-4xl font-light tabular-nums text-text-primary">
        {hh}:{mm}
        <span className="ml-1 text-lg text-text-tertiary">{ss}</span>
      </div>
      <div data-testid="clock-date" className="text-xs text-text-secondary">
        {month}月{day}日 · {weekday}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行确认通过** → PASS
- [ ] **Step 5: Commit** → `feat(grid): 添加时钟面板`

---

## Task 2: TodoPanel（AI 待办清单）

**Files:**
- Modify: `src/renderer/src/components/grid/panels/TodoPanel.tsx`
- Test: `src/renderer/src/__tests__/components/grid/panels/TodoPanel.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodoPanel } from '@/components/grid/panels/TodoPanel'
import { useChatStore } from '@/stores/chatStore'

beforeEach(() => {
  useChatStore.setState({ todos: [], currentTaskName: null })
})

describe('TodoPanel', () => {
  it('无待办时显示空状态', () => {
    render(<TodoPanel />)
    expect(screen.getByText(/暂无待办/)).toBeInTheDocument()
  })

  it('展示待办列表，按状态着色', () => {
    useChatStore.setState({
      todos: [
        { id: '1', content: '完成 API', status: 'completed', priority: 'high' },
        { id: '2', content: '写测试', status: 'in_progress', priority: 'high' },
        { id: '3', content: '文档', status: 'pending', priority: 'low' },
      ],
    })
    render(<TodoPanel />)
    expect(screen.getByText('完成 API')).toBeInTheDocument()
    expect(screen.getByText('写测试')).toBeInTheDocument()
    expect(screen.getByText('文档')).toBeInTheDocument()
    // in_progress 项应有高亮
    expect(screen.getByText('写测试').closest('[data-todo-item]')).toHaveClass('bg-accent-blue/10')
  })

  it('显示进度统计（已完成/总数）', () => {
    useChatStore.setState({
      todos: [
        { id: '1', content: 'a', status: 'completed', priority: 'high' },
        { id: '2', content: 'b', status: 'pending', priority: 'low' },
      ],
    })
    render(<TodoPanel />)
    expect(screen.getByTestId('todo-progress')).toHaveTextContent('1/2')
  })
})
```

- [ ] **Step 2: 运行确认失败** → FAIL
- [ ] **Step 3: 实现 TodoPanel**

```tsx
import { useChatStore } from '@/stores/chatStore'
import { Check, Circle, Clock, Loader } from 'lucide-react'
import { cn } from '@/utils/cn'

const STATUS_CONFIG = {
  completed: { icon: Check, color: 'text-state-success', bg: '' },
  in_progress: { icon: Loader, color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
  pending: { icon: Circle, color: 'text-text-tertiary', bg: '' },
  cancelled: { icon: Clock, color: 'text-text-tertiary', bg: 'opacity-50' },
} as const

export function TodoPanel() {
  const todos = useChatStore((s) => s.todos)

  const completed = todos.filter((t) => t.status === 'completed').length

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 flex-shrink-0 items-center justify-between border-b border-border-default/30 px-2.5">
        <span className="text-[11px] font-medium text-text-tertiary">AI 待办</span>
        {todos.length > 0 && (
          <span data-testid="todo-progress" className="text-[10px] text-text-tertiary">
            {completed}/{todos.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
        {todos.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-text-tertiary/60">
            暂无待办
          </div>
        ) : (
          todos.map((todo) => {
            const cfg = STATUS_CONFIG[todo.status]
            const Icon = cfg.icon
            return (
              <div
                key={todo.id}
                data-todo-item
                className={cn(
                  'flex items-center gap-2 rounded px-2 py-1.5 text-[12px]',
                  cfg.bg,
                )}
              >
                <Icon className={cn('h-3 w-3 flex-shrink-0', cfg.color)} />
                <span className={cn('flex-1 truncate', todo.status === 'completed' && 'line-through text-text-tertiary')}>
                  {todo.content}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行确认通过** → PASS
- [ ] **Step 5: Commit** → `feat(grid): 添加 AI 待办面板`

---

## Task 3: ExtensionsPanel（Skill + MCP 列表）

**Files:**
- Modify: `src/renderer/src/components/grid/panels/ExtensionsPanel.tsx`
- Test: `src/renderer/src/__tests__/components/grid/panels/ExtensionsPanel.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExtensionsPanel } from '@/components/grid/panels/ExtensionsPanel'

vi.mock('@/services/ipc', () => ({
  ipc: {
    mcp: {
      listServers: vi.fn().mockResolvedValue([
        { id: 'm1', name: 'filesystem', type: 'local', enabled: true, command: 'npx' },
        { id: 'm2', name: 'github', type: 'remote', enabled: false, url: 'https://...' },
      ]),
      listStatus: vi.fn().mockResolvedValue([
        { id: 'm1', name: 'filesystem', connected: true, toolCount: 5 },
        { id: 'm2', name: 'github', connected: false, toolCount: 0 },
      ]),
    },
    scl: {
      list: vi.fn().mockResolvedValue([
        { id: 's1', name: 'TDD', description: '测试驱动', category: 'testing', enabled: true, icon: '🧪' },
        { id: 's2', name: 'Code Review', description: '代码审查', category: 'review', enabled: false, icon: '🔍' },
      ]),
    },
  },
}))

describe('ExtensionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('默认显示 Skill 列表', async () => {
    render(<ExtensionsPanel />)
    await waitFor(() => {
      expect(screen.getByText('TDD')).toBeInTheDocument()
      expect(screen.getByText('Code Review')).toBeInTheDocument()
    })
  })

  it('切换到 MCP Tab 显示服务器列表', async () => {
    render(<ExtensionsPanel />)
    await waitFor(() => expect(screen.getByText('TDD')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /MCP/ }))
    await waitFor(() => {
      expect(screen.getByText('filesystem')).toBeInTheDocument()
      expect(screen.getByText('github')).toBeInTheDocument()
    })
  })

  it('MCP 项显示连接状态和工具数', async () => {
    render(<ExtensionsPanel />)
    await waitFor(() => expect(screen.getByText('TDD')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /MCP/ }))
    await waitFor(() => expect(screen.getByText('filesystem')).toBeInTheDocument())
    expect(screen.getByText(/5.*工具/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行确认失败** → FAIL
- [ ] **Step 3: 实现 ExtensionsPanel**

```tsx
import { useState, useEffect } from 'react'
import { ipc } from '@/services/ipc'
import type { McpServerConfig, McpServerStatus } from '@shared/types/mcp'
import type { SclExtension } from '@shared/types/scl'
import { cn } from '@/utils/cn'

type Tab = 'skill' | 'mcp'

export function ExtensionsPanel() {
  const [tab, setTab] = useState<Tab>('skill')
  const [skills, setSkills] = useState<SclExtension[]>([])
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [statuses, setStatuses] = useState<McpServerStatus[]>([])

  useEffect(() => {
    void ipc.scl.list().then(setSkills)
  }, [])

  useEffect(() => {
    if (tab !== 'mcp') return
    void Promise.all([ipc.mcp.listServers(), ipc.mcp.listStatus()]).then(([s, st]) => {
      setServers(s)
      setStatuses(st)
    })
  }, [tab])

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 flex-shrink-0 border-b border-border-default/30">
        {(['skill', 'mcp'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 text-[11px] font-medium transition-colors',
              tab === t ? 'text-text-primary border-b border-accent-blue' : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            {t === 'skill' ? `Skill (${skills.length})` : 'MCP'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
        {tab === 'skill' &&
          skills.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40">
              <span className="text-base">{s.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-text-primary">{s.name}</div>
                <div className="truncate text-[10px] text-text-tertiary">{s.description}</div>
              </div>
              <span className={cn('h-1.5 w-1.5 rounded-full', s.enabled ? 'bg-state-success' : 'bg-text-tertiary/40')} />
            </div>
          ))}
        {tab === 'mcp' &&
          servers.map((srv) => {
            const st = statuses.find((x) => x.id === srv.id)
            return (
              <div key={srv.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40">
                <span className={cn('h-1.5 w-1.5 rounded-full', st?.connected ? 'bg-state-success' : 'bg-text-tertiary/40')} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-text-primary">{srv.name}</div>
                  <div className="text-[10px] text-text-tertiary">
                    {srv.type === 'local' ? '本地' : '远程'} · {st?.toolCount ?? 0} 工具
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行确认通过** → PASS
- [ ] **Step 5: Commit** → `feat(grid): 添加 Skill/MCP 扩展面板`

---

## Task 4: BrowserPreviewPanel（浏览器预览）

**Files:**
- Modify: `src/renderer/src/components/grid/panels/BrowserPreviewPanel.tsx`
- Modify: `src/preload/api.ts` — 新增 `file.readAbsoluteContent`
- Modify: `src/main/ipc/` — 注册 handler
- Test: `src/renderer/src/__tests__/components/grid/panels/BrowserPreviewPanel.test.tsx`

- [ ] **Step 1: 新增 file.readAbsoluteContent IPC**

`src/preload/api.ts` file 对象添加：
```ts
readAbsoluteContent: (absolutePath: string) =>
  ipcRenderer.invoke('file:readAbsoluteContent', absolutePath),
```

主进程注册（在现有 file IPC handler 文件中添加）：
```ts
ipcMain.handle('file:readAbsoluteContent', async (_event, absolutePath: string) => {
  const fs = await import('fs/promises')
  return fs.readFile(absolutePath, 'utf-8')
})
```

- [ ] **Step 2: 写失败测试**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const readAbsoluteContentMock = vi.fn()
const selectFileMock = vi.fn()

vi.mock('@/services/ipc', () => ({
  ipc: {
    file: {
      selectFile: selectFileMock,
      readAbsoluteContent: readAbsoluteContentMock,
    },
  },
}))

import { BrowserPreviewPanel } from '@/components/grid/panels/BrowserPreviewPanel'

describe('BrowserPreviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectFileMock.mockResolvedValue(null)
    readAbsoluteContentMock.mockResolvedValue('')
  })

  it('初始显示打开文件按钮', () => {
    render(<BrowserPreviewPanel />)
    expect(screen.getByText('选择 HTML 文件')).toBeInTheDocument()
  })

  it('选择文件后加载内容到 iframe srcDoc', async () => {
    selectFileMock.mockResolvedValue('C:/test/index.html')
    readAbsoluteContentMock.mockResolvedValue('<h1>Hello</h1>')
    render(<BrowserPreviewPanel />)
    fireEvent.click(screen.getByText('选择 HTML 文件'))
    await waitFor(() => {
      const iframe = screen.getByTestId('preview-iframe') as HTMLIFrameElement
      expect(iframe.srcdoc).toContain('<h1>Hello</h1>')
    })
  })

  it('显示当前文件路径', async () => {
    selectFileMock.mockResolvedValue('C:/test/index.html')
    readAbsoluteContentMock.mockResolvedValue('<h1>Hi</h1>')
    render(<BrowserPreviewPanel />)
    fireEvent.click(screen.getByText('选择 HTML 文件'))
    await waitFor(() => {
      expect(screen.getByTestId('preview-path')).toHaveTextContent('index.html')
    })
  })
})
```

- [ ] **Step 3: 运行确认失败** → FAIL

- [ ] **Step 4: 实现 BrowserPreviewPanel**

```tsx
import { useState, useCallback } from 'react'
import { FolderOpen, RefreshCw } from 'lucide-react'
import { ipc } from '@/services/ipc'

export function BrowserPreviewPanel() {
  const [html, setHtml] = useState<string | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleOpen = useCallback(async () => {
    const selected = await ipc.file.selectFile({
      filters: [{ name: '网页', extensions: ['html', 'htm'] }],
    })
    if (!selected) return
    setLoading(true)
    try {
      const content = await ipc.file.readAbsoluteContent(selected)
      setHtml(content)
      setPath(selected)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    if (!path) return
    const content = await ipc.file.readAbsoluteContent(path)
    setHtml(content)
  }, [path])

  if (!html) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-bg-primary">
        <button
          type="button"
          onClick={() => void handleOpen()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-secondary"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          选择 HTML 文件
        </button>
      </div>
    )
  }

  const fileName = path?.split(/[\\/]/).pop() ?? ''

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 flex-shrink-0 items-center gap-1.5 border-b border-border-default/30 px-2">
        <span data-testid="preview-path" className="flex-1 truncate text-[11px] text-text-tertiary">{fileName}</span>
        <button onClick={() => void handleRefresh()} className="text-text-tertiary hover:text-text-secondary" title="刷新">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      <iframe
        data-testid="preview-iframe"
        title="preview"
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
        className="flex-1 border-0 bg-white"
      />
    </div>
  )
}
```

- [ ] **Step 5: 运行确认通过** → PASS
- [ ] **Step 6: Commit** → `feat(grid): 添加浏览器预览面板`

---

## Task 5: WeatherPanel（天气）

**Files:**
- Modify: `src/renderer/src/components/grid/panels/WeatherPanel.tsx`
- Test: `src/renderer/src/__tests__/components/grid/panels/WeatherPanel.test.tsx`

说明：使用 wttr.in 免费天气 API（无需 key，支持中文城市）。城市可通过设置持久化（key: `weather.city`）。

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('@/services/ipc', () => ({
  ipc: {
    settings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

import { WeatherPanel } from '@/components/grid/panels/WeatherPanel'

describe('WeatherPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        current_condition: [{
          temp_C: '25',
          humidity: '60',
          weatherCode: ['113'],
          lang_zh: [{ value: '晴' }],
        }],
        nearest_area: [{ areaName: [{ value: '北京' }] }],
      }),
    })
  })

  it('加载并显示天气信息', async () => {
    render(<WeatherPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('weather-temp')).toHaveTextContent('25°')
      expect(screen.getByTestId('weather-desc')).toHaveTextContent('晴')
      expect(screen.getByTestId('weather-city')).toHaveTextContent('北京')
    })
  })

  it('显示湿度', async () => {
    render(<WeatherPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('weather-humidity')).toHaveTextContent('60%')
    })
  })

  it('加载失败时显示错误提示', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    render(<WeatherPanel />)
    await waitFor(() => {
      expect(screen.getByText(/加载失败/)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: 运行确认失败** → FAIL

- [ ] **Step 3: 实现 WeatherPanel**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { ipc } from '@/services/ipc'
import { Cloud, Droplets, MapPin, RefreshCw } from 'lucide-react'

interface WeatherData {
  temp: string
  desc: string
  humidity: string
  city: string
}

export function WeatherPanel() {
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [city, setCity] = useState('北京')

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const savedCity = (await ipc.settings.get('weather.city')) as string | null
      const useCity = savedCity || city
      setCity(useCity)
      const res = await fetch(`https://wttr.in/${encodeURIComponent(useCity)}?format=j1&lang=zh`)
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      const cur = json.current_condition?.[0]
      if (!cur) throw new Error('no data')
      setData({
        temp: cur.temp_C,
        desc: cur.lang_zh?.[0]?.value ?? cur.weatherDesc?.[0]?.value ?? '',
        humidity: cur.humidity,
        city: json.nearest_area?.[0]?.areaName?.[0]?.value ?? useCity,
      })
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [city])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 10 * 60 * 1000) // 10 分钟刷新
    return () => clearInterval(timer)
  }, [load])

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 flex-shrink-0 items-center justify-between border-b border-border-default/30 px-2.5">
        <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
          <Cloud className="h-3 w-3" /> 天气
        </span>
        <button onClick={() => void load()} className="text-text-tertiary hover:text-text-secondary">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-state-error">加载失败</div>
      ) : !data ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-text-tertiary">加载中...</div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <div data-testid="weather-temp" className="text-4xl font-light text-text-primary">{data.temp}°</div>
          <div data-testid="weather-desc" className="text-sm text-text-secondary">{data.desc}</div>
          <div data-testid="weather-city" className="flex items-center gap-1 text-[11px] text-text-tertiary">
            <MapPin className="h-3 w-3" /> {data.city}
          </div>
          <div data-testid="weather-humidity" className="flex items-center gap-1 text-[11px] text-text-tertiary">
            <Droplets className="h-3 w-3" /> {data.humidity}%
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 运行确认通过** → PASS
- [ ] **Step 5: Commit** → `feat(grid): 添加天气面板`

---

## Task 6: UsageHeatmapPanel（Token 热力图）— 后端

**Files:**
- Create: `src/shared/types/usage.ts`
- Create: `src/main/services/usage-stats.service.ts`
- Create: `src/main/ipc/usage.ipc.ts`
- Modify: `src/shared/types/ipc.ts` — 新增 UsageStatsApi
- Modify: `src/preload/api.ts` — 暴露 usage
- Modify: `src/main/index.ts` — 注册 usage IPC
- Modify: 对话完成回调处（`conversation.service.ts` 或 `engine.ts`）— 记录用量
- Modify: `src/shared/types/settings.ts` — 新增 'usage' category

- [ ] **Step 1: 定义类型**

`src/shared/types/usage.ts`:
```ts
/** 单日统计 */
export interface DailyUsageStat {
  /** 日期 YYYY-MM-DD */
  date: string
  /** 当日总 token */
  tokens: number
  /** 当日调用次数 */
  calls: number
  /** 当日 prompt token */
  promptTokens: number
  /** 当日 completion token */
  completionTokens: number
}

/** 记录一次对话完成的用量 */
export interface UsageRecord {
  conversationId: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  timestamp: number
}

export interface UsageStatsApi {
  /** 记录一次用量 */
  record: (record: UsageRecord) => Promise<void>
  /** 获取最近 N 天的每日统计（用于热力图） */
  getDailyStats: (days: number) => Promise<DailyUsageStat[]>
  /** 获取今日汇总 */
  getTodaySummary: () => Promise<DailyUsageStat | null>
}
```

`src/shared/types/settings.ts` SettingCategory 添加 `'usage'`。
`src/shared/types/ipc.ts` 添加 `usage: UsageStatsApi`。

- [ ] **Step 2: 实现主进程统计服务**

`src/main/services/usage-stats.service.ts`:
```ts
import { database } from './database'
import type { DailyUsageStat, UsageRecord } from '@shared/types/usage'

/** 初始化统计表 */
export function initUsageStatsTable() {
  const db = database.getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      conversation_id TEXT,
      model TEXT,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_stats(date);
  `)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function recordUsage(rec: UsageRecord): void {
  const db = database.getDb()
  const date = new Date(rec.timestamp).toISOString().slice(0, 10)
  db.prepare(
    `INSERT INTO usage_stats (date, conversation_id, model, prompt_tokens, completion_tokens, total_tokens, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(date, rec.conversationId, rec.model, rec.promptTokens, rec.completionTokens, rec.totalTokens, rec.timestamp)
}

export function getDailyStats(days: number): DailyUsageStat[] {
  const db = database.getDb()
  const rows = db.prepare(
    `SELECT date,
       SUM(total_tokens) as tokens,
       COUNT(*) as calls,
       SUM(prompt_tokens) as promptTokens,
       SUM(completion_tokens) as completionTokens
     FROM usage_stats
     WHERE date >= date('now', ?)
     GROUP BY date
     ORDER BY date ASC`,
  ).all(`-${days} days`) as Array<DailyUsageStat & { tokens: number; calls: number }>
  return rows.map((r) => ({
    date: r.date,
    tokens: r.tokens ?? 0,
    calls: r.calls ?? 0,
    promptTokens: r.promptTokens ?? 0,
    completionTokens: r.completionTokens ?? 0,
  }))
}

export function getTodaySummary(): DailyUsageStat | null {
  const db = database.getDb()
  const today = todayStr()
  const row = db.prepare(
    `SELECT date,
       SUM(total_tokens) as tokens,
       COUNT(*) as calls,
       SUM(prompt_tokens) as promptTokens,
       SUM(completion_tokens) as completionTokens
     FROM usage_stats WHERE date = ?`,
  ).get(today) as (DailyUsageStat & { tokens: number; calls: number }) | undefined
  if (!row || !row.calls) return null
  return {
    date: row.date,
    tokens: row.tokens ?? 0,
    calls: row.calls ?? 0,
    promptTokens: row.promptTokens ?? 0,
    completionTokens: row.completionTokens ?? 0,
  }
}
```

- [ ] **Step 3: 注册 IPC**

`src/main/ipc/usage.ipc.ts`:
```ts
import { ipcMain } from 'electron'
import { initUsageStatsTable, recordUsage, getDailyStats, getTodaySummary } from '../services/usage-stats.service'

export function registerUsageIpc() {
  initUsageStatsTable()
  ipcMain.handle('usage:record', async (_e, record) => { recordUsage(record) })
  ipcMain.handle('usage:getDailyStats', async (_e, days: number) => getDailyStats(days))
  ipcMain.handle('usage:getTodaySummary', async () => getTodaySummary())
}
```

`src/preload/api.ts` 添加：
```ts
usage: {
  record: (record) => ipcRenderer.invoke('usage:record', record),
  getDailyStats: (days) => ipcRenderer.invoke('usage:getDailyStats', days),
  getTodaySummary: () => ipcRenderer.invoke('usage:getTodaySummary'),
},
```

`src/main/index.ts` 注册：`registerUsageIpc()`（在数据库初始化后调用）。

- [ ] **Step 4: 在对话完成时记录用量**

找到 `src/main/services/conversation.service.ts` 中处理 `ChatCompletePayload` 的位置（约 line 417/439），在写入 `metadata.tokens` 后调用：
```ts
import { recordUsage } from './usage-stats.service'
// 完成回调中：
if (lastUsage?.total_tokens) {
  recordUsage({
    conversationId,
    model: lastModel ?? 'unknown',
    promptTokens: lastUsage.prompt_tokens ?? 0,
    completionTokens: lastUsage.completion_tokens ?? 0,
    totalTokens: lastUsage.total_tokens,
    timestamp: Date.now(),
  })
}
```

- [ ] **Step 5: 运行 typecheck** → `npm run typecheck` → PASS
- [ ] **Step 6: Commit** → `feat(usage): 新增 Token 用量统计表与 IPC`

---

## Task 7: UsageHeatmapPanel（Token 热力图）— 前端

**Files:**
- Create: `src/renderer/src/stores/usageStatsStore.ts`
- Modify: `src/renderer/src/components/grid/panels/UsageHeatmapPanel.tsx`
- Test: `src/renderer/src/__tests__/components/grid/panels/UsageHeatmapPanel.test.tsx`

- [ ] **Step 1: 创建 store**

`src/renderer/src/stores/usageStatsStore.ts`:
```ts
import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { DailyUsageStat } from '@shared/types/usage'

interface UsageStatsState {
  dailyStats: DailyUsageStat[]
  today: DailyUsageStat | null
  loading: boolean
  load: (days?: number) => Promise<void>
}

export const useUsageStatsStore = create<UsageStatsState>((set) => ({
  dailyStats: [],
  today: null,
  loading: false,
  load: async (days = 90) => {
    set({ loading: true })
    try {
      const [stats, today] = await Promise.all([
        ipc.usage.getDailyStats(days),
        ipc.usage.getTodaySummary(),
      ])
      set({ dailyStats: stats, today })
    } finally {
      set({ loading: false })
    }
  },
}))
```

- [ ] **Step 2: 写失败测试**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@/services/ipc', () => ({
  ipc: {
    usage: {
      getDailyStats: vi.fn().mockResolvedValue([
        { date: '2026-07-09', tokens: 5000, calls: 10, promptTokens: 3000, completionTokens: 2000 },
        { date: '2026-07-08', tokens: 3000, calls: 5, promptTokens: 2000, completionTokens: 1000 },
      ]),
      getTodaySummary: vi.fn().mockResolvedValue({ date: '2026-07-09', tokens: 5000, calls: 10, promptTokens: 3000, completionTokens: 2000 }),
    },
  },
}))

import { UsageHeatmapPanel } from '@/components/grid/panels/UsageHeatmapPanel'

describe('UsageHeatmapPanel', () => {
  it('显示今日汇总（token + 调用次数）', async () => {
    render(<UsageHeatmapPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('heatmap-today-tokens')).toHaveTextContent('5,000')
      expect(screen.getByTestId('heatmap-today-calls')).toHaveTextContent('10')
    })
  })

  it('渲染热力图格子', async () => {
    render(<UsageHeatmapPanel />)
    await waitFor(() => {
      const cells = document.querySelectorAll('[data-heatmap-cell]')
      expect(cells.length).toBeGreaterThan(0)
    })
  })

  it('格子颜色深浅反映 token 量', async () => {
    render(<UsageHeatmapPanel />)
    await waitFor(() => {
      const cells = document.querySelectorAll('[data-heatmap-cell]')
      expect(cells.length).toBeGreaterThan(0)
      // 有数据的格子应有背景色类
      const activeCells = Array.from(cells).filter((c) => c.getAttribute('data-level'))
      expect(activeCells.length).toBeGreaterThan(0)
    })
  })
})
```

- [ ] **Step 3: 运行确认失败** → FAIL

- [ ] **Step 4: 实现 UsageHeatmapPanel**

```tsx
import { useEffect, useMemo } from 'react'
import { useUsageStatsStore } from '@/stores/usageStatsStore'
import { Flame } from 'lucide-react'
import { cn } from '@/utils/cn'

/** 根据 token 量计算等级 0-4 */
function calcLevel(tokens: number, max: number): number {
  if (tokens === 0 || max === 0) return 0
  const ratio = tokens / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

const LEVEL_COLORS = [
  'bg-bg-tertiary/40',
  'bg-accent-blue/20',
  'bg-accent-blue/40',
  'bg-accent-blue/60',
  'bg-accent-blue/80',
]

export function UsageHeatmapPanel() {
  const dailyStats = useUsageStatsStore((s) => s.dailyStats)
  const today = useUsageStatsStore((s) => s.today)
  const load = useUsageStatsStore((s) => s.load)

  useEffect(() => {
    void load(90)
    const timer = setInterval(() => void load(90), 60 * 1000)
    return () => clearInterval(timer)
  }, [load])

  // 构建 90 天日历，补全无数据日期
  const calendar = useMemo(() => {
    const map = new Map(dailyStats.map((d) => [d.date, d]))
    const days: Array<{ date: string; tokens: number; calls: number }> = []
    const now = new Date()
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const stat = map.get(dateStr)
      days.push({ date: dateStr, tokens: stat?.tokens ?? 0, calls: stat?.calls ?? 0 })
    }
    return days
  }, [dailyStats])

  const maxTokens = useMemo(() => Math.max(...calendar.map((d) => d.tokens), 1), [calendar])

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 flex-shrink-0 items-center gap-1.5 border-b border-border-default/30 px-2.5">
        <Flame className="h-3 w-3 text-text-tertiary" />
        <span className="text-[11px] text-text-tertiary">Token 热力图</span>
      </div>
      {/* 今日汇总 */}
      {today && (
        <div className="flex flex-shrink-0 gap-3 border-b border-border-default/20 px-3 py-1.5">
          <div>
            <div data-testid="heatmap-today-tokens" className="text-lg font-semibold text-text-primary">
              {today.tokens.toLocaleString()}
            </div>
            <div className="text-[9px] text-text-tertiary">今日 Token</div>
          </div>
          <div>
            <div data-testid="heatmap-today-calls" className="text-lg font-semibold text-text-primary">
              {today.calls}
            </div>
            <div className="text-[9px] text-text-tertiary">今日调用</div>
          </div>
        </div>
      )}
      {/* 热力图网格：7 行（周）x 13 列（约 90 天） */}
      <div className="flex-1 overflow-auto p-2">
        <div className="grid grid-flow-col grid-rows-7 gap-0.5">
          {calendar.map((day) => {
            const level = calcLevel(day.tokens, maxTokens)
            return (
              <div
                key={day.date}
                data-heatmap-cell
                data-level={level || undefined}
                title={`${day.date}: ${day.tokens.toLocaleString()} tokens / ${day.calls} 次`}
                className={cn('h-2.5 w-2.5 rounded-sm', LEVEL_COLORS[level])}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 运行确认通过** → PASS
- [ ] **Step 6: Commit** → `feat(grid): 添加 Token 热力图面板`

---

## Task 8: 集成验证

- [ ] **Step 1: 运行全部测试** → `npx vitest run` → 全部 PASS
- [ ] **Step 2: 运行 typecheck** → `npm run typecheck` → 0 错误
- [ ] **Step 3: 运行 build** → `npm run build` → 成功
- [ ] **Step 4: Commit** → `test: 新面板集成验证通过`

---

## 自检清单

- [x] 6 个面板全覆盖（浏览器/时间/天气/热力图/扩展/待办）
- [x] 投屏暂缓（符合用户要求）
- [x] 热力图新建统计表（符合用户选择）
- [x] 待办仅展示 AI 待办（符合用户要求，只读 chatStore.todos）
- [x] 每个任务有完整代码、测试、commit
- [x] 类型一致性：PanelType 在所有文件中统一
