# ZX-Code UI 移植与改进 — 开发计划

> 基于 https://github.com/hsiaol/claude-code-desktop 移植前端 UI 样式与功能，同时保留当前项目 Framer Motion 动画体系并增强用户体验。
> 
> **注意：全局保留当前项目的 Framer Motion 动画体系（cubic-bezier(0.16, 1, 0.3, 1)）、双主题 CSS 变量、surface-3d / lift-button / border-shimmer 等基础样式，不做更改。**

---

## 目录

1. [项目架构](#1-项目架构)
2. [数据模型](#2-数据模型)
3. [左侧栏改造（VS Code 风格）](#3-左侧栏改造vs-code-风格)
4. [工具调用显示改造（纯文字+流光）](#4-工具调用显示改造纯文字流光)
5. [新建组件](#5-新建组件)
6. [现有组件增强](#6-现有组件增强)
7. [全局 CSS 与动画](#7-全局-css-与动画)
8. [实施顺序](#8-实施顺序)
9. [完整文件清单](#9-完整文件清单)

---

## 1. 项目架构

### 技术栈

| 层 | 技术 |
|---|------|
| 渲染框架 | React 19 + TypeScript |
| 构建 | Vite 5 + electron-vite |
| 样式 | Tailwind CSS 3 + CSS Variables |
| 动画 | Framer Motion 11（保留全部现有动画） |
| 状态管理 | Zustand 5 |
| Markdown | react-markdown + rehype-highlight + remark-gfm |
| 文件编辑 diff | `diff` + `@types/diff` |

### 项目结构（仅涉及部分）

```
src/renderer/src/
├── components/
│   ├── chat/
│   │   ├── ActivityBar.tsx           # [重写] 实时工具活动状态条，纯文字+流光
│   │   ├── ChatInput.tsx             # [增强] IME + 计时器 + 模型下拉
│   │   ├── ChatContextMenu.tsx       # 不动
│   │   ├── ContextUsagePanel.tsx     # 不动
│   │   ├── ConversationHistory.tsx   # 不动（仍被引用）
│   │   ├── DiffView.tsx              # 不动
│   │   ├── MarkdownRenderer.tsx      # 不动
│   │   ├── MessageItem.tsx           # [增强] 复制按钮 + 长消息折叠
│   │   ├── MessageList.tsx           # [增强] TypingIndicator 追加
│   │   ├── ModelSelector.tsx         # 不动
│   │   ├── ModeSwitcher.tsx          # 不动
│   │   ├── QuestionCard.tsx          # 不动
│   │   ├── SelectionToolbar.tsx      # 不动
│   │   ├── ThinkingLevelSelector.tsx # 不动
│   │   ├── TodoListPanel.tsx         # 不动
│   │   ├── ToolCallView.tsx          # [重写] 纯文字+流光头部
│   │   ├── WorkspaceList.tsx         # [重写] → WorkspacePanel（VS Code 风格）
│   │   ├── PermissionDialog.tsx      # [新建] 独立 Modal 权限审批
│   │   ├── TypingIndicator.tsx       # [新建] 弹跳点动画
│   │   └── TabBar.tsx                # [新建] 多会话标签栏
│   ├── layout/
│   │   ├── AppLayout.tsx             # 不动
│   │   ├── LeftSidebar.tsx           # [重写] VS Code Activity Bar 风格
│   │   ├── RightSidebar.tsx          # 不动
│   │   ├── StatusBar.tsx             # 不动
│   │   ├── TitleBar.tsx              # 不动
│   │   └── BottomBar.tsx             # 不动
│   └── ui/                           # 不动
├── pages/
│   ├── ChatPage.tsx                  # [增强] 集成 TabBar + 欢迎页示例按钮
│   └── (其他页面不动)
├── stores/
│   ├── chatStore.ts                  # 不动（已有 ToolCallState 等完整类型）
│   ├── uiStore.ts                    # 可能需新增 tabBar 相关状态
│   └── (其他 stores 不动)
├── styles/
│   └── globals.css                   # [增强] 新增动画关键帧
└── utils/                            # 不动
```

---

## 2. 数据模型

### `ToolCallState`（chatStore.ts，已有）

```typescript
export interface ToolCallState {
  toolCallId: string
  name: string           // 工具名：'write_file' | 'edit' | 'run_command' | ...
  args: string           // JSON 字符串参数
  result?: ToolExecutionResult
  status: 'running' | 'completed' | 'error' | 'pending_approval'
  startedAt?: number
  endedAt?: number
}
```

### `ToolExecutionResult`（`@shared/types/tool.ts`，已有）

```typescript
export interface ToolExecutionResult {
  tool_call_id: string
  content: string
  is_error: boolean
  metadata?: {
    diff?: { filepath: string; patch: string; additions: number; deletions: number }
    todos?: Array<{ id: string; content: string; status: string; priority: string }>
    command?: { command: string; exitCode: number; duration: number }
    task?: { taskId: string; subagentType: string; description: string; state: string }
    terminal?: { sessionId: string; shell?: string; lines: number }
  }
}
```

### 权限请求类型（新增，用于 PermissionDialog）

```typescript
// 定义在 PermissionDialog.tsx 内即可，或扩展至 shared/types
interface PermissionDialogProps {
  requestId: string
  sessionId: string
  toolName: string
  toolInput: string
  /** 高风险工具标识 */
  riskLevel: 'low' | 'medium' | 'high'
  onAllow: () => void
  onDeny: () => void
  onAlwaysAllow: () => void
}
```

---

## 3. 左侧栏改造（VS Code 风格）

### 3.1 布局结构

```
┌──────────────────────────────────────────────────────────┐
│  TitleBar (不动)                                           │
├────┬─────────────────────────────────────────────────────┤
│ 48 │  Workspace Panel (260px, 选中时展开)                 │
│ px │                                                     │
│ A  │  ZX-code-1.2              ← 工作区名+流光文字      │
│ c  │  D:\密码\ZX-code-1.2      ← 路径（灰色小字）      │
│ t  │                                                     │
│ i  │  ┌──────────────────────────────────────┐          │
│ v  │  │  + 新建会话                           │ ← 按钮   │
│ i  │  └──────────────────────────────────────┘          │
│ t  │                                                     │
│ y  │  ┌──────────────────────────────────────┐          │
│    │  │  📄 移植 claude-code...   刚刚    ← 流光边框  │
│    │  │  📄 对话2                    2小时前           │
│    │  │  📄 对话3                    昨天             │
│ B  │  └──────────────────────────────────────┘          │
│ a  │                                                     │
│ r  │                                                     │
│    ├────────────────────────────────────────────────────┤
│    │  (ChatPage 内容)                                    │
│    │                                                     │
│    │                                                     │
└────┴─────────────────────────────────────────────────────┘
```

### 3.2 Activity Bar（左侧 48px 窄条）

**文件**: `src/renderer/src/components/layout/LeftSidebar.tsx`（重写）

**设计要点：**
- 宽度固定 48px，深色背景
- 每个工作区用一个**彩色方块 + 单字符**表示
- 字符取自工作区名称的首字符（中文/英文）
- 颜色由 `project.color` 字段决定，若无则根据名称 hash 分配
- 选中项：左侧有 2px 蓝色/主题色指示条，边框有 `border-glow-active` 流光动画
- 方块大小：32×32px，圆角 6px
- 方块之间间距 4px
- 底部固定：`+` 按钮（新建工作区） + `⚙` 按钮（设置）
- hover 时显示 Tooltip 提示工作区全名

**如何提取首字符 + 颜色：**
```typescript
function getProjectColor(name: string): string {
  const colors = [
    '#5ba6ff', '#00d97e', '#ffa940', '#ff5c5c', '#b366ff',
    '#c8965a', '#4fc3f7', '#f06292', '#aed581', '#7986cb',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function getProjectInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}
```

**布局伪代码：**
```tsx
<>
  {/* Absolute 层：Activity Bar */}
  <div className="w-12 flex flex-col items-center py-2 border-r border-border-default bg-bg-primary">
    {projects.map(project => (
      <button key={project.id} className="w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-bold"
        style={{ backgroundColor: getProjectColor(project.name) }}
        title={project.name}
        onClick={() => switchProject(project.id)}
      >
        {/* 选中时边框流光 */}
        {isActive && <motion.span className="absolute -left-1.5 top-1/2 w-0.5 h-5 rounded-full bg-accent-blue" />}
        {getProjectInitial(project.name)}
      </button>
    ))}
    <div className="flex-1" />
    <button>+</button>
    <button>⚙</button>
  </div>

  {/* Workspace Panel：选中时显示 */}
  {currentProject && (
    <motion.div className="w-64 border-r border-border-default">
      <WorkspacePanel project={currentProject} />
    </motion.div>
  )}

  {/* main content */}
  <main className="flex-1">{children}</main>
</>
```

### 3.3 Workspace Panel

**文件**: `src/renderer/src/components/chat/WorkspaceList.tsx`（重写为 WorkspacePanel）

**设计要点：**
- 面板宽度 260px
- 顶部：工作区名（`.text-shimmer` 流光文字）+ 路径（灰色小字 `text-text-tertiary`）
- "新建会话" 按钮：圆角按钮，hover 时边框高亮
- 对话列表：每个对话项包含：
  - 左侧 4px 蓝色指示条（选中时）
  - 对话标题（截断）
  - 右侧相对时间（`刚刚` / `2小时前` / `昨天`）
  - hover 时显示重命名铅笔图标 + 删除图标
  - **选中对话项：整体边框 `border-glow-active` 流光动画**（使用 CSS `border-image` + gradient animation 或 box-shadow animation）

**流光边框动画实现方案：**
```css
/* 方案1: box-shadow 动画（推荐，性能更好） */
@keyframes borderGlow {
  0%   { box-shadow: 0 0 0 0 transparent, 0 0 0 0 transparent; }
  25%  { box-shadow: 0 0 0 1px var(--accent-blue), 0 0 8px var(--accent-blue); }
  50%  { box-shadow: 0 0 0 1px var(--accent-purple), 0 0 8px var(--accent-purple); }
  75%  { box-shadow: 0 0 0 1px var(--accent-blue), 0 0 8px var(--accent-blue); }
  100% { box-shadow: 0 0 0 0 transparent, 0 0 0 0 transparent; }
}

.border-glow-active {
  animation: borderGlow 3s ease-in-out infinite;
}
```

---

## 4. 工具调用显示改造（纯文字+流光）

### 4.1 ToolCallView

**文件**: `src/renderer/src/components/chat/ToolCallView.tsx`（重写）

**改造目标：**
- **移除所有图标**（lucide-react 的 Wrench/FileEdit/Terminal/Search 等全部去掉）
- **头部始终显示完整信息**（无论展开还是折叠）：
  ```
  写入文件 src/App.tsx  +12 -3  0.8s  ✅ 已完成
  ```
  - `写入文件` — 工具中文名（`.text-shimmer` 流光）
  - `src/App.tsx` — 目标文件/路径（`.text-shimmer` 流光）
  - `+12 -3` — 增删行数（`text-accent-green` / `text-accent-red`）
  - `0.8s` — 耗时（`text-text-tertiary`）
  - `✅ 已完成` / `🔄 运行中` / `❌ 错误` — 状态（带颜色）
- **展开区域**：去图标，纯文字展示参数/结果/diff，无流光
- **审批按钮**：去图标，纯文字 "批准" / "拒绝"
- **风险工具**：高风险工具头部添加 `[!]` 警告前缀，点击触发 PermissionDialog

**伪代码：**
```tsx
// 工具中文名映射（保留，但只用于字符串显示，不映射图标）
const toolNameMap: Record<string, string> = { ... }

// 状态配置（保留字符串，不映射图标）
const statusConfig = { ... } // label + color

export const ToolCallView = memo(function ToolCallView({ toolCall }) {
  const toolLabel = toolNameMap[toolCall.name] ?? toolCall.name
  const filePath = extractPathFromArgs(toolCall.args)
  const isHighRisk = ['run_command', 'delete_file', 'bash'].includes(toolCall.name)

  return (
    <div className="border-l-2 border-l-status rounded-md">
      {/* 头部：始终可见 */}
      <button onClick={toggle}>
        <ChevronRight />
        <span className="text-shimmer">{toolLabel}</span>
        {filePath && <span className="text-shimmer">{filePath}</span>}
        {diff && <><span className="text-accent-green">+{diff.additions}</span><span className="text-accent-red">-{diff.deletions}</span></>}
        {toolCall.startedAt && <span>{formatDuration(toolCall)}</span>}
        <span className={statusColor}>{statusLabel}</span>
        {isHighRisk && <span className="text-accent-orange">[!]</span>}
      </button>

      {/* 展开区域（去图标） */}
      {expanded && (
        <div>
          <div>参数</div>
          <pre>{formattedArgs}</pre>
          {toolCall.result && <div>结果</div>}
          {toolCall.result && <pre>{formattedResult}</pre>}
          {diffMeta && <DiffView ... />}

          {/* 审批按钮（纯文字） */}
          {status === 'pending_approval' && (
            <div>
              <button onClick={approve}>批准</button>
              <button onClick={deny}>拒绝</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
```

**extractPathFromArgs 函数：**
```typescript
function extractPathFromArgs(name: string, args: string): string | null {
  try {
    const parsed = JSON.parse(args)
    if (name === 'write_file' || name === 'edit' || name === 'read_file') return parsed.path || null
    if (name === 'run_command') return parsed.command ? parsed.command.slice(0, 40) + '...' : null
    if (name === 'list_files') return parsed.path || '.'
    if (name === 'grep') return parsed.pattern || null
    if (name === 'task') return parsed.description || null
    return null
  } catch { return null }
}
```

### 4.2 ActivityBar

**文件**: `src/renderer/src/components/chat/ActivityBar.tsx`（重写）

**改造目标：**
- **移除所有图标**
- 每行纯文字显示：
  ```
  写入文件 src/App.tsx  +12 -3  0.8s  ✅
  执行命令 npm run build           5.2s  🔄
  ```
- 工具名+文件路径使用 `.text-shimmer` 流光
- 状态+耗时正常颜色（无流光）
- 布局与当前保持一致（实时活动条，在消息区顶部）

---

## 5. 新建组件

### 5.1 PermissionDialog

**文件**: `src/renderer/src/components/chat/PermissionDialog.tsx`（新建）

**设计要点：**
- 独立 Modal 覆盖层（`fixed inset-0 bg-black/50`）
- 居中弹窗，max-w-md
- 内容：
  - 风险等级标识：纯文字 `[!] 高风险操作` / `[i] 中风险` / `[i] 低风险`，文字颜色对应红/橙/蓝
  - 标题：`权限请求`
  - 描述：`AI 请求执行以下操作`
  - 工具名（纯文字，无图标）
  - 参数 JSON 预览（pre 标签）
  - 三个按钮：
    - **总是允许**（primary 按钮，蓝色背景）
    - **拒绝**（红色文字按钮）
    - **仅本次允许**（outline 按钮）

**调用时机：**
- 在 `chatStore.setToolCallStart` 中，若工具名为高风险（`run_command` / `delete_file` / `bash`），将 `approval_required` 标记为 true
- 在 ToolCallView 中检测到 `pending_approval` 且为高风险工具时，触发 PermissionDialog
- ToolCallView 内联审批仅对低风险工具显示

**状态管理：**
- 在 `uiStore` 中新增 `pendingPermissionRequest` 字段
- PermissionDialog 读取此字段决定是否显示

### 5.2 TypingIndicator

**文件**: `src/renderer/src/components/chat/TypingIndicator.tsx`（新建）

**设计要点：**
- 三个弹跳点（`● ● ●`），使用 CSS animation 实现错位弹跳
- 文字 "思考中..." 在点下方或右侧
- 与当前消息流风格一致（左侧对齐，border-l 竖线风格）
- 仅当 `isStreaming && !streamingContent && !activeTools.length > 0` 时显示（AI 在思考但尚未产出内容或工具调用时）

**动画实现：**
```tsx
function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-2 h-2 rounded-full bg-text-tertiary animate-typing-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span className="text-xs text-text-tertiary">思考中...</span>
    </div>
  )
}
```

**CSS：**
```css
@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

.animate-typing-bounce {
  animation: typingBounce 1.4s ease-in-out infinite;
}
```

### 5.3 TabBar

**文件**: `src/renderer/src/components/chat/TabBar.tsx`（新建）

**设计要点：**
- 水平滚动容器（当标签过多时左右滚动）
- 每个标签显示：
  - 状态圆点：🟢 idle / 🟢(脉冲) running / 🔴 error
  - 对话名（截断 15 字符）
  - hover 时显示关闭按钮 ×
- 末尾 + 按钮新建对话
- 快捷键提示：`Ctrl+T` 新建
- 位置：ChatPage 消息区顶部、标题栏下方

**状态管理：**
- 读取 `chatStore.conversations` + `currentConversationId`
- 新建/切换/删除复用了 chatStore 的已有方法

---

## 6. 现有组件增强

### 6.1 MessageItem（复制按钮 + 长消息折叠）

**文件**: `src/renderer/src/components/chat/MessageItem.tsx`（增强）

**改动：**

1. **复制按钮**（`<button>Copy</button>`）：
   - 在消息气泡右上角，默认 `opacity-0`
   - hover 消息时 `opacity-100`
   - 点击后复制消息文本到剪贴板
   - 复制成功后显示 Check 图标 + "已复制" 反馈

2. **长消息折叠**：
   - 消息 content 长度 > 500 字符时，自动折叠
   - 折叠状态显示前 200 字符 + `...` + 后 100 字符
   - 底部显示 "展开全部 ↓" 按钮
   - 点击展开后显示完整内容 + "收起 ↑" 按钮
   - 使用 AnimatePresence 做高度过渡动画

```tsx
// 在 MessageItem 中添加状态
const [isExpanded, setIsExpanded] = useState(true) // 默认展开（流式时总是展开）
const shouldCollapse = !isStreaming && message.content.length > 500

// 折叠预览文本
const preview = shouldCollapse && !expanded
  ? message.content.slice(0, 200) + '\n\n...\n\n' + message.content.slice(-100)
  : message.content
```

### 6.2 MessageList（TypingIndicator 支持）

**文件**: `src/renderer/src/components/chat/MessageList.tsx`（增强）

**改动：**
- 在流式渲染末尾，当满足条件时追加 TypingIndicator：
  ```tsx
  {isStreaming && !streamingContent && activeTools.length === 0 && (
    <TypingIndicator />
  )}
  ```
- 需要从 chatStore 读取 `activeTools`（当前运行的 toolCalls）

### 6.3 ChatInput（IME + 计时器 + 模型下拉）

**文件**: `src/renderer/src/components/chat/ChatInput.tsx`（增强）

**改动：**

1. **IME 输入法处理**（参考 claude-code-desktop InputArea）：
   ```typescript
   const isComposingRef = useRef(false)

   // IME 组合事件
   const handleCompositionStart = () => { isComposingRef.current = true }
   const handleCompositionEnd = () => { setTimeout(() => { isComposingRef.current = false }, 0) }

   // 修改 handleKeyDown
   const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
     if (e.key === 'Enter' && !e.shiftKey) {
       if (e.nativeEvent.isComposing || isComposingRef.current || (e as any).keyCode === 229) {
         return // IME 组合中不触发发送
       }
       e.preventDefault()
       void handleSend()
     }
   }
   ```

2. **运行计时器**：
   ```typescript
   const [elapsedTime, setElapsedTime] = useState(0)

   useEffect(() => {
     if (isStreaming) {
       setElapsedTime(0)
       const timer = setInterval(() => setElapsedTime(t => t + 1), 1000)
       return () => clearInterval(timer)
     }
   }, [isStreaming])

   // 在流式时显示计时器
   {isStreaming && (
     <div className={`flex items-center gap-1 text-xs ${elapsedTime >= 60 ? 'text-accent-red' : 'text-text-tertiary'}`}>
       {elapsedTime >= 60 ? <AlertTriangle /> : <Loader2 />}
       <span>{formatTime(elapsedTime)}</span>
       {elapsedTime >= 30 && <button onClick={handleStop}>停止</button>}
     </div>
   )}
   ```

3. **快捷模型下拉**（输入框上方）：
   - 轻量级下拉，显示当前模型名
   - 点击展开可选模型列表（从 `useChatStore.availableModels` 读取）
   - 选择后通过 `ipc.chat.switchModel` 或更新 uiStore.selectedModel

### 6.4 ChatPage（TabBar + 欢迎页示例按钮）

**文件**: `src/renderer/src/pages/ChatPage.tsx`（增强）

**改动：**

1. 消息区顶部添加 TabBar（如果 enabled）：
   ```tsx
   <TabBar />
   ```

2. 欢迎页添加示例问题按钮：
   ```tsx
   {!hasConversation && (
     <div className="flex flex-wrap gap-2 justify-center mt-4">
       {examplePrompts.map(prompt => (
         <button key={prompt} onClick={() => setPendingInput(prompt)}
           className="px-3 py-1.5 text-xs rounded-full border border-border-default text-text-secondary hover:border-accent-blue hover:text-accent-blue transition-smooth">
           {prompt}
         </button>
       ))}
     </div>
   )}
   ```

   示例问题列表：
   ```typescript
   const examplePrompts = [
     '帮我写一段 Python 代码',
     '解释这段代码的工作原理',
     '优化这个项目的性能',
     '帮我重构这个文件',
     '写一个单元测试',
   ]
   ```

---

## 7. 全局 CSS 与动画

### 7.1 globals.css 新增

```css
/* ===== 文字流光动画 ===== */
@keyframes textShimmer {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}

.text-shimmer {
  background: linear-gradient(
    90deg,
    var(--text-primary) 0%,
    var(--accent-blue) 30%,
    var(--accent-purple) 50%,
    var(--accent-blue) 70%,
    var(--text-primary) 100%
  );
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: textShimmer 3s linear infinite;
}

/* ===== 边框流光动画（对话选中项） ===== */
@keyframes borderGlow {
  0%, 100% {
    border-color: transparent;
    box-shadow: none;
  }
  25% {
    border-color: var(--accent-blue);
    box-shadow: 0 0 6px var(--accent-blue), inset 0 0 6px rgba(91, 166, 255, 0.1);
  }
  50% {
    border-color: var(--accent-purple);
    box-shadow: 0 0 10px var(--accent-purple), inset 0 0 8px rgba(179, 102, 255, 0.15);
  }
  75% {
    border-color: var(--accent-blue);
    box-shadow: 0 0 6px var(--accent-blue), inset 0 0 6px rgba(91, 166, 255, 0.1);
  }
}

.border-glow-active {
  animation: borderGlow 3s ease-in-out infinite;
  border-radius: 6px;
}

/* ===== 弹跳点打字指示器 ===== */
@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
  30% { transform: translateY(-6px); opacity: 1; }
}

.animate-typing-bounce {
  animation: typingBounce 1.4s ease-in-out infinite;
}

/* PermissionDialog 遮罩层 */
.permission-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
```

### 7.2 tailwind.config.ts 新增

```typescript
keyframes: {
  // ... 保留现有所有动画 ...
  textShimmer: {
    '0%': { backgroundPosition: '0% 50%' },
    '100%': { backgroundPosition: '200% 50%' },
  },
  borderGlow: {
    '0%, 100%': { borderColor: 'transparent', boxShadow: 'none' },
    '25%': { borderColor: 'var(--accent-blue)', boxShadow: '0 0 6px var(--accent-blue)' },
    '50%': { borderColor: 'var(--accent-purple)', boxShadow: '0 0 10px var(--accent-purple)' },
    '75%': { borderColor: 'var(--accent-blue)', boxShadow: '0 0 6px var(--accent-blue)' },
  },
  typingBounce: {
    '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.3' },
    '30%': { transform: 'translateY(-6px)', opacity: '1' },
  },
},
animation: {
  // ... 保留现有所有动画配置 ...
  'text-shimmer': 'textShimmer 3s linear infinite',
  'border-glow': 'borderGlow 3s ease-in-out infinite',
  'typing-bounce': 'typingBounce 1.4s ease-in-out infinite',
},
```

---

## 8. 实施顺序

### Phase 1 — 样式基础（建立动画体系）

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1.1 | `globals.css` | 新增 textShimmer / borderGlow / typingBounce 关键帧动画 |
| 1.2 | `tailwind.config.ts` | 注册新动画到配置 |

### Phase 2 — 核心组件新建与重写

| 步骤 | 文件 | 说明 |
|------|------|------|
| 2.1 | `ToolCallView.tsx` | 重写为纯文字+流光头部，去图标 |
| 2.2 | `ActivityBar.tsx` | 重写为纯文字+流光 |
| 2.3 | `PermissionDialog.tsx` | 新建 Modal 覆盖层 |
| 2.4 | `TypingIndicator.tsx` | 新建弹跳点组件 |
| 2.5 | `TabBar.tsx` | 新建多会话标签栏 |

### Phase 3 — 左侧栏改造

| 步骤 | 文件 | 说明 |
|------|------|------|
| 3.1 | `LeftSidebar.tsx` | 重写为 VS Code Activity Bar 风格 |
| 3.2 | `WorkspaceList.tsx` | 重写为 WorkspacePanel，对话项加流光边框 |

### Phase 4 — 现有组件增强

| 步骤 | 文件 | 说明 |
|------|------|------|
| 4.1 | `MessageItem.tsx` | 添加复制按钮 + 长消息折叠 |
| 4.2 | `MessageList.tsx` | 追加 TypingIndicator |
| 4.3 | `ChatInput.tsx` | IME + 计时器 + 模型下拉 |
| 4.4 | `ChatPage.tsx` | 集成 TabBar + 欢迎页示例按钮 |

### Phase 5 — 验证

| 步骤 | 说明 |
|------|------|
| 5.1 | `npm run typecheck` 类型检查 |
| 5.2 | 手动验证：工具调用显示、权限弹窗、左侧栏切换、流式打字指示器 |

---

## 9. 完整文件清单

总计涉及 14 个文件：

| # | 文件路径 | 操作 | 行数预估 |
|---|----------|------|---------|
| 1 | `src/renderer/src/styles/globals.css` | 增强（+80 行动画关键帧） | ~810 |
| 2 | `tailwind.config.ts` | 增强（+20 行动画注册） | ~160 |
| 3 | `src/components/chat/ToolCallView.tsx` | 重写（~300 行） | ~300 |
| 4 | `src/components/chat/ActivityBar.tsx` | 重写（~150 行） | ~150 |
| 5 | `src/components/chat/PermissionDialog.tsx` | 新建（~150 行） | ~150 |
| 6 | `src/components/chat/TypingIndicator.tsx` | 新建（~40 行） | ~40 |
| 7 | `src/components/chat/TabBar.tsx` | 新建（~130 行） | ~130 |
| 8 | `src/components/layout/LeftSidebar.tsx` | 重写（~250 行） | ~250 |
| 9 | `src/components/chat/WorkspaceList.tsx` | 重写（~400 行） | ~400 |
| 10 | `src/components/chat/MessageItem.tsx` | 增强（+80 行） | ~390 |
| 11 | `src/components/chat/MessageList.tsx` | 增强（+20 行） | ~245 |
| 12 | `src/components/chat/ChatInput.tsx` | 增强（+100 行） | ~720 |
| 13 | `src/pages/ChatPage.tsx` | 增强（+60 行） | ~215 |
| 14 | `src/stores/uiStore.ts` | 增强（可选，+5 行） | ~55 |

### 不动的文件（确认）

- `DiffView.tsx` ✓
- `TodoListPanel.tsx` ✓
- `ContextUsagePanel.tsx` ✓
- `RightSidebar.tsx` ✓
- `StatusBar.tsx` ✓
- `BottomBar.tsx` ✓
- `AppLayout.tsx` ✓
- `TitleBar.tsx` ✓
- `MarkdownRenderer.tsx` ✓
- `QuestionCard.tsx` ✓
- `ChatContextMenu.tsx` ✓
- `SelectionToolbar.tsx` ✓
- `ModelSelector.tsx` ✓
- `ModeSwitcher.tsx` ✓
- `ThinkingLevelSelector.tsx` ✓
- `ConversationHistory.tsx` ✓
- `stores/chatStore.ts` ✓
- `stores/contextStore.ts` ✓
- `stores/projectStore.ts` ✓
- `stores/searchStore.ts` ✓
- `stores/settingsStore.ts` ✓
- `stores/terminalStore.ts` ✓
- `stores/toastStore.ts` ✓
- 所有 `@shared/types/*` ✓

### 关键设计决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 文字流光实现 | CSS `background-clip: text` + gradient 动画 | 性能优于 JS 方案，与 Framer Motion 无冲突 |
| 边框流光实现 | CSS `box-shadow` 动画 | 性能优于 `border-image`，不影响布局 |
| 权限弹窗触发 | ToolCallView 中检测 `pending_approval` + 高风险工具 | 低风险继续内联审批，用户不被打断 |
| Activity Bar 颜色 | 基于名称 hash 分配预设色盘 | 保证一致性，无需数据库字段 |
| TabBar vs 保留侧边栏 | 两者共存 | TabBar 快速切换最近对话，侧边栏管理层级 |
| 消息复制按钮 | hover 显示，消息右上角 | 不干扰正常阅读，按需使用 |

---

*文档结束*
