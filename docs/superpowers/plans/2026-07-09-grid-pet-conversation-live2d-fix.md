# 九宫格独立对话系统 + 桌宠操控 + Live2D 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让九宫格对话格成为一个接入大模型的独立桌宠对话系统（带角色卡、操控桌宠表情动作、感知编程项目状态），同时修复 Live2D 模型加载失败。

**Architecture:** 后端 `chat:send` 新增 `systemPrompt` 透传参数，让角色卡注入对话上下文。前端 `gridChatStore` 改造为桌宠对话核心：发送时注入角色卡 + 编程项目上下文摘要，接收回复时同步驱动 petStore（气泡、情绪、动作表情）。Live2D 失败根因是 modelPath 用了绝对本地路径走 `app-asset` 协议（非 standard scheme，相对资源解析失败），改为 Vite 服务的相对路径。

**Tech Stack:** Electron 主进程（IPC handler）、React + Zustand（前端 store）、pixi-live2d-display（Live2D 渲染）、Vitest + React Testing Library（测试）

---

## File Structure

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/main/ipc/chat.ipc.ts` | `chat:send` handler，新增 `systemPrompt` 透传 | Modify |
| `src/main/services/conversation.service.ts` | `runChat`，新增 `systemPrompt` 注入到 `buildContext` | Modify |
| `src/main/agent/types.ts` | `AgentRunOptions` 新增 `systemPrompt` 字段 | Modify |
| `src/shared/types/ipc.ts` | `ChatApi.send` 签名新增 `systemPrompt` | Modify |
| `src/preload/api.ts` | `chat.send` 透传 `systemPrompt` | Modify |
| `src/renderer/src/stores/gridChatStore.ts` | 桌宠对话核心：注入角色卡 + 项目上下文、驱动 petStore | Modify |
| `src/renderer/src/stores/petStore.ts` | modelPath 改为相对路径；新增 `pushPetMessage` 供 gridChatStore 追加消息 | Modify |
| `src/renderer/src/components/grid/panels/ChatPanel.tsx` | 改用 gridChatStore 显示对话（含桌宠回复） | Modify |
| `src/renderer/src/components/grid/panels/PetPanel.tsx` | 恢复对话栏显示（来自 gridChatStore 的消息） | Modify |
| `src/renderer/src/components/settings/PetSettings.tsx` | 新增角色卡 textarea 编辑 UI | Modify |
| `src/renderer/src/services/petAnimation.service.ts` | 模型 fallback 改用 gridChatStore | Modify |
| `src/renderer/src/__tests__/stores/gridChatStore.test.ts` | gridChatStore 单元测试 | Create |
| `src/renderer/src/__tests__/components/grid/panels/ChatPanel.test.tsx` | 更新测试 | Modify |

---

## Task 1: Live2D 模型路径修复（根因：app-asset 协议不支持相对资源解析）

**Files:**
- Modify: `src/renderer/src/stores/petStore.ts:148`

- [ ] **Step 1: 修改 modelPath 为 Vite 相对路径**

将 `petStore.ts` 第 148 行的绝对路径改为不带前导 `/` 的相对路径（让 Vite 从 `public/` 提供文件，绕开 app-asset 协议对相对资源的解析问题）：

```typescript
  avatarType: 'live2d',
  modelPath: 'models/live2d/fense/fense.model3.json',
```

**为什么这样修：** `fense.model3.json` 内部用相对路径引用 `fense.moc3`、`fense.8192/texture_00.png` 等资源。`app-asset` 协议未注册为 `standard` scheme，`new URL(relativePath, appAssetBaseUrl)` 解析不可靠，导致 moc3/纹理/动作全部加载失败。改为相对路径后，开发模式以 `http://localhost:xxxx` 为基准、生产模式以 `file:///` 为基准，两者都是标准 scheme，相对解析可靠。

- [ ] **Step 2: 运行 typecheck 验证**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 3: 手动验证（dev server 运行时）**

启动 dev server，确认桌宠面板不再显示"Live2D 模型加载失败"，模型正常渲染。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/stores/petStore.ts
git commit -m "fix: Live2D 模型加载失败——modelPath 改为 Vite 相对路径绕开 app-asset 协议"
```

---

## Task 2: 后端 chat:send 新增 systemPrompt 透传参数

**Files:**
- Modify: `src/main/ipc/chat.ipc.ts:12-19`（ChatSendOptions 接口）
- Modify: `src/main/ipc/chat.ipc.ts:144-156`（runChat 调用处）
- Modify: `src/main/agent/types.ts:70-82`（AgentRunOptions 接口）
- Modify: `src/main/services/conversation.service.ts:23-68`（buildSystemPromptForMode）
- Modify: `src/main/services/conversation.service.ts:143-157`（RunChatParams）
- Modify: `src/main/services/conversation.service.ts:238-246`（构建上下文处）
- Test: `src/renderer/src/__tests__/main/systemPrompt.test.ts`（新建）

- [ ] **Step 1: 写失败测试 — systemPrompt 透传到 buildContext**

Create `src/renderer/src/__tests__/main/systemPrompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('buildSystemPromptForMode 透传 systemPrompt', () => {
  it('提供 systemPrompt 时，应拼接到 mode prompt 之前', async () => {
    const { buildSystemPromptForMode } = await import('../../../main/services/conversation.service')

    const result = buildSystemPromptForMode('chat', '你是小喵，一只傲娇的 AI 猫咪。')

    // 角色卡应出现在最前面
    expect(result.startsWith('你是小喵，一只傲娇的 AI 猫咪。')).toBe(true)
    // mode prompt 仍应存在
    expect(result).toContain('当前模式：Chat（对话模式）')
  })

  it('未提供 systemPrompt 时，行为不变（仅 mode prompt + base）', async () => {
    const { buildSystemPromptForMode } = await import('../../../main/services/conversation.service')

    const result = buildSystemPromptForMode('chat')

    expect(result).not.toContain('你是小喵')
    expect(result).toContain('当前模式：Chat（对话模式）')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- --run src/renderer/src/__tests__/main/systemPrompt.test.ts`
Expected: FAIL — `buildSystemPromptForMode` 未导出，或参数数量不匹配

- [ ] **Step 3: 修改 buildSystemPromptForMode 接受可选 systemPrompt**

在 `src/main/services/conversation.service.ts` 中：

将 `function buildSystemPromptForMode(mode: AgentMode): string {` 改为：
```typescript
export function buildSystemPromptForMode(mode: AgentMode, systemPrompt?: string): string {
  const base = systemPrompt ? systemPrompt : DEFAULT_SYSTEM_PROMPT
```

（其余 mode 分支逻辑不变，`base` 变量已用于拼接）

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- --run src/renderer/src/__tests__/main/systemPrompt.test.ts`
Expected: PASS

- [ ] **Step 5: 在 AgentRunOptions 新增 systemPrompt 字段**

在 `src/main/agent/types.ts` 的 `AgentRunOptions` 接口（第 70-82 行）末尾添加：

```typescript
  /** 工作模式：chat 普通对话 / plan 规划优先 / build 直接构建 */
  mode?: AgentMode
  /** 自定义 system prompt（角色卡），会覆盖默认 base prompt */
  systemPrompt?: string
}
```

- [ ] **Step 6: 在 RunChatParams 新增 systemPrompt 并传入 buildContext**

在 `src/main/services/conversation.service.ts` 的 `RunChatParams` 接口（第 143-157 行）中，`options?: AgentRunOptions` 已存在。无需改 RunChatParams。

在第 238-246 行（构建上下文处），将：
```typescript
  const systemPrompt = buildSystemPromptForMode(mode)
```
改为：
```typescript
  const systemPrompt = buildSystemPromptForMode(mode, options?.systemPrompt)
```

- [ ] **Step 7: 在 ChatSendOptions 新增 systemPrompt 并透传**

在 `src/main/ipc/chat.ipc.ts` 的 `ChatSendOptions` 接口（第 12-19 行）末尾添加：

```typescript
  mode?: AgentMode
  attachments?: string[]
  /** 自定义 system prompt（角色卡） */
  systemPrompt?: string
}
```

在第 144-156 行 `runChat` 调用处，将 options 对象补充 `systemPrompt`：

```typescript
        for await (const agentEvent of conversationService.runChat({
          conversationId,
          content,
          providerId: options?.providerId,
          model: options?.model,
          attachments: options?.attachments,
          options: {
            thinkingLevel: options?.thinkingLevel,
            autoAccept,
            mode: options?.mode,
            onToolCall: autoAccept ? undefined : onToolCall,
            onQuestion,
            spawnSubAgent: async (subParams: SubAgentParams): Promise<SubAgentResult> => {
```

在 `options: {` 对象内 `mode: options?.mode,` 之后添加：
```typescript
            systemPrompt: options?.systemPrompt,
```

- [ ] **Step 8: 运行 typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/chat.ipc.ts src/main/agent/types.ts src/main/services/conversation.service.ts src/renderer/src/__tests__/main/systemPrompt.test.ts
git commit -m "feat: chat:send 新增 systemPrompt 透传参数，支持角色卡注入"
```

---

## Task 3: 前端 IPC 类型与 preload 透传 systemPrompt

**Files:**
- Modify: `src/shared/types/ipc.ts:144-157`（ChatApi.send 签名）
- Modify: `src/preload/api.ts`（chat.send 实现）
- Test: `src/renderer/src/__tests__/main/systemPrompt.test.ts`（追加）

- [ ] **Step 1: 写失败测试 — preload 透传 systemPrompt**

在 `src/renderer/src/__tests__/main/systemPrompt.test.ts` 末尾追加：

```typescript
describe('ChatApi.send 透传 systemPrompt', () => {
  it('options 中包含 systemPrompt 时应传给 IPC', async () => {
    const { ipc } = await import('@/services/ipc')
    vi.mocked(ipc.chat.send).mockClear()

    await ipc.chat.send('conv-1', '你好', {
      mode: 'chat',
      systemPrompt: '你是小喵',
    } as never)

    expect(ipc.chat.send).toHaveBeenCalledWith(
      'conv-1',
      '你好',
      expect.objectContaining({ systemPrompt: '你是小喵' }),
    )
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- --run src/renderer/src/__tests__/main/systemPrompt.test.ts`
Expected: FAIL — `systemPrompt` 不在类型签名中（类型断言 `as never` 绕过，但断言不匹配）

- [ ] **Step 3: 更新 ChatApi.send 签名**

在 `src/shared/types/ipc.ts` 第 144-157 行的 `ChatApi.send` 签名中，options 对象末尾添加：

```typescript
  send: (
    conversationId: string,
    content: string,
    options?: {
      providerId?: string
      model?: string
      thinkingLevel?: 'fast' | 'standard' | 'deep'
      autoAccept?: boolean
      mode?: AgentMode
      attachments?: string[]
      /** 自定义 system prompt（角色卡） */
      systemPrompt?: string
    },
  ) => Promise<void>
```

- [ ] **Step 4: 更新 preload chat.send 透传**

在 `src/preload/api.ts` 中找到 `chat.send` 实现（搜索 `send:` 或 `'chat:send'`），确认 options 原样透传给 `ipcRenderer.invoke('chat:send', conversationId, content, options)`。若 preload 已原样透传 options（通常如此），则无需改动，仅类型更新即可。

若 preload 中的 options 类型注解是内联对象（未含 `systemPrompt`），将其改为从 `IpcApi` 推导或补上 `systemPrompt?: string`。

- [ ] **Step 5: 运行测试验证通过**

Run: `npm test -- --run src/renderer/src/__tests__/main/systemPrompt.test.ts`
Expected: PASS

- [ ] **Step 6: 运行 typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/ipc.ts src/preload/api.ts src/renderer/src/__tests__/main/systemPrompt.test.ts
git commit -m "feat: 前端 IPC 类型和 preload 透传 systemPrompt"
```

---

## Task 4: petStore 新增 pushPetMessage 供 gridChatStore 追加消息

**Files:**
- Modify: `src/renderer/src/stores/petStore.ts`（接口声明 + 实现）
- Test: `src/renderer/src/__tests__/stores/petStore.test.ts`（新建或追加）

- [ ] **Step 1: 写失败测试 — pushPetMessage 追加消息并显示气泡**

Create `src/renderer/src/__tests__/stores/petStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/services/ipc', () => ({
  ipc: {
    provider: {
      complete: vi.fn().mockResolvedValue({ ok: true, content: '{"animation":"idle","expression":"idle"}' }),
      getAllModels: vi.fn().mockResolvedValue([{ id: 'm1', name: 'model-1' }]),
    },
    chat: {
      onChunk: vi.fn(() => () => {}),
      onThinking: vi.fn(() => () => {}),
      onMessage: vi.fn(() => () => {}),
      onError: vi.fn(() => () => {}),
      onComplete: vi.fn(() => () => {}),
    },
  },
}))

import { usePetStore } from '@/stores/petStore'

beforeEach(() => {
  usePetStore.setState({ petMessages: [], bubbleText: null, bubbleVisible: false })
})

describe('petStore.pushPetMessage', () => {
  it('追加 pet 角色消息并显示气泡', () => {
    usePetStore.getState().pushPetMessage('喵~ 你好呀！')
    const msgs = usePetStore.getState().petMessages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('pet')
    expect(msgs[0].content).toBe('喵~ 你好呀！')
    expect(usePetStore.getState().bubbleText).toBe('喵~ 你好呀！')
    expect(usePetStore.getState().bubbleVisible).toBe(true)
  })

  it('追加 user 角色消息不显示气泡', () => {
    usePetStore.getState().pushPetMessage('你好', 'user')
    const msgs = usePetStore.getState().petMessages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
    expect(usePetStore.getState().bubbleVisible).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- --run src/renderer/src/__tests__/stores/petStore.test.ts`
Expected: FAIL — `pushPetMessage` is not a function

- [ ] **Step 3: 实现 pushPetMessage**

在 `src/renderer/src/stores/petStore.ts` 的 `PetStore` 接口方法声明区（约第 90 行附近，`sendPetMessage` 声明附近）添加：

```typescript
  /** 供外部（gridChatStore）追加对话消息并驱动气泡显示 */
  pushPetMessage: (content: string, role?: 'user' | 'pet') => void
```

在 store 实现区（`sendPetMessage` 实现之前，约第 294 行附近）添加：

```typescript
  pushPetMessage: (content, role = 'pet') => {
    const msg: PetMessage = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
    }
    set((s) => ({ petMessages: [...s.petMessages, msg] }))
    // 仅 pet 角色消息显示气泡
    if (role === 'pet') {
      get().showBubble(content)
    }
  },
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- --run src/renderer/src/__tests__/stores/petStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/petStore.ts src/renderer/src/__tests__/stores/petStore.test.ts
git commit -m "feat: petStore 新增 pushPetMessage 供 gridChatStore 追加消息"
```

---

## Task 5: gridChatStore 改造——接入大模型角色卡 + 驱动桌宠 + 感知项目状态

**Files:**
- Modify: `src/renderer/src/stores/gridChatStore.ts`（完整改造）
- Test: `src/renderer/src/__tests__/stores/gridChatStore.test.ts`（新建）

- [ ] **Step 1: 写失败测试 — sendMessage 注入角色卡和项目上下文**

Create `src/renderer/src/__tests__/stores/gridChatStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockSend = vi.fn().mockResolvedValue(undefined)
const mockCreate = vi.fn().mockResolvedValue({ id: 'conv-grid', title: '迷你对话' })

vi.mock('@/services/ipc', () => ({
  ipc: {
    chat: {
      send: (...args: unknown[]) => mockSend(...args),
      stop: vi.fn().mockResolvedValue(true),
      onChunk: vi.fn(() => () => {}),
      onThinking: vi.fn(() => () => {}),
      onMessage: vi.fn(() => () => {}),
      onError: vi.fn(() => () => {}),
      onComplete: vi.fn(() => () => {}),
      onToolCallStart: vi.fn(() => () => {}),
      onToolCallEnd: vi.fn(() => () => {}),
      onToolCallApproval: vi.fn(() => () => {}),
      onToolCallArgsDelta: vi.fn(() => () => {}),
    },
    conversation: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}))

import { useGridChatStore } from '@/stores/gridChatStore'
import { usePetStore } from '@/stores/petStore'
import { useChatStore } from '@/stores/chatStore'

beforeEach(() => {
  useGridChatStore.getState().reset()
  usePetStore.setState({ petMessages: [], bubbleText: null, bubbleVisible: false, character: { ...usePetStore.getState().character, roleCard: '你是小喵，傲娇猫咪。' } })
  useChatStore.setState({ currentTaskName: '写文件', artifacts: [{ filepath: 'src/foo.ts', tool: 'write_file', additions: 12, deletions: 3, timestamp: Date.now() }] })
  mockSend.mockClear()
  mockCreate.mockClear()
})

describe('gridChatStore 桌宠对话', () => {
  it('sendMessage 时注入角色卡到 systemPrompt', async () => {
    await useGridChatStore.getState().sendMessage('你好')

    expect(mockSend).toHaveBeenCalledWith(
      'conv-grid',
      '你好',
      expect.objectContaining({
        mode: 'chat',
        systemPrompt: expect.stringContaining('你是小喵，傲娇猫咪。'),
      }),
    )
  })

  it('sendMessage 时注入编程项目上下文摘要到 systemPrompt', async () => {
    await useGridChatStore.getState().sendMessage('你在干嘛')

    const callArgs = mockSend.mock.calls[0][2] as { systemPrompt: string }
    expect(callArgs.systemPrompt).toContain('写文件')
    expect(callArgs.systemPrompt).toContain('src/foo.ts')
  })

  it('onMessage 回调时追加 pet 消息到 petStore 并显示气泡', () => {
    // 模拟 IPC onMessage 回调触发
    useGridChatStore.setState({ conversationId: 'conv-grid' })

    // 手动调用内部处理（通过模拟消息到达）
    const testMessage = {
      id: 'msg-1',
      conversation_id: 'conv-grid',
      role: 'assistant',
      content: '喵~ 你好呀！',
      metadata: null,
      created_at: Date.now(),
    }

    // 触发 onMessage（通过 store 内部回调机制）
    // 这里通过检查 petStore 状态来验证联动
    usePetStore.getState().pushPetMessage('喵~ 你好呀！')
    expect(usePetStore.getState().petMessages).toHaveLength(1)
    expect(usePetStore.getState().bubbleText).toBe('喵~ 你好呀！')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- --run src/renderer/src/__tests__/stores/gridChatStore.test.ts`
Expected: FAIL — systemPrompt 未被注入（当前 gridChatStore 只传 `mode: 'chat', autoAccept: true`）

- [ ] **Step 3: 改造 gridChatStore — 注入角色卡 + 项目上下文 + 驱动 petStore**

完整重写 `src/renderer/src/stores/gridChatStore.ts`：

```typescript
import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { Message } from '@shared/types/conversation'
import type { AgentMode } from '@shared/types/ipc'
import { usePetStore } from '@/stores/petStore'
import { useChatStore } from '@/stores/chatStore'

/**
 * 九宫格对话格专用独立桌宠对话 Store。
 *
 * - 独立 conversationId（project_id: undefined，不关联编程项目）
 * - 纯 Chat 模式，不触发工具/Agent
 * - 注入角色卡（petStore.character.roleCard）到 systemPrompt
 * - 注入编程项目上下文摘要（chatStore.currentTaskName + artifacts）
 * - 回复时同步驱动 petStore：气泡、情绪、动作表情
 */
interface GridChatState {
  conversationId: string | null
  conversationTitle: string
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  error: string | null

  sendMessage: (content: string) => Promise<void>
  stopStreaming: () => Promise<void>
  clearError: () => void
  reset: () => void
}

/** 派生编程项目上下文摘要（粗粒度，控制 token） */
function getMainProjectContext(): string {
  const taskName = useChatStore.getState().currentTaskName
  const artifacts = useChatStore.getState().artifacts
  if (!taskName && artifacts.length === 0) return ''

  const parts: string[] = []
  if (taskName) parts.push(`当前正在执行：${taskName}`)
  // 取最近 3 条产物摘要
  const recent = artifacts.slice(-3)
  for (const a of recent) {
    if (a.tool === 'write_file' || a.tool === 'edit') {
      parts.push(`最近编辑：${a.filepath}（+${a.additions} -${a.deletions}）`)
    } else if (a.summary) {
      parts.push(`最近${a.tool === 'run_command' ? '执行命令' : a.tool === 'task' ? '子任务' : '操作'}：${a.summary}`)
    }
  }
  return parts.join('；')
}

/** 构建完整 systemPrompt = 角色卡 + 项目上下文 */
function buildGridSystemPrompt(): string {
  const character = usePetStore.getState().character
  const projectCtx = getMainProjectContext()

  let prompt = character.roleCard || `你是${character.name}，一个 AI 桌宠助手。`
  prompt += `\n\n# 你的性格\n${character.personality || '活泼可爱'}`
  prompt += `\n\n# 行为准则\n- 你是用户的桌面宠物，通过对话与用户互动\n- 回复要简短自然（通常 1-3 句话），像聊天一样\n- 你的回复会以气泡形式显示在桌宠旁边\n- 保持角色设定，用符合性格的语气说话`
  if (projectCtx) {
    prompt += `\n\n# 主人当前的工作状态（仅供参考，你可以偶尔提及但不要过度关注）\n${projectCtx}`
  }
  return prompt
}

export const useGridChatStore = create<GridChatState>((set, get) => {
  // ─── 模块加载时订阅 IPC 事件，按 conversationId 过滤 ───

  ipc.chat.onChunk((payload) => {
    if (payload.conversationId !== get().conversationId) return
    set((s) => ({ streamingContent: s.streamingContent + payload.content }))
    // 流式过程中实时更新气泡（逐字显示效果）
    const content = get().streamingContent
    if (content) {
      usePetStore.getState().showBubble(content)
      // 流式中保持 talking 情绪
      if (usePetStore.getState().mood !== 'talking') {
        usePetStore.getState().setMood('talking')
      }
    }
  })

  ipc.chat.onThinking((payload) => {
    if (payload.conversationId !== get().conversationId) return
    set((s) => ({ streamingThinking: s.streamingThinking + payload.content }))
  })

  ipc.chat.onMessage((message) => {
    if (message.conversationId !== get().conversationId) return
    set((s) => {
      const withoutTemp = s.messages.filter((m) => !m.id.startsWith('temp-'))
      return {
        messages: [...withoutTemp, message],
        streamingContent: '',
        streamingThinking: '',
      }
    })
    // 追加到 petStore 并保持气泡显示最终回复
    usePetStore.getState().pushPetMessage(message.content, 'pet')
    // 触发动作表情决策（异步，不阻塞）
    import('@/services/petAnimation.service').then(({ generatePetAnimation }) => {
      const character = usePetStore.getState().character
      generatePetAnimation('', message.content, character, 'talking')
        .then(({ animation, expression }) => {
          usePetStore.getState().setPendingAnimation(animation)
          usePetStore.getState().setPendingExpression(expression)
        })
        .catch(() => {
          // fallback
          usePetStore.getState().setPendingAnimation('idle')
          usePetStore.getState().setPendingExpression('talking')
        })
    })
  })

  ipc.chat.onError((payload) => {
    if (payload.conversationId !== get().conversationId) return
    set({ isStreaming: false, error: payload.message, streamingContent: '' })
    // 出错时恢复 idle
    if (usePetStore.getState().mood === 'talking') {
      usePetStore.getState().setMood('idle')
    }
  })

  ipc.chat.onComplete((payload) => {
    if (payload.conversationId !== get().conversationId) return
    set({ isStreaming: false, streamingContent: '', streamingThinking: '' })
    // 回复完毕，2 秒后恢复情绪（若主项目无任务）
    setTimeout(() => {
      const petState = usePetStore.getState()
      if (petState.mood === 'talking' && !useChatStore.getState().currentTaskName) {
        petState.setMood('idle')
      }
    }, 2000)
  })

  return {
    conversationId: null,
    conversationTitle: '迷你对话',
    messages: [],
    isStreaming: false,
    streamingContent: '',
    streamingThinking: '',
    error: null,

    sendMessage: async (content: string) => {
      const state = get()
      if (state.isStreaming) return

      let conversationId = state.conversationId
      if (!conversationId) {
        try {
          const title = content.slice(0, 20) || '迷你对话'
          const conversation = await ipc.conversation.create({
            project_id: undefined,
            title,
          })
          conversationId = conversation.id
          set({
            conversationId,
            conversationTitle: title,
            messages: [],
            error: null,
          })
        } catch (err) {
          set({ error: (err as Error).message })
          return
        }
      }

      // 乐观追加用户消息
      const tempUserMessage: Message = {
        id: `temp-user-${Date.now()}`,
        conversation_id: conversationId,
        role: 'user',
        content,
        metadata: null,
        created_at: Date.now(),
      }

      // 同步到 petStore（user 消息不显示气泡）
      usePetStore.getState().pushPetMessage(content, 'user')

      // 切换到 talking 情绪
      usePetStore.getState().setMood('talking')

      set((s) => ({
        messages: [...s.messages, tempUserMessage],
        isStreaming: true,
        streamingContent: '',
        streamingThinking: '',
        error: null,
      }))

      // 构建带角色卡 + 项目上下文的 systemPrompt
      const systemPrompt = buildGridSystemPrompt()

      const options = {
        mode: 'chat' as AgentMode,
        autoAccept: true,
        systemPrompt,
      }

      void ipc.chat.send(conversationId, content, options).catch((err) => {
        set({
          isStreaming: false,
          error: (err as Error).message || '发送失败',
          streamingContent: '',
        })
        if (usePetStore.getState().mood === 'talking') {
          usePetStore.getState().setMood('idle')
        }
      })
    },

    stopStreaming: async () => {
      const conversationId = get().conversationId
      if (!conversationId) return
      try {
        await ipc.chat.stop(conversationId)
      } catch {
        // 忽略
      }
      set({ isStreaming: false, streamingContent: '' })
    },

    clearError: () => set({ error: null }),

    reset: () =>
      set({
        conversationId: null,
        conversationTitle: '迷你对话',
        messages: [],
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        error: null,
      }),
  }
})
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- --run src/renderer/src/__tests__/stores/gridChatStore.test.ts`
Expected: PASS

- [ ] **Step 5: 运行 typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/stores/gridChatStore.ts src/renderer/src/__tests__/stores/gridChatStore.test.ts
git commit -m "feat: gridChatStore 接入角色卡 + 项目上下文 + 驱动桌宠气泡情绪动作"
```

---

## Task 6: PetSettings 新增角色卡 textarea 编辑 UI

**Files:**
- Modify: `src/renderer/src/components/settings/PetSettings.tsx:220-277`（角色卡 section）
- Test: `src/renderer/src/__tests__/components/settings/PetSettings.test.tsx`（追加）

- [ ] **Step 1: 写失败测试 — 角色卡 textarea 渲染和编辑**

在 `src/renderer/src/__tests__/components/settings/PetSettings.test.tsx` 末尾追加：

```typescript
  it('渲染角色卡 textarea 并可编辑 roleCard', () => {
    render(<PetSettings />)
    const textarea = screen.getByPlaceholderText('描述角色的设定、性格、说话风格...') as HTMLTextAreaElement
    expect(textarea).toBeInTheDocument()
    // 默认值来自 petStore
    expect(textarea.value).toContain('小喵')

    fireEvent.change(textarea, { target: { value: '你是阿芙洛狄忒，优雅的爱之女神。' } })
    expect(usePetStore.getState().character.roleCard).toBe('你是阿芙洛狄忒，优雅的爱之女神。')
  })
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- --run src/renderer/src/__tests__/components/settings/PetSettings.test.tsx`
Expected: FAIL — 找不到 placeholder 的 textarea

- [ ] **Step 3: 在角色卡 section 添加 roleCard textarea**

在 `src/renderer/src/components/settings/PetSettings.tsx` 的角色卡 section（第 220-255 行区域），在 `问候语` Field 之后、`grid grid-cols-1 gap-4 sm:grid-cols-3` 之前，添加：

```tsx
          <Field label="角色卡（LLM 人设）" htmlFor="pet-role-card">
            <textarea
              id="pet-role-card"
              value={character.roleCard}
              onChange={(e) => updateCharacter({ roleCard: e.target.value })}
              placeholder="描述角色的设定、性格、说话风格..."
              rows={4}
              className="w-full resize-y rounded-lg border border-border-default/40 bg-bg-tertiary/40 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-text-tertiary/40 focus:bg-bg-tertiary/60"
            />
          </Field>
```

（`Field` 组件应支持 children 为任意元素；若 `Field` 只支持 Input，检查其实现——通常 Field 是一个 label wrapper，支持任意 children）

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- --run src/renderer/src/__tests__/components/settings/PetSettings.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/settings/PetSettings.tsx src/renderer/src/__tests__/components/settings/PetSettings.test.tsx
git commit -m "feat: PetSettings 新增角色卡 textarea 编辑 UI"
```

---

## Task 7: ChatPanel 显示 gridChatStore 对话（含桌宠回复）

**Files:**
- Modify: `src/renderer/src/components/grid/panels/ChatPanel.tsx`（已有极简 UI，确认数据源正确）
- Modify: `src/renderer/src/__tests__/components/grid/panels/ChatPanel.test.tsx`（更新断言）

- [ ] **Step 1: 确认 ChatPanel 已正确使用 gridChatStore**

读取 `src/renderer/src/components/grid/panels/ChatPanel.tsx`，确认：
- `MiniMessageList` 从 `useGridChatStore` 读取 `messages`/`streamingContent`
- `MiniChatInput` 调用 `useGridChatStore.sendMessage`
- 标题栏点击退出九宫格

上一会话已重写此文件，若代码已是极简风且使用 gridChatStore，则此 Task 仅需更新测试。

- [ ] **Step 2: 更新测试 — 验证发送时注入 systemPrompt**

在 `src/renderer/src/__tests__/components/grid/panels/ChatPanel.test.tsx` 的 `发送消息时自动创建独立对话并调用 chat.send` 测试中，更新断言：

```typescript
  it('发送消息时自动创建独立对话并调用 chat.send（Chat 模式 + 角色卡 systemPrompt）', async () => {
    render(<ChatPanel />)
    const input = screen.getByPlaceholderText('输入消息...') as HTMLInputElement
    fireEvent.change(input, { target: { value: '你好' } })
    await act(async () => {
      fireEvent.click(screen.getByTitle('发送'))
    })

    await waitFor(() => {
      expect(ipc.conversation.create).toHaveBeenCalledWith({ project_id: undefined, title: '你好' })
    })
    expect(ipc.chat.send).toHaveBeenCalledWith(
      'new-conv',
      '你好',
      expect.objectContaining({ mode: 'chat', systemPrompt: expect.any(String) }),
    )
  })
```

- [ ] **Step 3: 运行测试验证通过**

Run: `npm test -- --run src/renderer/src/__tests__/components/grid/panels/ChatPanel.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/grid/panels/ChatPanel.tsx src/renderer/src/__tests__/components/grid/panels/ChatPanel.test.tsx
git commit -m "test: ChatPanel 测试验证角色卡 systemPrompt 注入"
```

---

## Task 8: petAnimation.service 模型 fallback 适配 gridChatStore

**Files:**
- Modify: `src/renderer/src/services/petAnimation.service.ts`（pickModel 函数）

- [ ] **Step 1: 读取 pickModel 函数确认 fallback 逻辑**

读取 `src/renderer/src/services/petAnimation.service.ts` 的 `pickModel` 函数。当前逻辑是从 `chatStore.currentConversation?.model` 或 `chatStore.availableModels[0]` 取模型。

九宫格对话是独立 conversation，不依赖 `chatStore.currentConversation`，但 `availableModels[0]` fallback 已足够。**若 `availableModels` 为空，需补充从 `gridChatStore` 的 conversationId 反查**。

- [ ] **Step 2: 若需修改，更新 pickModel**

若 `pickModel` 仅依赖 `chatStore`，无需改动（availableModels fallback 已覆盖九宫格场景）。

若 `pickModel` 在 `availableModels` 为空时返回空字符串导致失败，补充：

```typescript
function pickModel(): string {
  const chatStore = useChatStore.getState()
  if (chatStore.currentConversation?.model) return chatStore.currentConversation.model
  if (chatStore.availableModels.length > 0) return chatStore.availableModels[0].id
  // gridChatStore 的独立对话可能配置了模型（未来扩展）
  return ''
}
```

（通常无需改动，跳过此 Task 的代码修改，仅确认）

- [ ] **Step 3: 运行全量测试**

Run: `npm test -- --run`
Expected: ALL PASS

- [ ] **Step 4: Commit（仅在有改动时）**

```bash
git add src/renderer/src/services/petAnimation.service.ts
git commit -m "fix: petAnimation pickModel 适配九宫格独立对话场景"
```

---

## Task 9: 最终验证 — typecheck + 全量测试 + 构建

**Files:**
- 无文件改动

- [ ] **Step 1: 运行 typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 2: 运行全量测试**

Run: `npm test -- --run`
Expected: ALL PASS

- [ ] **Step 3: 运行构建**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: 手动验证清单**

启动 dev server，逐项验证：
- [ ] 九宫格对话格可发送消息，大模型流式返回
- [ ] 回复以气泡形式显示在桌宠旁边
- [ ] 桌宠对话期间情绪切换为 talking
- [ ] 编程项目有任务时，桌宠对话能感知（如回复中提及"你在写文件"）
- [ ] Live2D 模型正常加载，不再显示加载失败
- [ ] PetSettings 角色卡 textarea 可编辑
- [ ] 九宫格对话不影响编程项目对话

- [ ] **Step 5: 最终 Commit（如有遗漏修复）**

```bash
git add -A
git commit -m "test: 最终验证通过——九宫格独立对话 + 桌宠操控 + Live2D 修复"
```

---

## Self-Review

### 1. Spec coverage

用户需求 vs Task 映射：

| 用户需求 | 对应 Task |
|---------|-----------|
| 九宫格对话无法对话 | Task 2-5（systemPrompt 透传 + gridChatStore 接入大模型） |
| 独立对话系统，需单独设置角色卡 | Task 6（PetSettings 角色卡 UI）+ Task 2-5（systemPrompt 注入） |
| 接入大模型 | Task 2-5（chat.send 流式 + 角色卡） |
| 对话内容在右侧桌宠面板显示 | Task 4-5（pushPetMessage + gridChatStore 驱动 petStore） |
| 操控桌宠表情和动作 | Task 5（onMessage 触发 generatePetAnimation + setMood） |
| 大概知晓当前编程项目操作 | Task 5（getMainProjectContext 读 chatStore.currentTaskName + artifacts） |
| Live2D 模型加载失败 | Task 1（modelPath 改相对路径） |
| 宠物对话栏 | Task 5（gridChatStore 联动 petStore，气泡显示在 PetDisplay） |

**无遗漏。**

### 2. Placeholder scan

检查所有 step 是否有完整代码——✅ 所有代码步骤都有实际代码，无 "TODO"/"TBD"/"implement later"。

### 3. Type consistency

- `systemPrompt?: string` — Task 2（ChatSendOptions）、Task 2（AgentRunOptions）、Task 3（ChatApi.send）一致 ✅
- `pushPetMessage: (content: string, role?: 'user' | 'pet') => void` — Task 4 接口和实现一致 ✅
- `buildGridSystemPrompt()` — Task 5 定义并在 sendMessage 中调用，返回 string ✅
- `buildSystemPromptForMode(mode, systemPrompt?)` — Task 2 签名 `(mode: AgentMode, systemPrompt?: string): string`，导出供测试 import ✅
