# OpenCode 底层架构整合设计文档

> **目标**：将 OpenCode 底层架构（AbortController、权限白名单、工具验证、Prompt 注入）整合到 ZX-Code 项目，同时修复已知的对话切换/模型列表/Chat2API 多轮超时问题

**架构方向**：借鉴 OpenCode 的 AbortSignal 机制、权限持久化模型、多轮工具调用协议，而非直接替换整个框架

**Tech Stack**：Electron + React + TypeScript + SQLite + Chat2API

---

## 模块 1：AbortController 集成

**目的**：解决对话切换时旧对话仍在后台运行的问题

### 改动文件

- Modify: `src/shared/types/tool.ts` — ToolContext 增加 `abortSignal`
- Modify: `src/main/agent/engine.ts` — AgentRunParams 增加 `abortSignal`，循环中检查 `signal.aborted`
- Modify: `src/main/ipc/chat.ipc.ts` — runningChats 存储 AbortController，stop handler 触发 abort
- Modify: `src/renderer/src/stores/chatStore.ts` — stopStreaming 增加 abort 信号

### 数据流

```
selectConversation(id) 
  → stopStreaming() 
  → ipc.chat.stop(conversationId) 
  → chat.ipc.ts handler: runningChats.get(id).abortController.abort() 
  → engine.ts runConversation: 下次循环检查 signal.aborted → yield finish: 'cancelled'
  → preload 事件处理器清理前端流式状态
```

### 关键设计决策

- AbortController 在 `chat:send` handler 中创建，生命周期绑定到该次运行
- 引擎捕获 AbortError 时 yield `{ type: 'finish', reason: 'cancelled' }` 正常结束，而非抛异常
- 每个 conversation 最多有一个活跃的 AbortController

---

## 模块 2：权限白名单持久化

**目的**：解决"总是允许"不生效的问题；增加"全部允许"全局开关

### 改动文件

- Modify: `src/renderer/src/components/chat/PermissionDialog.tsx` — handleAlwaysAllow 写入持久化规则
- Modify: `src/renderer/src/components/settings/PermissionSettings.tsx` — 增加"信任此工作区"全局允许 toggle

### 权限规则存储

已有的 `permission.service.ts` 支持 `{ tool: string, action: PermissionAction }` 规则，通过 `settingsRepo` 持久化到 SQLite：

```typescript
// PermissionDialog.handleAlwaysAllow
await ipc.permission.setRules([{ tool: toolName, action: 'allow' }])
// 这会追加/覆盖而不是替换全部规则
```

### 全局允许开关

设置页增加一个醒目的"信任此工作区（允许所有工具）"开关：

```typescript
// 开启时：写入通配符规则
[{ tool: '*', action: 'allow' }]
// 关闭时：恢复默认规则
DEFAULT_PERMISSION_RULES
```

---

## 模块 3：模型列表修复

**目的**：解决 DeepSeek 重复显示/重复选中/删除后仍显示问题

### 改动文件

- Modify: `src/renderer/src/components/chat/ModelSelector.tsx`
- Inspect: `src/main/database/repositories/provider.repo.ts` — 确认 removeModels 逻辑

### 改动要点

1. **删除硬编码 DeepSeek 优先**：将自动选中逻辑从 `find(m => m.name.includes('deepseek'))` 改为简单的 `availableModels[0]`
2. **用 `id` 而非 `name` 匹配**：避免 API DeepSeek 和 webchat DeepSeek 互相误匹配
3. **确认 SQLite 删除逻辑**：确保删除 provider 时关联的 models 也被清理

---

## 模块 4：Chat2API 多轮工具调用修复

**目的**：解决"超过一轮对话后返回超时"的问题

### 改动文件

- Modify: `src/main/chat2api/proxy/services/promptInjectionService.ts`

### 根因

第一轮 prompt 注入后，`system` 消息中包含 tool calling 协议签名（如 `## Available Tools`、`[function_calls]`）。
第二轮请求时 `detection.injectsPrompt=true`，导致注射被跳过，模型没有 tool 协议指引从而不知道如何回复工具结果。

### 修复方案

```typescript
process(messages, tools, model, provider) {
  // 1. 检测是否需要清除旧注入
  const hasToolResults = messages.some(m => m.role === 'tool')
  if (hasToolResults) {
    // 2. 清除旧注入
    messages = this.cleanOldInjection(messages)
  }
  // 3. 重新检测并注入（此时 injectsPrompt=false，会正常注入）
  const detection = detectClient(messages, tools)
  // 4. 后续逻辑不变...
}
```

---

## 验证策略

每个模块改动后：

1. **TypeScript 类型检查**：`npm run typecheck` 必须通过
2. **手动验证**：
   - AbortController：创建一个对话发送消息，快速切换到另一个对话，确认原对话停止
   - 权限白名单：点"总是允许"后重新发送相同工具调用，确认不再弹窗
   - 模型列表：在设置页删除 DeepSeek provider，切回聊天页面确认消失
   - Chat2API 多轮：选网页模型发送需要多步执行的任务，确认能完成

---

## 文件改动汇总

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/shared/types/tool.ts` | Modify | ToolContext 增加 abortSignal |
| `src/main/agent/engine.ts` | Modify | 引擎循环检查 abortSignal |
| `src/main/ipc/chat.ipc.ts` | Modify | 创建/触发 AbortController |
| `src/renderer/src/stores/chatStore.ts` | Modify | stopStreaming 增强 |
| `src/renderer/src/components/chat/PermissionDialog.tsx` | Modify | 总是允许持久化 |
| `src/renderer/src/components/settings/PermissionSettings.tsx` | Modify | 全局允许 toggle |
| `src/renderer/src/components/chat/ModelSelector.tsx` | Modify | 去掉硬编码，用 id 匹配 |
| `src/main/chat2api/proxy/services/promptInjectionService.ts` | Modify | 多轮工具调用注入修复 |
