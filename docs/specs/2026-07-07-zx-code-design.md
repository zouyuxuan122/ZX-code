# ZX-Code 设计文档

> **版本**: 1.0  
> **日期**: 2026-07-07  
> **状态**: 待审核

## 1. 项目概述

### 1.1 项目简介

**ZX-Code** 是一个 Windows 桌面端编程 Agent 智能体应用，采用现代化 UI 设计（参考 Codex 界面风格 1:1 仿造），集成多种 AI 模型接入能力、扩展市场、文件搜索、终端集成、自动进化等高级功能。

### 1.2 核心目标

- 提供与 Codex 一致的精致视觉体验和交互模式
- 支持多种模型接入方式（官方 API / 网页模型网关 / 本地模型 / 中转 API）
- 完整的编程 Agent 能力（代码生成/审查/执行/搜索）
- 扩展市场支持（SCL/MCP 扩展管理）
- 内置网页模型网关，免费使用主流大模型
- 可选的自动进化与 Skill 生成复用能力
- 流畅的动画效果与现代化交互

### 1.3 应用信息

- **应用名**: ZX-Code
- **作者 GitHub**: https://github.com/zouyuxuan122
- **作者 B 站**: 清浅无语qvq
- **目标平台**: Windows 10 及以上
- **许可证**: MIT（建议）

### 1.4 命名约定

为避免依赖特定开源项目，本项目内部采用以下命名：

| 内部名称 | 说明 |
|---------|------|
| ZX Agent 引擎 | 核心编程 Agent 逻辑（参考行业最佳实践实现） |
| 网页模型网关 (Web Model Gateway) | 通过网页接口免费使用大模型的能力 |
| 自动进化引擎 (Evolution Engine) | 自动学习、生成 Skill 并复用的能力 |
| SCL (Skill Code Library) | 技能代码库扩展 |
| MCP (Model Control Package) | 模型控制包扩展 |
| LCP (Language Code Package) | 语言代码包 |

---

## 2. 技术栈

### 2.1 核心技术

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 桌面框架 | Electron | 33+ | 跨平台桌面应用容器 |
| 前端框架 | React | 19 | UI 渲染层 |
| 语言 | TypeScript | 5.6+ | 类型安全 |
| 样式方案 | Tailwind CSS | 4 | 原子化 CSS |
| 组件库 | Radix UI | latest | 无头组件库（可访问性） |
| 状态管理 | Zustand | 5 | 轻量客户端状态 |
| 服务端状态 | TanStack Query | 5 | 异步状态管理 |
| 构建工具 | Vite + electron-vite | latest | 快速构建 |
| 数据库 | better-sqlite3 | 11 | 同步 SQLite |
| 终端 | node-pty + xterm.js | latest | 真实终端模拟 |
| 编辑器 | Monaco Editor | latest | 代码编辑器 |
| 动画 | Framer Motion | 11 | 流畅动画 |
| 图标 | Lucide React | latest | 现代图标 |
| 打包 | electron-builder | 25 | Windows 安装包 |

### 2.2 开发工具

- **代码规范**: ESLint + Prettier
- **Git 钩子**: Husky + lint-staged
- **测试**: Vitest（单元测试）+ Playwright（E2E）
- **提交规范**: Conventional Commits

---

## 3. 整体架构

### 3.1 架构概览

采用**纯 Electron 单体架构**：

```
┌─────────────────────────────────────────────────┐
│              Electron 应用                       │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │     渲染进程 (Renderer Process)           │   │
│  │  ┌────────────────────────────────────┐  │   │
│  │  │  React UI (Codex 风格)             │  │   │
│  │  │  - Pages / Components / Stores     │  │   │
│  │  │  - Tailwind + Radix UI             │  │   │
│  │  └────────────────────────────────────┘  │   │
│  └────────────────┬─────────────────────────┘   │
│                   │ IPC (contextBridge)          │
│  ┌────────────────┴─────────────────────────┐   │
│  │     主进程 (Main Process)                 │   │
│  │  ┌──────────────┐  ┌──────────────────┐  │   │
│  │  │ Agent Engine │  │ Model Provider   │  │   │
│  │  │ (ZX 引擎)    │  │ (多模型通信层)    │  │   │
│  │  └──────────────┘  └──────────────────┘  │   │
│  │  ┌──────────────┐  ┌──────────────────┐  │   │
│  │  │ Tool System  │  │ Search Engine    │  │   │
│  │  │ (工具系统)    │  │ (文件搜索)       │  │   │
│  │  └──────────────┘  └──────────────────┘  │   │
│  │  ┌──────────────┐  ┌──────────────────┐  │   │
│  │  │ Terminal Mgr │  │ Market Manager   │  │   │
│  │  │ (终端管理)    │  │ (市场管理)       │  │   │
│  │  └──────────────┘  └──────────────────┘  │   │
│  │  ┌──────────────┐  ┌──────────────────┐  │   │
│  │  │ Evolution    │  │ Web Model        │  │   │
│  │  │ Engine       │  │ Gateway          │  │   │
│  │  │ (进化引擎)    │  │ (网页模型网关)    │  │   │
│  │  └──────────────┘  └──────────────────┘  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │     数据层 (Data Layer)                   │   │
│  │  - SQLite (better-sqlite3)               │   │
│  │  - File System (任务产物/日志)            │   │
│  │  - Config Manager (配置)                 │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 3.2 进程职责

#### 渲染进程 (Renderer)
- UI 渲染与用户交互
- 状态管理（Zustand）
- 路由控制
- 不直接访问 Node.js API，通过 IPC 与主进程通信

#### 主进程 (Main)
- 窗口管理
- IPC 请求处理
- 数据库操作
- 文件系统操作
- 子进程管理（终端/Python 进程）
- 配置管理
- 日志记录

#### 预加载脚本 (Preload)
- 通过 `contextBridge` 暴露安全 API 给渲染进程
- 类型安全的 IPC 调用封装

### 3.3 通信机制

```typescript
// IPC 通信采用类型安全的调用模式
// preload/api.ts
export const api = {
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    create: (data) => ipcRenderer.invoke('project:create', data),
    // ...
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },
  // 事件监听（主进程 → 渲染进程）
  on: (channel, callback) => ipcRenderer.on(channel, callback),
}
```

---

## 4. 五阶段开发规划

### 4.1 阶段总览

| 阶段 | 名称 | 核心目标 | 主要产出 |
|------|------|---------|---------|
| 1 | 基础框架 + 核心 UI | 可运行的应用骨架 | Codex 风格界面 + 数据库 + 路由 |
| 2 | Agent 引擎 + 对话系统 | 真实 AI 对话能力 | 多模型接入 + 对话管理 + 工具调用 |
| 3 | 完整 UI + 设置系统 | 完整 Codex 体验 | 完整界面 + 设置页 + 动画 |
| 4 | 扩展功能 | 市场/搜索/终端 | 市场 + 文件搜索 + 终端集成 |
| 5 | 高级集成 | 网页网关/进化/Skill | Chat2API + 进化引擎 + Skill 系统 |

### 4.2 阶段 1：基础框架 + 核心 UI

**目标**：搭建可运行的应用骨架，实现 Codex 风格基础界面

**内容**：
1. Electron + Vite + React 项目脚手架
2. 主进程/渲染进程架构搭建，IPC 通信层
3. Codex 风格深色主题系统（颜色/字体/间距/圆角）
4. 基础布局：左侧栏 + 主区域 + 右侧可折叠栏
5. 顶部状态栏（LCP/MCP/服务器状态）
6. 自定义标题栏 + 窗口管理
7. 路由系统（对话/设置/市场/项目/关于）
8. SQLite 数据库初始化 + 迁移系统
9. 基础设置页面框架
10. 对话栏 UI（含模型选择器 + 思考强度切换）

### 4.3 阶段 2：Agent 引擎 + 对话系统

**目标**：实现核心 AI 对话能力，能真实跑通编程任务

**内容**：
1. 模型 Provider 抽象层（统一接口）
2. 官方 API 接入（OpenAI/Claude/Gemini/DeepSeek/Qwen）
3. 中转 API 接入（自定义 URL + Key + 拉取模型列表）
4. 本地模型接入（Ollama）
5. 对话管理系统（会话/消息/上下文）
6. 流式响应处理
7. 工具调用系统（文件读写/执行命令/搜索等）
8. Markdown + 代码高亮渲染
9. 对话历史记录与查看
10. 对话压缩功能

### 4.4 阶段 3：完整 UI + 设置系统

**目标**：完整复刻 Codex 界面，完善所有交互

**内容**：
1. Codex 风格完整界面精修（动画/过渡/微交互）
2. 右侧栏完整实现（待办事项/任务产物/参考信息）
3. 项目管理完整功能（新建/切换/工作区路径）
4. 完整设置页面：
   - 权限管理（细粒度资源访问控制）
   - 错误处理与日志（级别配置）
   - 模型与供应商配置（多供应商/参数自定义）
   - API 设置（URL/密钥/参数）
   - 上下文长度设置（手动调整）
   - 模型列表管理（API 拉取/更新）
   - 权限自动接受开关
   - 主题/字体/快捷键设置
   - 关于页面（GitHub/B 站信息）
5. 通知与提示系统
6. 错误处理机制

### 4.5 阶段 4：扩展功能

**目标**：实现市场、文件搜索、终端等扩展功能

**内容**：
1. 市场系统（SCL/MCP 扩展管理）
   - 扩展浏览/搜索/安装/卸载
   - 扩展配置与启用/禁用
2. 本地文件搜索系统
   - 文件索引（按名/内容/类型）
   - 全文搜索（支持正则/模糊匹配）
   - 搜索结果预览与跳转
3. 终端审查功能
   - 多终端环境切换（PowerShell/CMD/WSL/Git Bash）
   - 终端代码审查
   - 终端输出分析
4. 任务产物管理
5. 待办事项与 Agent 联动

### 4.6 阶段 5：高级集成

**目标**：集成网页模型网关、自动进化引擎、Skill 系统

**内容**：
1. 网页模型网关内置
   - 网页大模型接入（DeepSeek/GLM/Kimi/Qwen/MiniMax）
   - 独立设置界面
   - 对话列表直接使用网页大模型
   - AccessToken 管理
2. 自动进化引擎（用户决定是否开启）
   - Python 环境检测与打包
   - 自动进化引擎集成
   - 进化状态监控
3. Skill 生成与复用
   - 从对话中提取 Skill
   - Skill 库管理
   - Skill 复用与组合
4. 更多开源项目集成（提升体验）

---

## 5. 阶段 1 详细设计

### 5.1 项目目录结构

```
zx-code/
├── package.json
├── electron.vite.config.ts          # electron-vite 配置
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── tailwind.config.ts
├── postcss.config.js
├── electron-builder.yml             # 打包配置
│
├── src/
│   ├── main/                        # 主进程
│   │   ├── index.ts                 # 主进程入口
│   │   ├── window.ts                # 窗口管理
│   │   ├── ipc/                     # IPC 处理器
│   │   │   ├── index.ts             # IPC 注册器
│   │   │   ├── project.ipc.ts       # 项目相关
│   │   │   ├── settings.ipc.ts      # 设置相关
│   │   │   └── database.ipc.ts      # 数据库相关
│   │   ├── database/                # 数据层
│   │   │   ├── index.ts             # SQLite 初始化
│   │   │   ├── migrate.ts           # 迁移管理器
│   │   │   ├── migrations/          # 迁移脚本
│   │   │   │   ├── 001_init.ts
│   │   │   │   └── ...
│   │   │   └── repositories/        # 数据访问层
│   │   │       ├── project.repo.ts
│   │   │       ├── settings.repo.ts
│   │   │       └── conversation.repo.ts
│   │   ├── services/                # 业务服务
│   │   │   ├── config.service.ts    # 配置管理
│   │   │   ├── logger.service.ts    # 日志
│   │   │   ├── tray.service.ts      # 系统托盘
│   │   │   └── file.service.ts      # 文件操作
│   │   └── types/                   # 主进程类型
│   │       └── index.ts
│   │
│   ├── preload/                     # 预加载脚本
│   │   ├── index.ts                 # 预加载入口
│   │   └── api.ts                   # 暴露给渲染进程的 API
│   │
│   ├── renderer/                    # 渲染进程
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx             # React 入口
│   │       ├── App.tsx              # 根组件
│   │       ├── router/              # 路由
│   │       │   ├── index.tsx
│   │       │   └── routes.tsx
│   │       ├── pages/               # 页面
│   │       │   ├── ChatPage/
│   │       │   │   ├── index.tsx
│   │       │   │   └── components/
│   │       │   ├── SettingsPage/
│   │       │   │   ├── index.tsx
│   │       │   │   └── tabs/        # 设置子页面
│   │       │   ├── MarketPage/
│   │       │   │   └── index.tsx
│   │       │   ├── ProjectsPage/
│   │       │   │   └── index.tsx
│   │       │   └── AboutPage/
│   │       │       └── index.tsx
│   │       ├── components/          # 组件
│   │       │   ├── layout/          # 布局组件
│   │       │   │   ├── AppLayout.tsx
│   │       │   │   ├── TitleBar.tsx
│   │       │   │   ├── StatusBar.tsx
│   │       │   │   ├── LeftSidebar.tsx
│   │       │   │   ├── RightSidebar.tsx
│   │       │   │   └── BottomBar.tsx
│   │       │   ├── chat/            # 对话组件
│   │       │   │   ├── ChatInput.tsx
│   │       │   │   ├── ModelSelector.tsx
│   │       │   │   ├── ThinkingLevelSelector.tsx
│   │       │   │   └── MessageList.tsx
│   │       │   ├── ui/              # 基础 UI 组件
│   │       │   │   ├── Button.tsx
│   │       │   │   ├── Input.tsx
│   │       │   │   ├── Select.tsx
│   │       │   │   ├── Dialog.tsx
│   │       │   │   ├── Tooltip.tsx
│   │       │   │   └── ...
│   │       │   └── shared/          # 共享组件
│   │       ├── stores/              # Zustand 状态
│   │       │   ├── projectStore.ts
│   │       │   ├── settingsStore.ts
│   │       │   ├── uiStore.ts
│   │       │   └── chatStore.ts
│   │       ├── hooks/               # 自定义 Hooks
│   │       │   ├── useTheme.ts
│   │       │   ├── useIpc.ts
│   │       │   └── ...
│   │       ├── services/            # 前端服务层
│   │       │   ├── ipc.ts           # IPC 调用封装
│   │       │   └── ...
│   │       ├── styles/              # 样式
│   │       │   ├── globals.css
│   │       │   └── themes/
│   │       │       ├── dark.css     # 深色主题
│   │       │       └── light.css    # 浅色主题
│   │       ├── types/               # 渲染进程类型
│   │       │   └── index.ts
│   │       └── utils/               # 工具函数
│   │           ├── cn.ts            # className 合并
│   │           └── ...
│   │
│   └── shared/                      # 主进程/渲染进程共享
│       ├── types/                   # 共享类型
│       │   ├── ipc.ts               # IPC 类型定义
│       │   ├── project.ts
│       │   ├── settings.ts
│       │   └── conversation.ts
│       ├── constants/               # 常量
│       │   ├── app.ts
│       │   ├── themes.ts
│       │   └── routes.ts
│       └── utils/                   # 共享工具
│
├── resources/                       # 静态资源
│   ├── icons/
│   │   ├── icon.ico
│   │   ├── icon.png
│   │   └── tray-icon.png
│   └── fonts/
│
└── docs/                            # 文档
    └── specs/                       # 设计文档
```

### 5.2 主进程架构

#### 5.2.1 入口文件 (main/index.ts)

```typescript
import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initDatabase } from './database'
import { initLogger } from './services/logger.service'
import { createTray } from './services/tray.service'

app.whenReady().then(async () => {
  // 初始化顺序：日志 → 数据库 → IPC → 窗口 → 托盘
  initLogger()
  await initDatabase()
  registerIpcHandlers()
  createMainWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

#### 5.2.2 窗口管理 (main/window.ts)

```typescript
import { BrowserWindow, session } from 'electron'
import path from 'path'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,           // 无边框窗口
    titleBarStyle: 'hidden', // 隐藏标题栏
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 记忆窗口状态
  restoreWindowState(win)
  saveWindowState(win)

  // 加载页面
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}
```

### 5.3 UI 布局设计（Codex 风格）

#### 5.3.1 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│ [自定义标题栏] ZX-Code                              [─][□][×]   │  32px
├─────────────────────────────────────────────────────────────────┤
│ [状态栏] LCP: GPT-4 │ MCP: Active │ Server: Connected │ [图标]  │  28px
├──────────┬───────────────────────────────────────────┬──────────┤
│          │                                           │          │
│ 左侧栏    │              主内容区                      │ 右侧栏    │
│ (240px)  │           (flex-1)                        │ (300px)  │
│          │                                           │ (可折叠)  │
│ 项目列表  │  ┌─────────────────────────────────────┐ │          │
│          │  │                                     │ │ 待办事项  │
│ ▸ 项目1   │  │     对话/编辑器/市场区域              │ │          │
│ ▸ 项目2   │  │                                     │ ├──────────┤
│ ▸ 项目3   │  │                                     │ │          │
│          │  │                                     │ │ 任务产物  │
│ [+ 新建]  │  │                                     │ │          │
│          │  │                                     │ ├──────────┤
│ [设置]    │  └─────────────────────────────────────┘ │          │
│ [关于]    │  ┌─────────────────────────────────────┐ │ 参考信息  │
│          │  │ [模型▼] [思考:标准▼] [工具] [发送→]  │ │          │
│          │  └─────────────────────────────────────┘ │          │
├──────────┴───────────────────────────────────────────┴──────────┤
│ [底部] 项目路径 │ 编码 │ 行列 │ [终端切换]                      │  24px
└─────────────────────────────────────────────────────────────────┘
```

#### 5.3.2 对话栏（输入区）详细设计

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │  [多行输入框]                                                │ │
│ │  - Shift+Enter 换行                                         │ │
│ │  - Enter 发送                                               │ │
│ │  - 支持拖拽文件                                              │ │
│ │  - 支持代码块语法                                            │ │
│ │                                                             │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ [图标模型选择器▼] [⚡思考: 快速/标准/深度▼] [🔧工具(3)] [→] │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**模型选择器 (ModelSelector)**：
- 下拉列表显示所有已配置模型（按供应商分组）
- 显示模型名称 + 供应商图标
- 支持搜索快速定位
- 标记当前选中的模型
- 显示模型状态标识（API/网关/本地）
- 阶段 1 只实现 UI，阶段 2 接入实际数据

**思考强度切换 (ThinkingLevelSelector)**：
- 三档调节：
  - `快速` (Fast)：最低推理深度，快速响应
  - `标准` (Standard)：默认平衡模式
  - `深度` (Deep)：最大推理深度，适合复杂任务
- 通过图标 + 文字显示当前档位
- 阶段 1 只实现 UI 切换，阶段 2 接入参数传递

### 5.4 主题系统（Codex 深色风格）

#### 5.4.1 色彩规范

```css
:root {
  /* 主色调 - 深色背景（GitHub Dark 风格，与 Codex 一致）*/
  --bg-primary: #0d1117;        /* 最深背景（主窗口）*/
  --bg-secondary: #161b22;      /* 次级背景（侧边栏）*/
  --bg-tertiary: #21262d;       /* 三级背景（卡片/面板）*/
  --bg-elevated: #30363d;       /* 悬停态/弹出层 */
  --bg-overlay: #161b2280;      /* 遮罩层 */

  /* 边框 */
  --border-default: #30363d;
  --border-subtle: #21262d;
  --border-strong: #484f58;

  /* 文字 */
  --text-primary: #e6edf3;      /* 主文字 */
  --text-secondary: #7d8590;    /* 次要文字 */
  --text-tertiary: #484f58;     /* 占位/禁用 */
  --text-link: #2f81f7;         /* 链接 */

  /* 强调色 */
  --accent-blue: #2f81f7;       /* 主强调（按钮/链接/选中）*/
  --accent-blue-hover: #1f6feb;
  --accent-green: #3fb950;      /* 成功状态 */
  --accent-orange: #d29922;     /* 警告 */
  --accent-red: #f85149;        /* 错误/危险 */
  --accent-purple: #a371f7;     /* 特殊强调 */

  /* 语义色 */
  --status-active: #3fb950;
  --status-warning: #d29922;
  --status-error: #f85149;
  --status-info: #2f81f7;

  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 3px 6px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
}
```

#### 5.4.2 字体规范

```css
:root {
  /* UI 字体 */
  --font-sans: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  
  /* 代码字体 */
  --font-mono: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;

  /* 字号 */
  --text-xs: 11px;    /* 辅助文字 */
  --text-sm: 12px;    /* 小字 */
  --text-base: 13px;  /* 常规 */
  --text-md: 14px;    /* 正文 */
  --text-lg: 16px;    /* 标题 */
  --text-xl: 20px;    /* 大标题 */
  --text-2xl: 24px;   /* 页面标题 */

  /* 行高 */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
}
```

#### 5.4.3 圆角与间距

```css
:root {
  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* 间距（4px 基础单位）*/
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* 过渡动画 */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 5.5 数据库设计

#### 5.5.1 初始化

```typescript
// main/database/index.ts
import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database

export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'zx-code.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  
  // 执行迁移
  runMigrations(db)
  
  return db
}

export function getDb() {
  return db
}
```

#### 5.5.2 数据表设计（阶段 1）

```sql
-- 项目表
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    workspace_path TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    last_active_at INTEGER,
    settings TEXT DEFAULT '{}'  -- JSON: 项目级设置
);

-- 设置表（键值对存储）
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,        -- JSON 格式值
    category TEXT NOT NULL,     -- 分类: general/model/api/permission/theme等
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- 会话表（阶段 1 建表，阶段 2 使用）
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT,
    title TEXT NOT NULL DEFAULT '新对话',
    model TEXT,
    thinking_level TEXT DEFAULT 'standard', -- fast/standard/deep
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- 消息表（阶段 1 建表，阶段 2 使用）
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,         -- user/assistant/system/tool
    content TEXT NOT NULL,
    metadata TEXT,              -- JSON: tokens, model, tool_calls等
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
```

#### 5.5.3 默认设置数据

```typescript
// 阶段 1 初始化的默认设置
const defaultSettings = {
  // 通用设置
  'general.language': 'zh-CN',
  'general.theme': 'dark',
  'general.fontSize': 13,
  'general.startup': 'last-project',
  
  // 模型设置
  'model.default': 'gpt-4',
  'model.thinkingLevel': 'standard',
  
  // 权限设置
  'permission.autoAccept': false,
  'permission.fileSystem': 'ask',
  'permission.execute': 'ask',
  'permission.network': 'ask',
  
  // 日志设置
  'log.level': 'info',
  'log.fileEnabled': true,
  
  // UI 设置
  'ui.sidebarCollapsed': false,
  'ui.rightSidebarCollapsed': false,
  'ui.terminalType': 'powershell',
}
```

### 5.6 路由系统

```typescript
// renderer/src/router/routes.tsx
export const routes = [
  { path: '/', redirect: '/chat' },
  { path: '/chat', component: ChatPage, title: '对话' },
  { path: '/settings', component: SettingsPage, title: '设置' },
  { path: '/settings/:tab', component: SettingsPage },
  { path: '/market', component: MarketPage, title: '市场' },
  { path: '/projects', component: ProjectsPage, title: '项目' },
  { path: '/about', component: AboutPage, title: '关于' },
]
```

### 5.7 状态管理

```typescript
// renderer/src/stores/uiStore.ts
interface UIState {
  leftSidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  activeProject: string | null
  selectedModel: string
  thinkingLevel: 'fast' | 'standard' | 'deep'
  
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  setActiveProject: (id: string) => void
  setSelectedModel: (model: string) => void
  setThinkingLevel: (level: 'fast' | 'standard' | 'deep') => void
}

// renderer/src/stores/projectStore.ts
interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  
  loadProjects: () => Promise<void>
  createProject: (data: CreateProjectDto) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  switchProject: (id: string) => Promise<void>
}

// renderer/src/stores/settingsStore.ts
interface SettingsState {
  settings: Record<string, any>
  
  loadSettings: () => Promise<void>
  updateSetting: (key: string, value: any) => Promise<void>
  getSetting: <T>(key: string, defaultValue: T) => T
}
```

### 5.8 关于页面

```typescript
// renderer/src/pages/AboutPage/index.tsx
// 关于页面显示：
// - 应用名: ZX-Code
// - 版本号
// - 作者 GitHub: https://github.com/zouyuxuan122
// - 作者 B 站: 清浅无语qvq
// - 技术栈信息
// - 开源许可
```

### 5.9 错误处理

```typescript
// 全局错误处理
// main/services/logger.service.ts
export const logger = {
  error: (msg: string, error?: Error) => { /* 写入文件 + 控制台 */ },
  warn: (msg: string) => { /* ... */ },
  info: (msg: string) => { /* ... */ },
  debug: (msg: string) => { /* ... */ },
}

// 渲染进程错误边界
// renderer/src/components/ErrorBoundary.tsx
// 捕获渲染错误，显示友好提示
```

### 5.10 测试策略

- **单元测试**: Vitest 测试 repositories/services
- **组件测试**: Vitest + Testing Library 测试 React 组件
- **E2E 测试**: Playwright 测试关键流程（项目创建/设置修改等）
- **阶段 1 测试重点**: 数据库操作、IPC 通信、UI 布局渲染

---

## 6. 后续阶段预告

### 6.1 阶段 2 关键设计点

- **Provider 抽象层**: 统一的模型通信接口
  ```typescript
  interface ModelProvider {
    name: string
    listModels(): Promise<ModelInfo[]>
    chat(params: ChatParams): AsyncGenerator<ChatChunk>
  }
  ```
- **工具系统**: 可扩展的工具注册机制
- **流式响应**: Server-Sent Events 处理

### 6.2 阶段 3 关键设计点

- 完整的设置系统架构
- 权限模型的详细设计
- 动画系统规范

### 6.3 阶段 4-5 关键设计点

- 市场扩展的安装与隔离机制
- 网页模型网关的架构
- 自动进化引擎的集成方式

---

## 7. 约束与假设

### 7.1 约束

- 仅支持 Windows 10 及以上
- 不提及任何依赖的开源项目名称
- 关于页面必须显示作者信息
- 所有功能需用户确认后开启（自动进化等）

### 7.2 假设

- 用户有基本的命令行操作能力
- 用户会自行配置模型 API Key（或使用网页模型网关）
- 阶段 1 不需要真实的模型通信，只准备 UI 和数据结构

### 7.3 非目标（阶段 1）

- 真实的 AI 对话功能（阶段 2）
- 完整的设置功能（阶段 3）
- 市场/搜索/终端（阶段 4）
- 网页网关/进化引擎（阶段 5）

---

## 8. 成功标准

### 阶段 1 验收标准

1. ✅ 应用可在 Windows 10+ 上正常启动
2. ✅ Codex 风格深色主题界面正确显示
3. ✅ 左侧栏项目列表可显示、新建项目
4. ✅ 右侧栏可折叠/展开
5. ✅ 顶部状态栏显示占位状态信息
6. ✅ 底部状态栏显示项目路径
7. ✅ 对话栏 UI 完整（含模型选择器 + 思考强度切换）
8. ✅ 路由可正常切换（对话/设置/市场/项目/关于）
9. ✅ 设置页面框架可显示
10. ✅ 关于页面显示作者信息
11. ✅ SQLite 数据库正常初始化
12. ✅ 项目数据可持久化存储
13. ✅ 窗口状态可记忆
14. ✅ 系统托盘功能正常
15. ✅ 无明显卡顿，动画流畅

---

*本设计文档将随开发进展持续更新。*
