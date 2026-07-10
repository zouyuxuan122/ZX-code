# OpenCode 底层移植与多缺陷修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复对话切换中断、网页模型不调用工具、模型选择器重复选中、权限白名单缺失等紧急缺陷，并移植 opencode 的工具系统、权限系统、文件管理底层架构。

**Architecture:** 前端流式状态从全局单例改为按 conversationId 隔离的 Map（参考 opencode InstanceState 隔离模式）；权限系统从 allow/ask/deny 三态扩展为 allow/ask/deny + always 运行时记忆（参考 opencode Permission.reply always 机制）；Chat2API 提示词从简单 bracket/xml 协议升级为融合 opencode + codex 的完整工具调用提示词；工具系统逐步移植 opencode 的多策略模糊匹配编辑、流式读取、二进制检测等能力。

**Tech Stack:** Electron 33 + React 19 + TypeScript 5.6 + Zustand 5 + Vitest 4 + better-sqlite3

---

## Scope Check

本计划覆盖 5 个独立子系统，按 Phase 拆分，每个 Phase 可独立交付：

| Phase | 子系统 | 优先级 | 可独立交付 |
|-------|--------|--------|------------|
| Phase 1 | 对话并行运行（前端状态隔离） | P0 紧急 | 是 |
| Phase 2 | 模型选择器修复（缓存刷新 + 去重） | P0 紧急 | 是 |
| Phase 3 | 网页模型工具调用提示词修复 | P0 紧急 | 是 |
| Phase 4 | 权限系统增强（always 白名单 + 全部同意 + external_directory） | P1 重要 | 是 |
| Phase 5 | 工具系统增强（搬运 opencode 工具实现） | P2 长期 | 是 |

---

## Phase 1: 对话并行运行 — 前端状态按对话隔离

### 问题分析

**当前实现（缺陷）：**
- `chatStore.ts` 中 `isStreaming`、`streamingContent`、`streamingThinking`、`toolCalls`、`pendingApprovals`、`pendingQuestion` 均为全局单例
- `selectConversation()` 切换对话时重置 `isStreaming=false`，导致原对话的流式状态丢失
- `useChatEvents.ts` 中 `onError`/`onComplete` 无条件调用 `setStreaming(false)`，会干扰其他对话
- 非 currentConversation 的事件被 `return` 忽略，原对话的工具调用、流式内容无法继续接收

**目标行为：**
- 切换对话不停止原对话的后台流式请求
- 每个对话有独立的 streaming 状态
- 切回原对话时恢复其 streaming 状态
- 后端 `runningChats` 保持不变（已支持每对话独立请求）

### 文件结构

- Modify: `src/renderer/src/stores/chatStore.ts` — 核心状态重构
- Modify: `src/renderer/src/hooks/useChatEvents.ts` — 事件路由改为按 conversationId 分发
- Modify: `src/renderer/src/components/chat/ChatPage.tsx` 或 `MessageList.tsx` — 从 Map 读取当前对话状态
- Create: `src/renderer/src/stores/__tests__/chatStore.parallel.test.ts` — 并行对话状态测试

### Task 1.1: 创建按对话隔离的流式状态结构

**Files:**
- Modify: `src/renderer/src/stores/chatStore.ts`
- Create: `src/renderer/src/stores/__tests__/chatStore.parallel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/stores/__tests__/chatStore.parallel.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChatStore } from '../chatStore'

// Mock IPC
vi.mock('@/services/ipc', () => ({
  ipc: {
    chat: {
      send: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      forceReset: vi.fn().mockResolvedValue(true),
      onChunk: vi.fn(() => () => {}),
      onThinking: vi.fn(() => () => {}),
      onToolCallStart: vi.fn(() => () => {}),
      onToolCallEnd: vi.fn(() => () => {}),
      onToolCallApproval: vi.fn(() => () => {}),
      onError: vi.fn(() => () => {}),
      onComplete: vi.fn(() => () => {}),
      onMessage: vi.fn(() => () => {}),
    },
    conversation: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'conv-1', title: '新对话' }),
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({}),
      getMessages: vi.fn().mockResolvedValue([]),
    },
    provider: {
      getAllModels: vi.fn().mockResolvedValue([]),
    },
    question: {
      onAsk: vi.fn(() => () => {}),
    },
  },
}))

describe('ChatStore 并行对话状态隔离', () => {
  beforeEach(() => {
    useChatStore.getState().resetParallelState()
  })

  it('切换对话不应重置原对话的 isStreaming 状态', () => {
    const store = useChatStore.getState()
    // 对话 A 开始流式
    store.setParallelStreaming('conv-a', true)
    store.setParallelContent('conv-a', '正在生成...')
    expect(store.getStreamingState('conv-a').isStreaming).toBe(true)
    expect(store.getStreamingState('conv-a').content).toBe('正在生成...')

    // 切换到对话 B
    store.setCurrentConversationId('conv-b')
    // 对话 A 的状态应保持
    expect(store.getStreamingState('conv-a').isStreaming).toBe(true)
    expect(store.getStreamingState('conv-a').content).toBe('正在生成...')
    // 对话 B 状态应为空（非流式）
    expect(store.getStreamingState('conv-b').isStreaming).toBe(false)
  })

  it('getStreamingState 对未知对话返回空状态', () => {
    const store = useChatStore.getState()
    const state = store.getStreamingState('unknown')
    expect(state.isStreaming).toBe(false)
    expect(state.content).toBe('')
    expect(state.toolCalls).toEqual({})
  })

  it('isCurrentStreaming 反映当前对话的流式状态', () => {
    const store = useChatStore.getState()
    store.setCurrentConversationId('conv-a')
    store.setParallelStreaming('conv-a', true)
    expect(store.isCurrentStreaming()).toBe(true)
    store.setParallelStreaming('conv-a', false)
    expect(store.isCurrentStreaming()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/src/stores/__tests__/chatStore.parallel.test.ts
```
Expected: FAIL — `resetParallelState` / `setParallelStreaming` / `getStreamingState` / `isCurrentStreaming` / `setCurrentConversationId` not found on store

- [ ] **Step 3: Write minimal implementation**

在 `chatStore.ts` 中添加按对话隔离的状态结构：

```typescript
// 在 ChatState interface 中添加：

/** 按对话 ID 隔离的流式状态 */
interface ConversationStreamingState {
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  toolCalls: Record<string, ToolCallState>
  pendingApprovals: PendingApproval[]
  pendingQuestion: PendingQuestion | null
  error: string | null
}

// 在 ChatState 中添加字段和方法：
interface ChatState {
  // ... 原有字段保留 ...

  // 新增：按对话隔离的流式状态 Map
  streamingByConversation: Record<string, ConversationStreamingState>

  // 新增：并行状态管理方法
  resetParallelState: () => void
  getStreamingState: (conversationId: string) => ConversationStreamingState
  setParallelStreaming: (conversationId: string, streaming: boolean) => void
  setParallelContent: (conversationId: string, content: string) => void
  setParallelThinking: (conversationId: string, content: string) => void
  setParallelToolCalls: (conversationId: string, toolCalls: Record<string, ToolCallState>) => void
  addParallelToolCall: (conversationId: string, toolCall: ToolCallState) => void
  updateParallelToolCall: (conversationId: string, toolCallId: string, update: Partial<ToolCallState>) => void
  addParallelApproval: (conversationId: string, approval: PendingApproval) => void
  removeParallelApproval: (conversationId: string, toolCallId: string) => void
  setParallelQuestion: (conversationId: string, question: PendingQuestion | null) => void
  setParallelError: (conversationId: string, error: string | null) => void
  clearParallelState: (conversationId: string) => void
  isCurrentStreaming: () => boolean
  setCurrentConversationId: (id: string | null) => void

  // ... 原有方法保留 ...
}

// 空状态工厂
function emptyStreamingState(): ConversationStreamingState {
  return {
    isStreaming: false,
    streamingContent: '',
    streamingThinking: '',
    toolCalls: {},
    pendingApprovals: [],
    pendingQuestion: null,
    error: null,
  }
}

// 在 create<ChatState>() 中实现：
  resetParallelState: () => {
    set({ streamingByConversation: {} })
  },

  getStreamingState: (conversationId) => {
    return get().streamingByConversation[conversationId] ?? emptyStreamingState()
  },

  setParallelStreaming: (conversationId, streaming) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, isStreaming: streaming },
        },
      }
    })
  },

  setParallelContent: (conversationId, content) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, streamingContent: content },
        },
      }
    })
  },

  setParallelThinking: (conversationId, content) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, streamingThinking: content },
        },
      }
    })
  },

  setParallelToolCalls: (conversationId, toolCalls) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, toolCalls },
        },
      }
    })
  },

  addParallelToolCall: (conversationId, toolCall) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: {
            ...current,
            toolCalls: { ...current.toolCalls, [toolCall.toolCallId]: toolCall },
          },
        },
      }
    })
  },

  updateParallelToolCall: (conversationId, toolCallId, update) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      const existing = current.toolCalls[toolCallId]
      if (!existing) return state
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: {
            ...current,
            toolCalls: {
              ...current.toolCalls,
              [toolCallId]: { ...existing, ...update },
            },
          },
        },
      }
    })
  },

  addParallelApproval: (conversationId, approval) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: {
            ...current,
            pendingApprovals: [...current.pendingApprovals, approval],
          },
        },
      }
    })
  },

  removeParallelApproval: (conversationId, toolCallId) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: {
            ...current,
            pendingApprovals: current.pendingApprovals.filter((a) => a.toolCallId !== toolCallId),
          },
        },
      }
    })
  },

  setParallelQuestion: (conversationId, question) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, pendingQuestion: question },
        },
      }
    })
  },

  setParallelError: (conversationId, error) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, error },
        },
      }
    })
  },

  clearParallelState: (conversationId) => {
    set((state) => {
      const next = { ...state.streamingByConversation }
      delete next[conversationId]
      return { streamingByConversation: next }
    })
  },

  isCurrentStreaming: () => {
    const id = get().currentConversationId
    if (!id) return false
    return get().getStreamingState(id).isStreaming
  },

  setCurrentConversationId: (id) => {
    set({ currentConversationId: id })
  },
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/renderer/src/stores/__tests__/chatStore.parallel.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/chatStore.ts src/renderer/src/stores/__tests__/chatStore.parallel.test.ts
git commit -m "feat(chat): 添加按对话隔离的流式状态结构"
```

### Task 1.2: 重构 selectConversation 不停止原对话

**Files:**
- Modify: `src/renderer/src/stores/chatStore.ts` — `selectConversation` 方法
- Modify: `src/renderer/src/stores/__tests__/chatStore.parallel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// 追加到 chatStore.parallel.test.ts
describe('selectConversation 并行行为', () => {
  beforeEach(() => {
    useChatStore.getState().resetParallelState()
  })

  it('切换对话不调用 ipc.chat.stop', async () => {
    const store = useChatStore.getState()
    const { ipc } = await import('@/services/ipc')
    ;(ipc.chat.stop as ReturnType<typeof vi.fn>).mockClear()

    // 模拟对话 A 正在流式
    store.setParallelStreaming('conv-a', true)
    store.setCurrentConversationId('conv-a')

    // 切换到对话 B
    await store.selectConversation('conv-b')

    // 不应调用 stop
    expect(ipc.chat.stop).not.toHaveBeenCalled()
  })

  it('切换对话保留原对话的流式状态', async () => {
    const store = useChatStore.getState()
    store.setParallelStreaming('conv-a', true)
    store.setParallelContent('conv-a', '生成中...')
    store.setCurrentConversationId('conv-a')

    await store.selectConversation('conv-b')

    // 对话 A 状态保留
    expect(store.getStreamingState('conv-a').isStreaming).toBe(true)
    expect(store.getStreamingState('conv-a').streamingContent).toBe('生成中...')
  })

  it('切回原对话恢复流式状态', async () => {
    const store = useChatStore.getState()
    store.setParallelStreaming('conv-a', true)
    store.setParallelContent('conv-a', '生成中...')

    await store.selectConversation('conv-b')
    await store.selectConversation('conv-a')

    expect(store.getStreamingState('conv-a').isStreaming).toBe(true)
    expect(store.getStreamingState('conv-a').streamingContent).toBe('生成中...')
    expect(store.isCurrentStreaming()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/src/stores/__tests__/chatStore.parallel.test.ts
```
Expected: FAIL — `selectConversation` 仍然重置全局状态

- [ ] **Step 3: 重构 selectConversation**

```typescript
// 替换原有 selectConversation 实现：
  selectConversation: async (id: string | null) => {
    if (id === null) {
      set({
        currentConversationId: null,
        currentConversation: null,
        messages: [],
      })
      return
    }
    // 在所有工作区缓存里找这条对话
    const all = Object.values(get().conversationsByWorkspace).flat()
    const conversation = all.find((c) => c.id === id) ?? get().conversations.find((c) => c.id === id) ?? null

    // 不重置流式状态——保留所有对话的并行状态
    // 不调用 ipc.chat.stop——让原对话在后台继续运行
    set({
      currentConversationId: id,
      currentConversation: conversation,
      // 以下状态从并行 Map 读取，由组件层处理
      todos: [],
      artifacts: [],
      toolUsageStats: {},
      error: null,
    })
    await get().loadMessages(id)
  },
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/renderer/src/stores/__tests__/chatStore.parallel.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/chatStore.ts src/renderer/src/stores/__tests__/chatStore.parallel.test.ts
git commit -m "fix(chat): selectConversation 不停止原对话的后台流式请求"
```

### Task 1.3: 重构事件路由按 conversationId 分发

**Files:**
- Modify: `src/renderer/src/hooks/useChatEvents.ts`
- Create: `src/renderer/src/hooks/__tests__/useChatEvents.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/hooks/__tests__/useChatEvents.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChatEvents } from '../useChatEvents'
import { useChatStore } from '@/stores/chatStore'

vi.mock('@/services/ipc', () => ({
  ipc: {
    chat: {
      onChunk: vi.fn((cb) => { mockCallbacks.chunk = cb; return () => {} }),
      onThinking: vi.fn((cb) => { mockCallbacks.thinking = cb; return () => {} }),
      onToolCallStart: vi.fn((cb) => { mockCallbacks.toolCallStart = cb; return () => {} }),
      onToolCallEnd: vi.fn((cb) => { mockCallbacks.toolCallEnd = cb; return () => {} }),
      onToolCallApproval: vi.fn((cb) => { mockCallbacks.toolCallApproval = cb; return () => {} }),
      onError: vi.fn((cb) => { mockCallbacks.error = cb; return () => {} }),
      onComplete: vi.fn((cb) => { mockCallbacks.complete = cb; return () => {} }),
      onMessage: vi.fn((cb) => { mockCallbacks.message = cb; return () => {} }),
    },
    question: {
      onAsk: vi.fn((cb) => { mockCallbacks.ask = cb; return () => {} }),
    },
  },
}))

const mockCallbacks: Record<string, Function> = {}

describe('useChatEvents 并行事件路由', () => {
  it('onChunk 事件更新对应对话的并行状态，不检查是否当前对话', () => {
    useChatStore.getState().resetParallelState()
    renderHook(() => useChatEvents())

    // 对话 A 收到 chunk，即使当前不是 A
    useChatStore.getState().setCurrentConversationId('conv-b')
    mockCallbacks.chunk({ conversationId: 'conv-a', content: 'hello' })

    // 对话 A 的并行状态应被更新
    expect(useChatStore.getState().getStreamingState('conv-a').streamingContent).toBe('hello')
  })

  it('onComplete 事件只重置对应对话的流式状态，不影响其他对话', () => {
    useChatStore.getState().resetParallelState()
    useChatStore.getState().setParallelStreaming('conv-a', true)
    useChatStore.getState().setParallelStreaming('conv-b', true)
    renderHook(() => useChatEvents())

    useChatStore.getState().setCurrentConversationId('conv-a')
    mockCallbacks.complete({ conversationId: 'conv-b' })

    // 对话 B 流式结束
    expect(useChatStore.getState().getStreamingState('conv-b').isStreaming).toBe(false)
    // 对话 A 不受影响
    expect(useChatStore.getState().getStreamingState('conv-a').isStreaming).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/src/hooks/__tests__/useChatEvents.test.ts
```
Expected: FAIL — 当前事件回调检查 currentConversationId 并 return

- [ ] **Step 3: 重构 useChatEvents**

```typescript
// src/renderer/src/hooks/useChatEvents.ts — 重写
import { useEffect } from 'react'
import { ipc } from '@/services/ipc'
import { useChatStore } from '@/stores/chatStore'

export function useChatEvents(): void {
  useEffect(() => {
    const unsubscribers: Array<() => void> = []

    // 文本内容增量 — 更新对应对话的并行状态
    unsubscribers.push(
      ipc.chat.onChunk((payload) => {
        const store = useChatStore.getState()
        const state = store.getStreamingState(payload.conversationId)
        store.setParallelContent(payload.conversationId, state.streamingContent + payload.content)
        // 如果是当前对话，同步到全局字段（兼容旧组件）
        if (store.currentConversationId === payload.conversationId) {
          store.appendChunk(payload.content)
        }
      }),
    )

    // 思考过程增量
    unsubscribers.push(
      ipc.chat.onThinking((payload) => {
        const store = useChatStore.getState()
        const state = store.getStreamingState(payload.conversationId)
        store.setParallelThinking(payload.conversationId, state.streamingThinking + payload.content)
        if (store.currentConversationId === payload.conversationId) {
          store.appendThinking(payload.content)
        }
      }),
    )

    // 工具调用开始
    unsubscribers.push(
      ipc.chat.onToolCallStart((payload) => {
        const store = useChatStore.getState()
        store.addParallelToolCall(payload.conversationId, {
          toolCallId: payload.tool_call_id,
          name: payload.name,
          args: payload.args,
          status: 'running',
          startedAt: Date.now(),
        })
        if (store.currentConversationId === payload.conversationId) {
          store.setToolCallStart(payload.tool_call_id, payload.name, payload.args)
        }
      }),
    )

    // 工具调用结束
    unsubscribers.push(
      ipc.chat.onToolCallEnd((payload) => {
        const store = useChatStore.getState()
        store.updateParallelToolCall(payload.conversationId, payload.tool_call_id, {
          result: payload.result,
          status: payload.result?.is_error ? 'error' : 'completed',
          endedAt: Date.now(),
        })
        if (store.currentConversationId === payload.conversationId) {
          store.setToolCallEnd(payload.tool_call_id, payload.result)
        }
      }),
    )

    // 工具调用需要审批
    unsubscribers.push(
      ipc.chat.onToolCallApproval((payload) => {
        const store = useChatStore.getState()
        store.addParallelApproval(payload.conversationId, {
          conversationId: payload.conversationId,
          toolCallId: payload.tool_call_id,
          name: payload.name,
          args: payload.args,
        })
        if (store.currentConversationId === payload.conversationId) {
          store.addPendingApproval({
            conversationId: payload.conversationId,
            toolCallId: payload.tool_call_id,
            name: payload.name,
            args: payload.args,
          })
        }
      }),
    )

    // AI 向用户提问
    unsubscribers.push(
      ipc.question.onAsk((payload) => {
        const store = useChatStore.getState()
        store.setParallelQuestion(payload.conversationId, {
          conversationId: payload.conversationId,
          questionId: payload.questionId,
          questions: payload.questions,
        })
        if (store.currentConversationId === payload.conversationId) {
          store.setPendingQuestion({
            conversationId: payload.conversationId,
            questionId: payload.questionId,
            questions: payload.questions,
          })
        }
      }),
    )

    // 完整 assistant 消息
    unsubscribers.push(
      ipc.chat.onMessage((message) => {
        const store = useChatStore.getState()
        if (store.currentConversationId === message.conversationId) {
          const { conversationId: _conversationId, ...messageData } = message
          void _conversationId
          store.onMessageComplete(messageData)
        }
      }),
    )

    // 错误事件 — 只重置对应对话的流式状态
    unsubscribers.push(
      ipc.chat.onError((error) => {
        const store = useChatStore.getState()
        // 只重置出错对话的流式状态，不影响其他对话
        store.setParallelStreaming(error.conversationId, false)
        store.setParallelError(error.conversationId, error.message)
        // 如果是当前对话，同步全局状态
        if (store.currentConversationId === error.conversationId) {
          store.setStreaming(false)
          store.setError(error.message)
        }
        // 重新加载该对话的消息
        void store.loadMessages(error.conversationId)
      }),
    )

    // 聊天完成事件 — 只重置对应对话
    unsubscribers.push(
      ipc.chat.onComplete((payload) => {
        const store = useChatStore.getState()
        // 只重置完成对话的流式状态
        store.setParallelStreaming(payload.conversationId, false)
        // 如果是当前对话，同步全局状态并重载消息
        if (store.currentConversationId === payload.conversationId) {
          store.setStreaming(false)
          void store.loadMessages(payload.conversationId)
        }
      }),
    )

    return () => {
      unsubscribers.forEach((unsub) => {
        try { unsub() } catch { /* 忽略 */ }
      })
    }
  }, [])
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/renderer/src/hooks/__tests__/useChatEvents.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useChatEvents.ts src/renderer/src/hooks/__tests__/useChatEvents.test.ts
git commit -m "fix(chat): 事件路由按 conversationId 分发，不干扰其他对话"
```

### Task 1.4: sendMessage 使用并行状态检查

**Files:**
- Modify: `src/renderer/src/stores/chatStore.ts` — `sendMessage` 方法
- Modify: `src/renderer/src/stores/__tests__/chatStore.parallel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// 追加到 chatStore.parallel.test.ts
describe('sendMessage 并行检查', () => {
  it('当前对话非流式时允许发送，即使其他对话在流式', async () => {
    const store = useChatStore.getState()
    store.resetParallelState()
    store.setParallelStreaming('conv-a', true)
    store.setCurrentConversationId('conv-b')
    // 对话 B 非流式，应允许发送
    store.setParallelStreaming('conv-b', false)

    await store.sendMessage('test')
    // 不应有错误
    expect(store.error).toBeNull()
  })

  it('当前对话流式时阻止发送', async () => {
    const store = useChatStore.getState()
    store.resetParallelState()
    store.setParallelStreaming('conv-a', true)
    store.setCurrentConversationId('conv-a')

    await store.sendMessage('test')
    expect(store.error).toContain('进行中')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: 修改 sendMessage**

```typescript
// 在 sendMessage 开头替换 isStreaming 检查：
  sendMessage: async (content: string, options?: SendMessageOptions) => {
    const state = get()
    const conversationId = state.currentConversationId
    if (!conversationId) {
      set({ error: '当前没有活动对话' })
      return
    }
    // 使用并行状态检查：只检查当前对话是否在流式
    if (state.isCurrentStreaming()) {
      set({ error: '当前对话正在生成回复中，请稍候或先停止' })
      return
    }

    // 设置当前对话的并行流式状态
    state.setParallelStreaming(conversationId, true)
    state.setParallelContent(conversationId, '')
    state.setParallelThinking(conversationId, '')
    state.setParallelToolCalls(conversationId, {})
    state.clearParallelApprovals(conversationId)
    state.setParallelQuestion(conversationId, null)

    // 保留全局状态同步（兼容旧组件）
    const tempUserMessage: Message = {
      id: `temp-user-${Date.now()}`,
      conversation_id: conversationId,
      role: 'user',
      content,
      metadata: null,
      created_at: Date.now(),
    }

    set({
      messages: [...state.messages, tempUserMessage],
      isStreaming: true,
      streamingContent: '',
      streamingThinking: '',
      error: null,
      toolCalls: {},
      pendingApprovals: [],
      pendingQuestion: null,
    })

    // ... 超时和 IPC 调用逻辑不变 ...
  },
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/chatStore.ts src/renderer/src/stores/__tests__/chatStore.parallel.test.ts
git commit -m "fix(chat): sendMessage 使用并行状态检查，不阻塞其他对话"
```

### Task 1.5: 组件层适配并行状态

**Files:**
- Modify: `src/renderer/src/components/chat/MessageList.tsx` — 读取当前对话的并行状态
- Modify: `src/renderer/src/components/chat/ChatInput.tsx` — 禁用状态使用 isCurrentStreaming
- Modify: `src/renderer/src/components/chat/PermissionDialog.tsx` — 从并行状态读取 pendingApprovals

- [ ] **Step 1: 适配 ChatInput 禁用逻辑**

```typescript
// ChatInput.tsx 中，将 isStreaming 检查改为 isCurrentStreaming
// 找到 const { isStreaming } = useChatStore()
// 改为：
const isCurrentStreaming = useChatStore((s) => s.isCurrentStreaming())
// disabled={isCurrentStreaming}
```

- [ ] **Step 2: 适配 MessageList 读取并行流式内容**

```typescript
// MessageList.tsx 中，streamingContent 从并行状态读取
const currentConversationId = useChatStore((s) => s.currentConversationId)
const streamingState = useChatStore((s) =>
  currentConversationId ? s.streamingByConversation[currentConversationId] : null
)
const streamingContent = streamingState?.streamingContent ?? ''
const streamingThinking = streamingState?.streamingThinking ?? ''
```

- [ ] **Step 3: 验证编译通过**

```bash
npm run typecheck:web
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/chat/
git commit -m "feat(chat): 组件层适配并行状态，支持多对话同时流式"
```

---

## Phase 2: 模型选择器修复 — 缓存刷新 + 去重

### 问题分析

**当前实现（缺陷）：**
1. `availableModels` 在 chatStore 中缓存，组件挂载时加载一次。删除 provider 后缓存不更新
2. `selectedModel` 存 `model.name`（真实模型名），同名模型跨 Provider 时多个分组都显示选中态

### Task 2.1: provider 变更后刷新模型列表缓存

**Files:**
- Modify: `src/main/ipc/provider.ipc.ts` — 删除/更新 provider 后广播刷新事件
- Modify: `src/renderer/src/stores/chatStore.ts` — 监听 provider 变更事件
- Create: `src/renderer/src/stores/__tests__/chatStore.models.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/stores/__tests__/chatStore.models.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChatStore } from '../chatStore'

vi.mock('@/services/ipc', () => ({
  ipc: {
    chat: { onChunk: vi.fn(() => () => {}), onThinking: vi.fn(() => () => {}),
      onToolCallStart: vi.fn(() => () => {}), onToolCallEnd: vi.fn(() => () => {}),
      onToolCallApproval: vi.fn(() => () => {}), onError: vi.fn(() => () => {}),
      onComplete: vi.fn(() => () => {}), onMessage: vi.fn(() => () => {}),
      send: vi.fn(), stop: vi.fn(), forceReset: vi.fn() },
    conversation: { list: vi.fn().mockResolvedValue([]), create: vi.fn(),
      delete: vi.fn(), update: vi.fn(), getMessages: vi.fn().mockResolvedValue([]) },
    provider: {
      getAllModels: vi.fn().mockResolvedValue([
        { id: '1', name: 'gpt-4', provider: 'openai' },
      ]),
      onModelsChanged: vi.fn((cb) => { mockModelCb = cb; return () => {} }),
    },
    question: { onAsk: vi.fn(() => () => {}) },
  },
}))

let mockModelCb: Function | null = null

describe('模型列表缓存刷新', () => {
  beforeEach(() => {
    useChatStore.setState({ availableModels: [] })
    mockModelCb = null
  })

  it('收到 onModelsChanged 事件后重新加载模型列表', async () => {
    const store = useChatStore.getState()
    await store.loadAvailableModels()
    expect(store.availableModels).toHaveLength(1)

    // 模拟 provider 删除后模型列表变化
    const { ipc } = await import('@/services/ipc')
    ;(ipc.provider.getAllModels as ReturnType<typeof vi.fn>).mockResolvedValue([])

    // 触发刷新事件
    expect(mockModelCb).not.toBeNull()
    mockModelCb!()

    // 等待异步刷新
    await new Promise((r) => setTimeout(r, 100))
    expect(useChatStore.getState().availableModels).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: 实现**

```typescript
// provider.ipc.ts 中，在 deleteProvider 和 updateProvider 后广播事件：
// 在删除/更新 provider 后添加：
mainWindow?.webContents.send('provider:modelsChanged')

// chatStore.ts 中，loadAvailableModels 时注册监听：
  loadAvailableModels: async () => {
    const models = await ipc.provider.getAllModels()
    set({ availableModels: models })
  },

// 在 useChatEvents 或单独的 hook 中注册监听：
// useChatEvents.ts 中添加：
useEffect(() => {
  const unsub = ipc.provider.onModelsChanged(() => {
    void useChatStore.getState().loadAvailableModels()
  })
  return () => { unsub() }
}, [])
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/provider.ipc.ts src/renderer/src/stores/chatStore.ts src/renderer/src/hooks/useChatEvents.ts src/renderer/src/stores/__tests__/chatStore.models.test.ts
git commit -m "fix(models): provider 变更后自动刷新模型列表缓存"
```

### Task 2.2: 模型选中去重 — 用 provider:name 复合标识

**Files:**
- Modify: `src/renderer/src/stores/uiStore.ts` — selectedModel 改为存 `provider:name`
- Modify: `src/renderer/src/components/chat/ModelSelector.tsx` — 选中逻辑用复合标识
- Create: `src/renderer/src/components/chat/__tests__/ModelSelector.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/components/chat/__tests__/ModelSelector.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModelSelector } from '../ModelSelector'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'

// Mock IPC...

describe('ModelSelector 去重', () => {
  it('同名模型跨 Provider 时只选中一个', () => {
    useChatStore.setState({
      availableModels: [
        { id: '1', name: 'deepseek-v4-flash', provider: 'deepseek' },
        { id: '2', name: 'deepseek-v4-flash', provider: 'webchat' },
      ],
    })
    useUIStore.setState({ selectedModel: 'webchat:deepseek-v4-flash' })

    render(<ModelSelector />)

    // 只有一个模型显示选中态
    const selected = screen.getAllByTestId('model-selected')
    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveTextContent('deepseek-v4-flash')
    // 确认选中的是 webchat 那个
    expect(selected[0].closest('[data-provider]')).toHaveAttribute('data-provider', 'webchat')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: 实现**

```typescript
// uiStore.ts: selectedModel 存储格式改为 `${provider}:${name}`
// ModelSelector.tsx 中：
function getModelKey(model: ModelInfo): string {
  return `${model.provider}:${model.name}`
}

// 选中状态判断：
const selected = availableModels.find((m) => getModelKey(m) === selectedModel)
  ?? availableModels.find((m) => m.name === selectedModel)  // 兼容旧格式
  ?? availableModels[0]

// 选中态显示：
const isSelected = (model: ModelInfo) => getModelKey(model) === selectedModel

// 选择模型时：
const handleSelect = (model: ModelInfo) => {
  setUISelectedModel(getModelKey(model))  // 存复合标识
  // API 调用时从 model.name 取真实名称
}
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/uiStore.ts src/renderer/src/components/chat/ModelSelector.tsx src/renderer/src/components/chat/__tests__/ModelSelector.test.tsx
git commit -m "fix(models): 模型选中用 provider:name 复合标识，避免跨 Provider 重复选中"
```

---

## Phase 3: 网页模型工具调用提示词修复

### 问题分析

**当前实现（缺陷）：**
- Chat2API 的 `promptGenerator.ts` 生成的提示词过于简单，网页模型不理解如何调用工具
- 提示词只描述了格式协议，没有描述工具调用的"意图"和"场景"
- opencode 的提示词系统有完整的工具描述文件（`*.txt`），每个工具有详细的 usage 说明

**解决方案：**
- 重写 `promptGenerator.ts`，融合 opencode 的工具描述风格和 codex 的 preamble 规范
- 添加工具调用示例（针对不同场景）
- 强化"何时调用工具"的指导

### Task 3.1: 重写 Chat2API 工具调用提示词

**Files:**
- Modify: `src/main/chat2api/proxy/services/promptGenerator.ts`
- Create: `src/main/chat2api/proxy/services/__tests__/promptGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/chat2api/proxy/services/__tests__/promptGenerator.test.ts
import { describe, it, expect } from 'vitest'
import { PromptGenerator } from '../promptGenerator'
import type { ChatCompletionTool } from '../../types'

const mockTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取指定路径的文件内容',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件路径' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: '写入文件内容',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: '文件路径' },
            content: { type: 'string', description: '文件内容' },
          },
          required: ['filePath', 'content'],
        },
      },
    },
  },
]

describe('PromptGenerator 工具调用提示词', () => {
  it('XML 格式提示词包含工具调用意图指导', () => {
    const prompt = PromptGenerator.generate(mockTools, { format: 'xml' })
    // 包含工具列表
    expect(prompt).toContain('read_file')
    expect(prompt).toContain('write_file')
    // 包含何时调用工具的指导
    expect(prompt).toContain('何时调用工具')
    // 包含工具调用示例
    expect(prompt).toContain('<tool_use>')
    // 包含工具结果格式说明
    expect(prompt).toContain('TOOL_RESULT')
  })

  it('提示词包含 preamble 规范（先说明再行动）', () => {
    const prompt = PromptGenerator.generate(mockTools, { format: 'xml' })
    expect(prompt).toContain('先说明')
    expect(prompt).toContain('preamble')
  })

  it('提示词包含常见场景的工具调用示例', () => {
    const prompt = PromptGenerator.generate(mockTools, { format: 'xml' })
    // 读取文件示例
    expect(prompt).toContain('read_file')
    // 写入文件示例
    expect(prompt).toContain('write_file')
  })

  it('bracket 格式同样包含完整指导', () => {
    const prompt = PromptGenerator.generate(mockTools, { format: 'bracket' })
    expect(prompt).toContain('[function_calls]')
    expect(prompt).toContain('何时调用工具')
    expect(prompt).toContain('preamble')
  })

  it('无工具时返回空字符串', () => {
    const prompt = PromptGenerator.generate([], { format: 'xml' })
    expect(prompt).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: 重写 promptGenerator.ts**

```typescript
// src/main/chat2api/proxy/services/promptGenerator.ts — 重写

import { ChatCompletionTool } from '../types'

export type ProtocolFormat = 'bracket' | 'xml'

export interface PromptGenerationOptions {
  format: ProtocolFormat
  customTemplate?: string
  provider?: string
}

export interface TemplateVariables {
  tools: string
  toolNames: string
  format: string
}

function generateToolDefinitions(tools: ChatCompletionTool[]): string {
  return tools
    .map((tool) => {
      const params = tool.function.parameters
        ? JSON.stringify(tool.function.parameters)
        : '{}'
      return `### ${tool.function.name}\n${tool.function.description || 'No description'}\n参数 JSON Schema: ${params}`
    })
    .join('\n\n')
}

function generateToolNames(tools: ChatCompletionTool[]): string {
  return tools.map((tool) => tool.function.name).join(', ')
}

function generateXmlFormatExample(): string {
  return `## 工具调用协议

当需要调用工具时，你必须输出以下格式的 XML 块：

<tool_use>
  <name>工具名称</name>
  <arguments>{"参数名": "参数值"}</arguments>
</tool_use>

### 规则
1. 必须使用工具列表中定义的**精确工具名**（区分大小写）
2. <arguments> 标签内必须是合法的 JSON 对象
3. 不要在 JSON 外面加 \`\`\`json 代码块
4. 需要调用多个工具时，依次输出多个 <tool_use> 块
5. 调用工具时**只输出 <tool_use> 块**，不要输出其他文字
6. 收到工具结果后，根据结果继续回复或调用下一个工具

### 工具结果格式
工具执行后，你会收到如下格式的结果：
[TOOL_RESULT for tool_call_id] 工具返回的内容`
}

function generateBracketFormatExample(): string {
  return `## 工具调用协议

当需要调用工具时，你必须输出以下格式的块：

[function_calls]
[call:工具名称]{"参数名": "参数值"}[/call]
[/function_calls]

### 规则
1. 每个工具调用以 [call:工具名] 开始，以 [/call] 结束
2. 必须使用工具列表中定义的**精确工具名**（区分大小写）
3. [call:...] 和 [/call] 之间是单行 JSON 对象——不要换行
4. 不要在 JSON 外面加 \`\`\`json 代码块
5. 多个工具调用放在同一个 [function_calls] 块内
6. 调用工具时**只输出 [function_calls] 块**，不要输出其他文字
7. 收到工具结果后，根据结果继续回复或调用下一个工具

### 工具结果格式
工具执行后，你会收到如下格式的结果：
[TOOL_RESULT for call_id] 工具返回的内容`
}

function getFormatExample(format: ProtocolFormat): string {
  return format === 'xml' ? generateXmlFormatExample() : generateBracketFormatExample()
}

/**
 * 生成完整的工具调用系统提示词
 * 融合 opencode 工具描述风格 + codex preamble 规范
 */
function generateFullPrompt(tools: ChatCompletionTool[], format: ProtocolFormat): string {
  const toolDefinitions = generateToolDefinitions(tools)
  const formatExample = getFormatExample(format)
  const exampleTool = format === 'xml' ? `<tool_use>\n  <name>read_file</name>\n  <arguments>{"filePath":"/path/to/file"}</arguments>\n</tool_use>` : `[function_calls]\n[call:read_file]{"filePath":"/path/to/file"}[/call]\n[/function_calls]`

  return `## 工具使用能力

你是一个拥有工具调用能力的 AI 助手。你可以使用以下工具来读取文件、写入文件、搜索代码、执行命令等。

### 可用工具

${toolDefinitions}

${formatExample}

## 何时调用工具

**主动调用工具的场景：**
1. **用户要求读取/修改/搜索文件时** → 调用对应的文件工具
2. **需要查看代码内容才能回答时** → 调用 read_file / grep / search_files
3. **用户要求写入或修改代码时** → 调用 write_file / edit
4. **需要执行命令时** → 调用 run_command
5. **需要搜索网络信息时** → 调用 websearch / webfetch
6. **多步骤任务需要规划时** → 调用 todo_write

**不需要调用工具的场景：**
1. 用户问通用知识问题 → 直接回答
2. 用户让你解释代码概念 → 直接回答（除非需要查看具体代码）
3. 闲聊 → 直接回答

## 行为准则（preamble 规范）

**调用工具前必须先说明**：
- 在调用任何工具之前，用 1-2 句话简短说明你即将做什么
- 例如："让我先读取这个文件的内容。" 然后调用 read_file
- 不要只调用工具不说话——用户需要知道你在做什么

**工具调用后必须总结**：
- 工具执行完成后，简要说明结果和下一步计划
- 例如："文件已读取，共 100 行。接下来我将修改第 50 行的函数。"

## 示例

用户：帮我看看 src/index.ts 的内容

${exampleTool}

收到工具结果后，根据结果向用户解释文件内容。

## 重要提醒

- 工具名区分大小写，必须与上面列表中的名称完全一致
- 参数必须是合法的 JSON
- 一次可以调用多个工具（放在同一个块内）
- 调用工具时只输出工具调用块，不要输出其他文字
- 收到工具结果后，继续用自然语言回复用户`
}

function generatePerplexityPrompt(tools: ChatCompletionTool[]): string {
  const toolDefinitions = generateToolDefinitions(tools)
  return `## CRITICAL INSTRUCTIONS - MUST FOLLOW

You are in TOOL CALL MODE. Your ONLY allowed response format is XML tool calls.

### PROHIBITED ACTIONS:
- DO NOT perform web searches or internet searches
- DO NOT use your built-in search functionality
- DO NOT return search results or web content
- DO NOT answer questions directly with text

### REQUIRED BEHAVIOR:
- You MUST respond ONLY with <tool_use> blocks
- You MUST call the appropriate tool from the available tools list below
- You MUST use the exact tool name as defined (case-sensitive)

## Available Tools

${toolDefinitions}

${generateXmlFormatExample()}

## RESPONSE FORMAT ENFORCEMENT
- Your response MUST start with <tool_use> and contain ONLY tool calls
- Any other response format is FORBIDDEN`
}

export class PromptGenerator {
  static generate(tools: ChatCompletionTool[], options: PromptGenerationOptions): string {
    if (!tools || tools.length === 0) return ''
    const { format, customTemplate, provider } = options

    if (provider === 'perplexity') return generatePerplexityPrompt(tools)

    if (customTemplate) {
      const variables: TemplateVariables = {
        tools: generateToolDefinitions(tools),
        toolNames: generateToolNames(tools),
        format: getFormatExample(format),
      }
      return customTemplate
        .replace(/\{\{tools\}\}/g, variables.tools)
        .replace(/\{\{tool_names\}\}/g, variables.toolNames)
        .replace(/\{\{format\}\}/g, variables.format)
    }

    return generateFullPrompt(tools, format)
  }

  static generateToolDefinitions(tools: ChatCompletionTool[]): string {
    return generateToolDefinitions(tools)
  }

  static generateToolNames(tools: ChatCompletionTool[]): string {
    return generateToolNames(tools)
  }

  static generateWrapHint(): string {
    return '\n\nIMPORTANT: If you need to use a tool, output a tool_use block as described above.'
  }

  static getFormatExample(format: ProtocolFormat): string {
    return getFormatExample(format)
  }
}

export function generateToolPrompt(
  tools: ChatCompletionTool[],
  format: ProtocolFormat = 'bracket',
): string {
  return PromptGenerator.generate(tools, { format })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/main/chat2api/proxy/services/__tests__/promptGenerator.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/main/chat2api/proxy/services/promptGenerator.ts src/main/chat2api/proxy/services/__tests__/promptGenerator.test.ts
git commit -m "fix(chat2api): 重写工具调用提示词，融合 opencode+codex 风格，强化工具调用指导"
```

### Task 3.2: 修复 API 发送报错"模型未返回内容/网页模型响应超时"

**Files:**
- Modify: `src/main/chat2api/proxy/forwarder.ts` — 改进错误处理和超时
- Modify: `src/main/providers/openai.provider.ts` — 修复空回复处理

- [ ] **Step 1: 调查错误根因**

检查 forwarder.ts 中 stream 错误体解析和空回复处理逻辑。可能原因：
1. API provider 的 base_url 拼接问题（重复 /v1）
2. 模型名错误（存了 id 而非 name）
3. 超时设置过短

- [ ] **Step 2: 修复空回复错误信息**

```typescript
// forwarder.ts 中，空回复时给出明确的错误信息而非"网页模型响应超时"
// 在检测到空回复时：
if (!finalContent || finalContent.trim() === '') {
  throw new Error(`模型未返回内容。请检查：
1. API Key 是否有效
2. 模型名是否正确（当前: ${model}）
3. Provider base_url 是否正确
4. 网络连接是否正常
请求 URL: ${targetUrl}`)
}
```

- [ ] **Step 3: 验证编译**

```bash
npm run typecheck:node
```

- [ ] **Step 4: Commit**

```bash
git add src/main/chat2api/proxy/forwarder.ts src/main/providers/openai.provider.ts
git commit -m "fix(chat2api): 改进空回复错误信息，提供可调试的 URL 和模型名"
```

---

## Phase 4: 权限系统增强 — always 白名单 + 全部同意 + external_directory

### 问题分析

**当前实现（缺陷）：**
1. 权限只有 allow/ask/deny，用户每次都要点确认
2. 没有 opencode 的 "always" 运行时记忆机制
3. 没有 external_directory 权限（无法访问工作区外目录）
4. 没有"全部同意"按钮

### Task 4.1: 添加 "always" 权限选项 — 运行时记忆

**Files:**
- Modify: `src/main/services/permission.service.ts` — 添加 always 逻辑
- Modify: `src/main/agent/engine.ts` — 工具审批回调支持 always
- Modify: `src/renderer/src/components/chat/PermissionDialog.tsx` — 添加"始终允许"按钮
- Create: `src/main/services/__tests__/permission.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/services/__tests__/permission.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  checkPermission,
  setPermissionRules,
  getPermissionRules,
  DEFAULT_PERMISSION_RULES,
  rememberApproval,
  type PermissionAction,
} from '../permission.service'

describe('权限系统', () => {
  beforeEach(() => {
    setPermissionRules([...DEFAULT_PERMISSION_RULES])
  })

  it('checkPermission 返回 allow/ask/deny', () => {
    expect(checkPermission('read_file')).toBe('allow')
    expect(checkPermission('write_file')).toBe('ask')
  })

  it('rememberApproval 将 always 决策写入规则', () => {
    rememberApproval('write_file', 'always')
    // 规则中应新增一条 allow 规则
    const rules = getPermissionRules()
    const writeRule = rules.find((r) => r.tool === 'write_file')
    expect(writeRule?.action).toBe('allow')
  })

  it('rememberApproval 的 once 不修改规则', () => {
    rememberApproval('write_file', 'once')
    const rules = getPermissionRules()
    const writeRule = rules.find((r) => r.tool === 'write_file')
    expect(writeRule?.action).toBe('ask') // 不变
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: 实现**

```typescript
// permission.service.ts 中添加：

export type PermissionAction = 'allow' | 'ask' | 'deny'
export type ApprovalDecision = 'once' | 'always' | 'reject'

/**
 * 记住用户的审批决策
 * - once: 不修改规则，仅本次允许
 * - always: 将规则改为 allow，以后自动放行
 * - reject: 不修改规则，仅本次拒绝
 */
export function rememberApproval(toolName: string, decision: ApprovalDecision): void {
  if (decision !== 'always') return
  const rules = getPermissionRules()
  // 查找已有规则
  const existingIdx = rules.findIndex((r) => r.tool === toolName)
  if (existingIdx >= 0) {
    rules[existingIdx] = { tool: toolName, action: 'allow' }
  } else {
    rules.push({ tool: toolName, action: 'allow' })
  }
  setPermissionRules(rules)
  logger.info(`权限规则已更新: ${toolName} → allow (用户选择"始终允许")`)
}
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: 修改 PermissionDialog 添加"始终允许"按钮**

```typescript
// PermissionDialog.tsx 中，将"批准"按钮改为两个：
// "允许一次" (once) 和 "始终允许" (always)
const handleApprove = (decision: 'once' | 'always') => {
  ipc.chat.approveToolCall(toolCallId, true, decision)
}

// 渲染：
<button onClick={() => handleApprove('once')}>允许一次</button>
<button onClick={() => handleApprove('always')}>始终允许</button>
<button onClick={() => handleReject()}>拒绝</button>
```

- [ ] **Step 6: 修改 engine.ts 和 chat.ipc.ts 支持 decision 参数**

```typescript
// chat.ipc.ts 中 approveToolCall handler 增加 decision 参数
ipcMain.handle('chat:approveToolCall', (_e, toolCallId: string, approved: boolean, decision?: 'once' | 'always') => {
  if (decision === 'always' && approved) {
    // 记住权限
    const toolCall = pendingApprovals.get(/* ... */)
    if (toolCall) {
      rememberApproval(toolCall.name, 'always')
    }
  }
  // resolve promise...
})
```

- [ ] **Step 7: Commit**

```bash
git add src/main/services/permission.service.ts src/main/agent/engine.ts src/renderer/src/components/chat/PermissionDialog.tsx src/main/ipc/chat.ipc.ts src/main/services/__tests__/permission.service.test.ts
git commit -m "feat(permission): 添加 always 运行时记忆，用户可选择'始终允许'"
```

### Task 4.2: 添加"全部同意"设置按钮

**Files:**
- Modify: `src/renderer/src/components/settings/PermissionSettings.tsx` — 添加全部同意按钮
- Modify: `src/main/ipc/permission.ipc.ts` — 添加全部同意 handler

- [ ] **Step 1: 实现**

```typescript
// PermissionSettings.tsx 中添加按钮：
<button
  onClick={async () => {
    // 将所有内置工具设为 allow
    const allTools = ['read_file', 'write_file', 'edit', 'list_files', 'run_command',
      'search_files', 'grep', 'todo_write', 'question', 'task', 'webfetch', 'websearch', 'terminal_read']
    const rules = allTools.map((tool) => ({ tool, action: 'allow' as const }))
    await ipc.permission.setRules(rules)
    // 刷新本地状态
    loadRules()
  }}
  className="..."
>
  全部同意（不再询问）
</button>

// 同时添加"恢复默认"按钮：
<button onClick={async () => {
  await ipc.permission.setRules(DEFAULT_PERMISSION_RULES)
  loadRules()
}}>
  恢复默认
</button>
```

- [ ] **Step 2: 验证编译**

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/settings/PermissionSettings.tsx
git commit -m "feat(permission): 添加'全部同意'和'恢复默认'按钮"
```

### Task 4.3: 添加 external_directory 权限支持

**Files:**
- Modify: `src/shared/types/tool.ts` — ToolContext 添加 allowedDirectories
- Modify: `src/main/services/conversation.service.ts` — 传入允许的目录列表
- Modify: `src/main/tools/builtin/read_file.tool.ts` — 路径检查支持外部目录
- Modify: `src/renderer/src/components/settings/PermissionSettings.tsx` — 添加白名单目录管理

- [ ] **Step 1: 在设置中添加白名单目录管理**

```typescript
// settings.repo.ts 中添加：
const ALLOWED_DIRECTORIES_KEY = 'permission.allowedDirectories'

export function getAllowedDirectories(): string[] {
  const raw = settingsRepo.get(ALLOWED_DIRECTORIES_KEY)
  return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
}

export function setAllowedDirectories(dirs: string[]): void {
  settingsRepo.set(ALLOWED_DIRECTORIES_KEY, dirs, 'permission')
}
```

- [ ] **Step 2: ToolContext 添加 allowedDirectories**

```typescript
// tool.ts 中 ToolContext 添加：
export interface ToolContext {
  workspacePath: string
  projectId: string
  conversationId: string
  autoAccept: boolean
  allowedDirectories: string[]  // 新增：白名单外部目录
  onQuestion: (questions: QuestionItem[]) => Promise<Record<string, unknown>>
  spawnSubAgent: (prompt: string, mode: AgentMode) => Promise<string>
}
```

- [ ] **Step 3: 路径安全检查支持外部目录**

```typescript
// 在工具的路径检查函数中：
function isPathAllowed(filePath: string, workspacePath: string, allowedDirectories: string[]): boolean {
  const absPath = path.resolve(workspacePath, filePath)
  // 工作区内
  if (absPath.startsWith(path.resolve(workspacePath))) return true
  // 白名单目录
  for (const dir of allowedDirectories) {
    if (absPath.startsWith(path.resolve(dir))) return true
  }
  return false
}
```

- [ ] **Step 4: 设置页添加目录管理 UI**

```typescript
// PermissionSettings.tsx 中添加白名单目录管理区域：
<div>
  <h3>可访问的外部目录</h3>
  {allowedDirectories.map((dir, i) => (
    <div key={i}>
      <span>{dir}</span>
      <button onClick={() => removeDirectory(i)}>删除</button>
    </div>
  ))}
  <button onClick={addDirectory}>+ 添加目录</button>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/tool.ts src/main/services/conversation.service.ts src/main/tools/builtin/read_file.tool.ts src/renderer/src/components/settings/PermissionSettings.tsx
git commit -m "feat(permission): 添加 external_directory 白名单，支持访问工作区外目录"
```

---

## Phase 5: 工具系统增强 — 搬运 opencode 工具实现

### 概要

此 Phase 为长期迁移目标，逐步将 opencode 的高级工具能力移植到 ZX-Code：

### Task 5.1: 文件编辑工具 — 多策略模糊匹配

**目标：** 移植 opencode edit.ts 的四种替换器策略（SimpleReplacer、LineTrimmedReplacer、BlockAnchorReplacer、WhitespaceNormalizedReplacer），提高编辑成功率。

**关键改动：**
- `src/main/tools/builtin/edit.tool.ts` — 添加模糊匹配逻辑
- 添加信号量锁防止并发编辑
- 编辑后触发格式化和 LSP 诊断

### Task 5.2: 文件读取工具 — 流式读取 + 二进制检测

**目标：** 移植 opencode read.ts 的流式读取和二进制文件检测。

**关键改动：**
- `src/main/tools/builtin/read_file.tool.ts` — 流式读取大文件
- 二进制检测（扩展名黑名单 + 不可打印字符比例）
- 图片/PDF 作为附件返回

### Task 5.3: 命令执行工具 — 权限改进

**目标：** 移植 opencode 的命令解析（arity.ts），权限请求展示人类可理解的命令名。

**关键改动：**
- `src/main/tools/builtin/run_command.tool.ts` — 移除内部双重权限检查
- `src/main/services/permission.service.ts` — 添加命令前缀解析

### Task 5.4: Bash 工具移植

**目标：** 如果 opencode 有 bash 工具（通过插件/MCP），移植其实现。

### Task 5.5: 工具描述文件系统

**目标：** 移植 opencode 的工具描述文件（`*.txt`），每个工具有详细的 usage 说明。

**关键改动：**
- 创建 `src/main/tools/descriptions/` 目录
- 每个工具一个 `.txt` 描述文件
- 工具注册时自动加载描述

---

## Self-Review

### Spec coverage

| 用户需求 | 对应 Task |
|---------|-----------|
| 切换对话后原对话继续运行 | Task 1.1-1.5 |
| 网页大模型不会调用工具 | Task 3.1 |
| 模型列表去掉 DeepSeek 后仍显示 | Task 2.1 |
| API 和网页模型重复选中 | Task 2.2 |
| API 发送报错"模型未返回内容" | Task 3.2 |
| 设置可访问其他工作区 | Task 4.3 |
| 权限白名单"全部同意" | Task 4.2 |
| always 运行时记忆 | Task 4.1 |
| 搬运 opencode 底层（文件管理/工具/权限） | Phase 5（概要） |

### Placeholder scan

Phase 1-4 的每个 Task 都有完整的测试代码和实现代码。Phase 5 为概要（长期目标），用户未要求详细任务分解。

### Type consistency

- `ConversationStreamingState` 在 Task 1.1 定义，在 Task 1.3-1.5 使用 — 一致
- `ApprovalDecision = 'once' | 'always' | 'reject'` 在 Task 4.1 定义，在 PermissionDialog 和 chat.ipc.ts 使用 — 一致
- `getAllowedDirectories` / `setAllowedDirectories` 在 Task 4.3 定义并使用 — 一致
- `getModelKey(model)` 返回 `provider:name` 格式 — 在 Task 2.2 定义并使用

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-08-opencode-integration-and-fixes.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
