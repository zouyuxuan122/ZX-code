<div align="center">

# ZX-Code

### 全能 AI 编程 Agent · 桌宠陪伴 · 九宫格工作台

[简体中文](#简体中文) &nbsp;|&nbsp; [English](#english)

![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D4.svg?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-33-47848F.svg?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg?style=flat-square)
![Version](https://img.shields.io/badge/version-0.2.0-brightgreen.svg?style=flat-square)

**一键登录免费使用 DeepSeek / GLM / Kimi / 通义千问 / MiniMax 等国产大模型网页版，免 API Key，可直接用于 AI 编程、代码生成与调试。内置 AI 伴侣桌宠、九宫格多面板工作台、长期记忆系统，精美流畅的个性化 UI。**

[下载安装包](https://github.com/zouyuxuan122/ZX-code/releases/latest) · [查看文档](#文档) · [报告问题](https://github.com/zouyuxuan122/ZX-code/issues) · [更新日志](https://github.com/zouyuxuan122/ZX-code/releases)

</div>

---

<!-- ==================== 简体中文 ==================== -->

## 简体中文

### 介绍

ZX-Code 是一款运行于 Windows 的桌面端编程 Agent 智能体应用。它不止是一个 AI 聊天框——它是一个能**读写文件、执行命令、搜索代码、联网查资料、派发子任务**的全能编程伙伴，同时内置了**可交互的 3D 桌宠系统**与**角色化陪伴体验**，让编程不再孤独。

应用基于 Electron + React + TypeScript 构建，采用无边框沉浸式窗口设计，支持深色/浅色主题切换与九宫格可自定义布局，将对话、终端、桌宠、监控面板等模块自由组合于一屏。

> 核心理念：**让 AI 真正动手帮你写代码，而不是只动嘴。**

---

### 与同类项目对比

| 能力 | ZX-Code | Cursor | Windsurf | Cline | Continue | GitHub Copilot |
|:-----|:-------:|:------:|:--------:|:-----:|:--------:|:--------------:|
| **免 API Key 用国产大模型** | DeepSeek / GLM / Kimi / 通义 / MiniMax 等 9 家 | 仅支持 API | 仅支持 API | 仅支持 API | 仅支持 API | 仅 GitHub 模型 |
| **一键 OAuth 登录** | 网页账号直接用 | 需 API Key | 需 API Key | 需 API Key | 需 API Key | 需订阅 |
| **3D 桌宠 & AI 伴侣** | Live2D / VRM / SVG | 无 | 无 | 无 | 无 | 无 |
| **九宫格多面板工作台** | 9 格自由拖拽布局 | 单面板 | 双面板 | 单面板 | 侧边栏 | 无 |
| **长期记忆系统** | 记忆树 + SuperContext + Obsidian 导出 | 有限 | 无 | 无 | 无 | 无 |
| **目标看板 & 自动编排** | 三列看板 + 潜意识服务 | 无 | 无 | 无 | 无 | 无 |
| **TTS 语音合成** | Edge/OpenAI/自定义 + 语音克隆 | 无 | 无 | 无 | 无 | 无 |
| **子智能体并行** | general/research/coder | 无 | 有 | 无 | 无 | 无 |
| **本地优先 & 数据自主** | SQLite 本地存储 | 云端 | 云端 | 本地 | 本地 | 云端 |
| **MCP 协议扩展** | 支持 | 支持 | 支持 | 支持 | 支持 | 不支持 |
| **开源免费** | GPL-3.0 | 闭源付费 | 闭源付费 | 开源 | 开源 | 闭源付费 |
| **个性化 UI** | 无边框 + 深浅主题 + 流畅动画 | 一般 | 一般 | 插件式 | 插件式 | 无独立 UI |

> **核心差异**：ZX-Code 是唯一同时具备「免 Key 国产大模型接入 + 3D 桌宠陪伴 + 九宫格工作台 + 长期记忆」的桌面 AI 编程应用。

---

### 核心特性

#### 智能体引擎

- **多轮工具调用循环** — Agent 自主规划、调用工具、根据结果迭代，最多 20 次迭代自动完成复杂任务
- **14 个内置工具** — 文件读写/编辑、代码搜索（grep/glob）、命令执行、终端管理、网页抓取、联网搜索、子任务派发、待办清单、用户提问
- **流式工具调用** — 工具参数实时增量透传，文件写入过程即时可见
- **子智能体（SubAgent）** — 派发独立会话的只读子智能体，支持 general / research / coder 三种类型并行工作
- **三级权限系统** — 每个工具可配置 `allow / ask / deny`，工作区文件自动放行，外部文件首次授权可"始终允许"

#### 多模型支持

- **7 个内置 Provider** — OpenAI、Anthropic Claude、Google Gemini、DeepSeek、通义千问、Ollama（本地）、网页大模型
- **内置代理引擎** — 通过本地 OpenAI 兼容代理接入 **9 家国内大模型网页版**（DeepSeek / GLM / Kimi / MiMo / MiniMax / Perplexity / Qwen / Qwen-AI / ZAI），**免 API Key**，支持 OAuth 登录与账号负载均衡
- **一键登录** — 选择厂商点击登录，完成网页 OAuth 授权即可使用，无需任何 API Key 或付费订阅
- **可用于代码任务** — 支持代码生成、调试、重构、审查等全部开发场景
- **思考级别控制** — fast / standard / deep 三档推理深度
- **上下文管理** — Token 实时估算、使用率进度条、自动压缩、手动回退

#### 桌宠 & AI 陪伴

- **三种模型格式** — SVG 矢量角色、VRM（.vrm 三维模型）、Live2D（.model3.json 二次元角色）
- **表情与动作系统** — 6 种情绪状态（idle / happy / working / annoyed / sleeping / talking），每种情绪映射对应的动作与表情
- **AI 驱动表演** — LLM 根据对话内容自动为桌宠选择最合适的动作与表情，让角色"活"起来
- **角色卡定制** — 自定义角色名、性格、问候语、人设文本（直接注入系统提示词），打造你的专属 AI 伴侣
- **行为循环** — 空闲随机气泡、5 分钟无操作入睡、工作时被打扰会生气
- **交互** — 拖动移动、滚轮缩放、鼠标视线跟随、物理模拟摆动
- **陪伴模式** — 将角色卡设定为陪伴型人设，桌宠即化身 AI 女友/伙伴，在九宫格对话格中进行角色化聊天，回复同步驱动表情动作，实现有温度的陪伴体验

#### 九宫格工作台

- **9 格自由布局** — 聊天、桌宠、终端、AI 实时视图、浏览器预览、时钟、天气、使用热力图、待办清单、看板
- **5 种布局预设** — 默认 / 对话优先 / 监控模式 / 桌宠专注 / 经典布局
- **拖拽交换 & 分隔条调整** — 面板随意拖动换位，分隔条拖动改变面板比例
- **布局持久化** — 自动保存你的个性化布局

#### 记忆与编排

- **记忆树架构** — 六分区结构（project / decision / error / preference / subconscious / general），基于 SQLite 持久化；记忆检索评分 = 相关度（0/0.5/1）× 0.7 + 时间衰减 1/(1+days/30) × 0.3
- **自动抽取与召回** — 对话结束后 fire-and-forget 异步抽取关键信息写入记忆；发送消息时按关键词检索 Top-K 记忆注入 system prompt
- **Obsidian 导出** — 一键导出为 YAML frontmatter + 按分区子目录的 Markdown vault，可与 Obsidian 笔记库联动
- **SuperContext 上下文预热** — 发送消息前自动构建简报：相关文件（≤10）、相关记忆（≤3）、最近历史（≤2），注入为 system message；800ms 超时降级返回空简报，不阻塞对话
- **TokenJuice 输出压缩** — 工具输出超长时自动压缩：去 ANSI 转义 → 合并连续空行 → 头尾保留 + 中间省略；默认阈值 8000 字符，降低 token 消耗 ≥ 50%
- **持久化目标与看板** — Goal（长期目标/会话目标）与 Task（看板任务）双层数据模型；三列看板（todo / doing / done）支持跨列拖拽流转；Agent 可通过 goal_manage 工具自主创建/更新目标与任务
- **自动同步与潜意识** — SchedulerService 周期调度；SubconsciousService 扫描工作区变更生成摘要写入潜意识分区；AutoFetchService 拉取外部数据源（GitHub issues / RSS）
- **托盘"立即同步"** — 一键触发自动同步，完成后系统通知

#### TTS 语音合成

- **三大引擎** — Edge TTS（微软 Neural 音色，免费）/ OpenAI TTS / 自定义 OpenAI 兼容端点
- **双模式** — auto（自动朗读 AI 回复）/ manual（点击按钮手动朗读）
- **语音克隆** — 上传音频样本 + 参考文本，创建专属克隆音色
- **参数调节** — 语速（0.5~2.0）、音量（0.0~1.0）、音频格式（mp3/wav）
- **多音色** — 支持中文 Neural 音色（晓晓、云扬等）及云端引擎全部音色

#### 沉浸式体验

- **无边框窗口** — 自定义标题栏，沉浸式工作环境
- **深色 / 浅色主题** — 一键切换，带平滑过渡动画
- **多工作区** — 每个工作区独立对话与背景，可自定义 AI 头像与用户头像
- **Markdown 渲染** — 代码高亮、GFM 表格、Diff 视图、流式输出
- **斜杠命令** — 16 个快捷命令（/help /clear /compact /new /export 等）
- **MCP 协议支持** — 连接外部 MCP 服务器，扩展工具能力
- **SCL 技能扩展** — 注入领域技能提示词，增强 Agent 专业能力

---

### 项目优势

| 优势 | 说明 |
|------|------|
| **免费国产大模型** | 一键登录 DeepSeek / GLM / Kimi / 通义 / MiniMax 等 9 家网页版，免 API Key 免订阅 |
| **真正动手的 Agent** | 不只是聊天，而是能读写文件、跑命令、搜索代码、联网查资料的全能助手 |
| **有温度的陪伴** | 3D 桌宠系统 + 角色卡定制 + AI 伴侣模式，让编程过程不再孤独 |
| **长期记忆** | 记忆树 + SuperContext + TokenJuice，Agent 具备跨会话记忆与自主编排能力 |
| **沉浸式设计** | 无边框窗口、九宫格布局、深浅主题、流畅动画 |
| **安全可控** | 三级权限系统，工作区内外分级授权，敏感操作必询问 |
| **本地优先** | SQLite 本地存储、electron-store 持久化，数据掌握在自己手中 |
| **高度可扩展** | MCP 协议 + SCL 技能系统，能力可持续增强 |
| **开源免费** | GPL-3.0 协议，完全开源，无任何使用限制 |

---

### 使用场景

#### 日常编程

> "帮我在这个项目里加一个用户登录功能，用 JWT。"

Agent 会自主读取项目结构、找到相关文件、编写代码、创建新文件，全程流式展示进展。

#### 代码审查与重构

> "审查 src/main 目录的代码，找出潜在的安全问题并修复。"

Agent 逐文件分析、定位问题、提交修复方案，工具调用过程透明可见。

#### 调试排错

> "这个报错是什么意思？帮我看看终端输出。"

Agent 通过 terminal_read 工具审阅终端输出，结合项目代码定位根因。

#### 学习与探索

> "这个代码库用了什么架构？给我画个模块依赖图。"

Agent 搜索代码、分析依赖、生成结构化说明。

#### 桌宠陪伴 & AI 伴侣

工作时桌宠在旁边安静陪伴，完成任务会开心互动，闲置太久会睡着，被打扰会傲娇生气。把它配置成你喜欢的角色，让编程时光多一点温度。开启 TTS 语音合成，让 AI 伴侣用声音与你交流。

---

### 部署方式

#### 方式一：下载安装包（推荐普通用户）

1. 前往 [Releases 页面](https://github.com/zouyuxuan122/ZX-code/releases/latest)
2. 下载 `ZX-Code-0.2.0-x64.exe`
3. 双击运行安装程序，按提示完成安装
4. 从开始菜单或桌面快捷方式启动 ZX-Code

**系统要求**：Windows 10/11（x64）

#### 方式二：从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/zouyuxuan122/ZX-code.git
cd ZX-code

# 2. 安装依赖
npm install

# 3. 开发模式运行
npm run dev

# 4. 构建生产版本
npm run build

# 5. 打包为 exe 安装包
npm run dist
```

打包产物位于 `release/` 目录：
- `release/win-unpacked/ZX-Code.exe` — 免安装版
- `release/ZX-Code-0.2.0-x64.exe` — NSIS 安装包

#### 方式三：开发调试

```bash
# 安装依赖
npm install

# 启动开发服务器（热重载）
npm run dev

# 运行测试
npm test

# 类型检查
npm run typecheck

# 代码规范检查
npm run lint
```

<details>
<summary>📦 构建环境要求</summary>

- Node.js ≥ 18
- npm ≥ 9
- Windows 10/11（打包 Windows 应用需要 Windows 环境）
- Python 3（用于编译 better-sqlite3 原生模块，通常 electron-builder 会自动处理）

</details>

<details>
<summary>⚙️ 高级配置</summary>

**首次启动配置 AI 模型**：

1. 打开 设置 → 模型管理
2. 选择一个 Provider（如 DeepSeek），填入 API Key 或使用网页大模型登录
3. 在模型选择栏选择已配置的模型
4. 开始对话

**配置网页大模型（免 API Key）**：

1. 设置 → 网页大模型
2. 选择厂商（DeepSeek / GLM / Kimi 等），点击登录
3. 完成网页 OAuth 授权
4. 在模型选择栏选择"网页大模型"

**配置桌宠**：

1. 设置 → 桌宠设置
2. 编辑角色卡（名称、性格、问候语、人设文本）
3. 选择形象（SVG / VRM / Live2D），可导入本地模型文件
4. 在九宫格中添加"桌宠"面板即可显示

**配置 TTS 语音**：

1. 设置 → TTS 语音
2. 选择引擎（Edge 免费 / OpenAI / 自定义）
3. 选择音色、调节语速音量
4. 开启自动朗读或手动朗读

</details>

---

### 文档

- [更新日志](https://github.com/zouyuxuan122/ZX-code/releases) — 版本发布记录

---

### 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 33 · React 19 · TypeScript 5.6 |
| 构建 | electron-vite 2 · electron-builder 25 |
| 样式 | Tailwind CSS 3 |
| 状态 | Zustand 5 |
| 数据库 | better-sqlite3 11 |
| 3D 渲染 | three.js · @pixiv/three-vrm（VRM）· pixi.js + pixi-live2d-display（Live2D） |
| 终端 | @xterm/xterm 6 |
| 代理 | Koa 2 · @koa/router |
| 动画 | framer-motion 11 |
| 记忆 | better-sqlite3（记忆树存储） · Obsidian 导出 |
| TTS | edge-tts · OpenAI 兼容语音 API |
| 测试 | Vitest 4 · Testing Library · 673 个测试用例 |

---

### 项目结构

```
ZX-CODE-FREE-PLUS/
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── agent/             # Agent 引擎（工具调用循环、子智能体、记忆引擎）
│   │   ├── chat2api/          # 内置代理引擎（OpenAI 兼容代理）
│   │   ├── providers/         # AI Provider 抽象层
│   │   ├── tools/             # 14 个内置工具
│   │   ├── database/          # SQLite 数据库与迁移
│   │   ├── ipc/               # IPC 通信模块
│   │   ├── services/          # 后端服务（权限、终端、MCP、TTS 等）
│   │   ├── window.ts          # 窗口管理
│   │   └── index.ts           # 主进程入口
│   ├── preload/               # 预加载脚本（contextBridge）
│   ├── renderer/              # React 渲染进程
│   │   └── src/
│   │       ├── pages/         # 页面
│   │       ├── components/    # 组件（chat / grid / settings / layout）
│   │       ├── stores/        # Zustand store
│   │       ├── services/      # 前端服务
│   │       └── assets/        # 静态资源
│   └── shared/                # 主进程与渲染进程共享代码
│       ├── constants/         # 应用常量
│       └── types/             # 类型定义
├── resources/                 # 应用资源（图标、WASM）
├── electron-builder.yml       # 打包配置
├── electron.vite.config.ts    # Vite 构建配置
└── package.json
```

---

### 开发者

<table>
  <tr>
    <td align="center">
      <b>@Nefert</b><br/>
      <sub>开发 & UI 设计</sub><br/>
      <a href="https://github.com/zouyuxuan122">GitHub</a> · <a href="https://b23.tv/ZqiibER">哔哩哔哩</a>
    </td>
  </tr>
</table>

---

### 贡献

欢迎提交 Issue 和 Pull Request！请确保：

1. 提交前运行 `npm test` 和 `npm run typecheck` 确保无回归
2. 遵循现有的代码风格与提交规范（Conventional Commits）
3. 新功能请附带测试

---

### 许可证

[GPL-3.0 License](LICENSE)

---

<!-- ==================== English ==================== -->

## English

### Introduction

ZX-Code is a desktop AI coding agent for Windows. It's more than a chat box — it's an assistant that can **read and write files, execute commands, search code, browse the web, and dispatch sub-tasks**, all while featuring an **interactive 3D desktop pet system** and **character-based companionship** to keep you company while you code.

Built with Electron + React + TypeScript, it features a frameless immersive window, dark/light theme switching, and a customizable 9-grid layout that combines chat, terminal, desktop pet, and monitoring panels on a single screen.

> Core philosophy: **An AI that actually gets its hands dirty writing code, not just talking about it.**

---

### Comparison with Similar Projects

| Capability | ZX-Code | Cursor | Windsurf | Cline | Continue | GitHub Copilot |
|:-----------|:-------:|:------:|:--------:|:-----:|:--------:|:--------------:|
| **No-API-key Chinese LLMs** | DeepSeek / GLM / Kimi / Qwen / MiniMax (9 providers) | API only | API only | API only | API only | GitHub models only |
| **One-click OAuth login** | Use web accounts directly | Requires API key | Requires API key | Requires API key | Requires API key | Requires subscription |
| **3D desktop pet & AI companion** | Live2D / VRM / SVG | None | None | None | None | None |
| **9-grid multi-panel workspace** | 9 drag-and-drop panels | Single panel | Dual panel | Single panel | Sidebar | None |
| **Long-term memory system** | Memory tree + SuperContext + Obsidian export | Limited | None | None | None | None |
| **Goal Kanban & auto-orchestration** | 3-column Kanban + subconscious service | None | None | None | None | None |
| **TTS voice synthesis** | Edge/OpenAI/Custom + voice cloning | None | None | None | None | None |
| **Parallel sub-agents** | general/research/coder | None | Yes | None | None | None |
| **Local-first & data ownership** | SQLite local storage | Cloud | Cloud | Local | Local | Cloud |
| **MCP protocol** | Supported | Supported | Supported | Supported | Supported | Not supported |
| **Open source & free** | GPL-3.0 | Closed/Paid | Closed/Paid | Open | Open | Closed/Paid |
| **Personalized UI** | Frameless + dark/light + smooth animations | Basic | Basic | Plugin | Plugin | No standalone UI |

> **Key differentiator**: ZX-Code is the only desktop AI coding app that combines "no-key Chinese LLM access + 3D desktop pet companion + 9-grid workspace + long-term memory" in one package.

---

### Core Features

#### Agent Engine

- **Multi-turn tool-calling loop** — The agent autonomously plans, calls tools, and iterates based on results (up to 20 iterations)
- **14 built-in tools** — File read/write/edit, code search (grep/glob), command execution, terminal management, web fetch, web search, sub-task dispatch, todo list, user questions
- **Streaming tool calls** — Real-time incremental parameter streaming, file writes visible as they happen
- **Sub-agents** — Dispatch independent read-only sub-agents (general / research / coder) for parallel work
- **Three-tier permission system** — Each tool configurable as `allow / ask / deny`; workspace files auto-approved; external files support "always allow" whitelist

#### Multi-Model Support

- **7 built-in providers** — OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Qwen, Ollama (local), Web Chat
- **Built-in proxy engine** — Access **9 Chinese LLM web versions** (DeepSeek / GLM / Kimi / MiMo / MiniMax / Perplexity / Qwen / Qwen-AI / ZAI) via a local OpenAI-compatible proxy — **no API key needed**, with OAuth login and account load balancing
- **One-click login** — Select a provider, click login, complete OAuth — no API key or paid subscription required
- **Suitable for code tasks** — Supports code generation, debugging, refactoring, review, and all development scenarios
- **Thinking level control** — fast / standard / deep reasoning depth
- **Context management** — Real-time token estimation, usage progress bar, auto-compression, manual rollback

#### Desktop Pet & AI Companion

- **Three model formats** — SVG vector characters, VRM (.vrm 3D models), Live2D (.model3.json anime characters)
- **Expression & animation system** — 6 mood states (idle / happy / working / annoyed / sleeping / talking), each mapped to specific animations and expressions
- **AI-driven performance** — The LLM automatically selects the most fitting animation and expression based on the conversation, bringing characters to life
- **Character card customization** — Define name, personality, greeting, and persona text (injected directly into the system prompt) to create your personal AI companion
- **Behavior loop** — Random idle bubbles, falls asleep after 5 minutes of inactivity, gets annoyed when disturbed during work
- **Interaction** — Drag to move, scroll to zoom, mouse gaze tracking, physics simulation
- **Companion mode** — Configure the character card as a companion persona, and the desktop pet becomes your AI girlfriend/partner, engaging in character-driven chat through the grid conversation panel with replies driving expressions and animations — a warm, embodied companionship experience

#### 9-Grid Workspace

- **9 customizable panels** — Chat, desktop pet, terminal, AI live view, browser preview, clock, weather, usage heatmap, todo list, Kanban
- **5 layout presets** — Default / Chat-focused / Monitor mode / Pet-focused / Classic
- **Drag-and-swap & resizable** — Drag panels to swap positions, drag dividers to resize
- **Persistent layout** — Your custom layout is automatically saved

#### Memory & Orchestration

- **Memory tree architecture** — Six-partition structure (project / decision / error / preference / subconscious / general), persisted in SQLite; recall score = relevance (0/0.5/1) × 0.7 + time decay 1/(1+days/30) × 0.3
- **Auto extraction & recall** — Fire-and-forget async extraction of key info into memory after a conversation ends; Top-K memories recalled by keyword and injected into the system prompt when sending a message
- **Obsidian export** — One-click export to a Markdown vault with YAML frontmatter + per-partition subdirectories, interoperable with Obsidian note libraries
- **SuperContext warm-up** — Before sending a message, automatically builds a briefing: relevant files (≤10), relevant memories (≤3), recent history (≤2), injected as a system message; degrades to an empty briefing on 800ms timeout, never blocking the conversation
- **TokenJuice output compression** — Auto-compresses oversized tool output: strip ANSI escapes → merge consecutive blank lines → keep head/tail with middle elided; default threshold 8000 chars, reduces token usage by ≥ 50%
- **Persistent goals & Kanban** — Dual-layer data model: Goal (long-term/session goals) and Task (Kanban tasks); three-column Kanban (todo / doing / done) with cross-column drag-and-drop transitions; the Agent can autonomously create/update goals and tasks via the goal_manage tool
- **Auto-sync & subconscious** — SchedulerService periodic scheduling; SubconsciousService scans workspace changes and writes summaries to the subconscious partition; AutoFetchService pulls external data sources (GitHub issues / RSS)
- **Tray "Sync Now"** — One-click trigger for auto-sync with system notification on completion

#### TTS Voice Synthesis

- **Three engines** — Edge TTS (Microsoft Neural voices, free) / OpenAI TTS / Custom OpenAI-compatible endpoint
- **Dual mode** — auto (auto-read AI replies) / manual (click button to read)
- **Voice cloning** — Upload audio sample + reference text to create a custom cloned voice
- **Parameter control** — Rate (0.5~2.0), volume (0.0~1.0), audio format (mp3/wav)
- **Multiple voices** — Supports Chinese Neural voices (Xiaoxiao, Yunyang, etc.) and all cloud engine voices

#### Immersive Experience

- **Frameless window** — Custom title bar for an immersive workspace
- **Dark / Light theme** — One-click toggle with smooth transition animations
- **Multiple workspaces** — Each workspace has independent conversations and backgrounds with customizable AI/user avatars
- **Markdown rendering** — Code highlighting, GFM tables, diff view, streaming output
- **Slash commands** — 16 quick commands (/help /clear /compact /new /export, etc.)
- **MCP protocol support** — Connect external MCP servers to extend tool capabilities
- **SCL skill extensions** — Inject domain-specific skill prompts to enhance agent expertise

---

### Advantages

| Advantage | Description |
|-----------|-------------|
| **Free Chinese LLMs** | One-click login to DeepSeek / GLM / Kimi / Qwen / MiniMax (9 providers) — no API key, no subscription |
| **A hands-on agent** | Not just chat — reads/writes files, runs commands, searches code, browses the web |
| **Warm companionship** | 3D desktop pet system + character cards + AI companion mode for a less lonely coding experience |
| **Long-term memory** | Memory tree + SuperContext + TokenJuice — Agent has cross-session memory and autonomous orchestration |
| **Immersive design** | Frameless window, 9-grid layout, dark/light themes, smooth animations |
| **Safe & controllable** | Three-tier permissions, workspace isolation, sensitive operations always prompt |
| **Local-first** | SQLite local storage, electron-store persistence — your data stays with you |
| **Highly extensible** | MCP protocol + SCL skill system for continuous capability growth |
| **Open source & free** | GPL-3.0 license, fully open source, no usage restrictions |

---

### Use Cases

#### Daily Coding

> "Add a JWT-based user login feature to this project."

The agent autonomously reads the project structure, finds relevant files, writes code, and creates new files — all streamed in real time.

#### Code Review & Refactoring

> "Review the code in src/main, find potential security issues and fix them."

The agent analyzes file by file, locates problems, and proposes fixes with a transparent tool-calling process.

#### Debugging

> "What does this error mean? Check the terminal output."

The agent reads terminal output via the terminal_read tool and cross-references project code to pinpoint the root cause.

#### Learning & Exploration

> "What architecture does this codebase use? Draw a module dependency graph."

The agent searches code, analyzes dependencies, and generates a structured overview.

#### Desktop Pet & AI Companion

Your pet keeps you company quietly while you work, celebrates when tasks complete, falls asleep when idle, and gets playfully annoyed when disturbed. Customize it into your favorite character. Enable TTS voice synthesis to let your AI companion speak to you.

---

### Deployment

#### Option 1: Download the Installer (Recommended)

1. Go to the [Releases page](https://github.com/zouyuxuan122/ZX-code/releases/latest)
2. Download `ZX-Code-0.2.0-x64.exe`
3. Run the installer and follow the prompts
4. Launch ZX-Code from the Start menu or desktop shortcut

**Requirements**: Windows 10/11 (x64)

#### Option 2: Build from Source

```bash
# 1. Clone the repository
git clone https://github.com/zouyuxuan122/ZX-code.git
cd ZX-code

# 2. Install dependencies
npm install

# 3. Run in development mode
npm run dev

# 4. Build for production
npm run build

# 5. Package as installer
npm run dist
```

Build artifacts are in `release/`:
- `release/win-unpacked/ZX-Code.exe` — Portable version
- `release/ZX-Code-0.2.0-x64.exe` — NSIS installer

#### Option 3: Development & Debugging

```bash
# Install dependencies
npm install

# Start dev server with hot reload
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Lint
npm run lint
```

<details>
<summary>Build Requirements</summary>

- Node.js ≥ 18
- npm ≥ 9
- Windows 10/11 (required for building Windows apps)
- Python 3 (for compiling better-sqlite3 native modules; electron-builder usually handles this automatically)

</details>

<details>
<summary>Advanced Configuration</summary>

**Set up an AI model on first launch**:

1. Open Settings → Model Management
2. Choose a provider (e.g., DeepSeek), enter your API key or use Web Chat login
3. Select a configured model in the model selector
4. Start chatting

**Configure Web Chat (no API key)**:

1. Settings → Web Chat
2. Select a provider (DeepSeek / GLM / Kimi, etc.) and click login
3. Complete the web OAuth authorization
4. Select "Web Chat" in the model selector

**Configure the desktop pet**:

1. Settings → Pet Settings
2. Edit the character card (name, personality, greeting, persona text)
3. Choose an avatar format (SVG / VRM / Live2D); local model files can be imported
4. Add a "Pet" panel in the 9-grid to display it

**Configure TTS voice**:

1. Settings → TTS Voice
2. Choose an engine (Edge free / OpenAI / Custom)
3. Select a voice, adjust rate and volume
4. Enable auto-read or manual read

</details>

---

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 33 · React 19 · TypeScript 5.6 |
| Build | electron-vite 2 · electron-builder 25 |
| Styling | Tailwind CSS 3 |
| State | Zustand 5 |
| Database | better-sqlite3 11 |
| 3D Rendering | three.js · @pixiv/three-vrm (VRM) · pixi.js + pixi-live2d-display (Live2D) |
| Terminal | @xterm/xterm 6 |
| Proxy | Koa 2 · @koa/router |
| Animation | framer-motion 11 |
| Memory | better-sqlite3 (memory tree storage) · Obsidian export |
| TTS | edge-tts · OpenAI-compatible voice API |
| Testing | Vitest 4 · Testing Library · 673 test cases |

---

### Project Structure

```
ZX-CODE-FREE-PLUS/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── agent/             # Agent engine (tool loop, sub-agents, memory)
│   │   ├── chat2api/          # Built-in proxy engine
│   │   ├── providers/         # AI provider abstraction
│   │   ├── tools/             # 14 built-in tools
│   │   ├── database/          # SQLite database & migrations
│   │   ├── ipc/               # IPC modules
│   │   ├── services/          # Backend services (permissions, terminal, MCP, TTS)
│   │   └── window.ts          # Window management
│   ├── preload/               # Preload scripts
│   ├── renderer/              # React renderer
│   │   └── src/
│   │       ├── pages/         # Pages
│   │       ├── components/    # Components (chat / grid / settings / layout)
│   │       ├── stores/        # Zustand stores
│   │       └── services/      # Frontend services
│   └── shared/                # Shared code (constants, types)
├── resources/                 # App resources (icons, WASM)
└── package.json
```

---

### Developer

<table>
  <tr>
    <td align="center">
      <b>@Nefert</b><br/>
      <sub>Development & UI Design</sub><br/>
      <a href="https://github.com/zouyuxuan122">GitHub</a> · <a href="https://b23.tv/ZqiibER">Bilibili</a>
    </td>
  </tr>
</table>

---

### Contributing

Issues and Pull Requests are welcome! Please ensure:

1. Run `npm test` and `npm run typecheck` before submitting to ensure no regressions
2. Follow existing code style and commit conventions (Conventional Commits)
3. Include tests for new features

---

### License

[GPL-3.0 License](LICENSE)

---

<div align="center">

<sub>Built with care by @Nefert</sub>

</div>
