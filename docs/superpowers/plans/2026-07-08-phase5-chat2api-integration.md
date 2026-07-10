# 阶段 5：Chat2API 引擎内置 + Skill 系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 将 Chat2API（https://github.com/xiaoY233/Chat2API）的网页大模型代理引擎作为内置子模块移植到 ZX-Code，实现 DeepSeek/GLM/Kimi/Qwen/MiniMax 等网页大模型的接入、独立设置界面、对话列表直接调用、AccessToken 管理；并随后实现 Skill 系统（从对话提取 Skill、Skill 库管理、复用与组合）。赫尔墨斯自动进化暂缓。

**架构:** Chat2API 的 `proxy/`（Koa HTTP 服务器）、`oauth/`（token 管理）、`store/`（electron-store 配置）、`lib/`（WASM PoW）模块作为自包含子模块整体复制到 `src/main/chat2api/`，在主进程启动时启动内置 Koa 服务监听 `127.0.0.1:8080`（OpenAI 兼容 API）。ZX-Code 新增 `WebChatProvider`（继承 `BaseProvider`）把请求转发到本地 `http://127.0.0.1:8080/v1/chat/completions`，复用现有 Provider 抽象与对话链路。Chat2API 的账户/Token 配置存独立 electron-store（`~/.zx-code/chat2api.json`），与 ZX-Code 的 SQLite provider 配置隔离。设置页新增"网页大模型"tab 管理 Chat2API 账户；ModelSelector 通过 `getAllAvailableModels()` 自动展示已登录的网页模型。

**技术栈:** Electron 33、TypeScript 5.6、Koa 2.15、electron-store、axios、eventsource-parser、better-sqlite3、React 19、Zustand

**许可证变更（重要）:**
- Chat2API 采用 **GPL-3.0** 许可证（强 copyleft）
- ZX-Code 当前为 MIT（`package.json` L7）
- 移植 Chat2API 代码后，ZX-Code **必须**整体变更为 GPL-3.0
- 这是不可逆的法律决策：衍生作品必须以 GPL-3.0 开源
- 本计划 Task 1 包含许可证变更步骤

**Chat2API 源码参考:** 本地克隆位于 `c:\Users\HUAWEI\.trae-cn\work\6a474338f14e51e655ce0fe3\Chat2API-ref`（v1.4.0）。移植类 task 引用此路径作为复制源。

---

## 文件结构

```
d:\ZX code\
├── LICENSE                                           # [新建] GPL-3.0 许可证文本
├── package.json                                      # [修改] license→GPL-3.0，新增依赖
├── electron-builder.yml                              # [修改] 新增 extraResources（WASM）
├── resources/
│   └── wasm/
│       └── sha3_wasm_bg.7b9ca65ddd.wasm              # [新建] DeepSeek PoW WASM
├── src/
│   ├── main/
│   │   ├── index.ts                                  # [修改] 启动 chat2api 服务
│   │   ├── chat2api/                                 # [新建] Chat2API 子模块根
│   │   │   ├── README.md                             # [新建] 模块说明 + GPL 声明
│   │   │   ├── index.ts                              # [新建] 模块导出 + startChat2ApiServer()
│   │   │   ├── proxy/                                # [移植] 从 Chat2API src/main/proxy/
│   │   │   │   ├── server.ts
│   │   │   │   ├── forwarder.ts
│   │   │   │   ├── loadbalancer.ts
│   │   │   │   ├── modelMapper.ts
│   │   │   │   ├── status.ts
│   │   │   │   ├── stream.ts
│   │   │   │   ├── sessionManager.ts
│   │   │   │   ├── types.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── routes/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── chat.ts
│   │   │   │   │   ├── completions.ts
│   │   │   │   │   └── models.ts
│   │   │   │   ├── adapters/                         # 9 个 Provider 适配器
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── deepseek.ts
│   │   │   │   │   ├── deepseek-stream.ts
│   │   │   │   │   ├── glm.ts
│   │   │   │   │   ├── kimi.ts
│   │   │   │   │   ├── mimo.ts
│   │   │   │   │   ├── minimax.ts
│   │   │   │   │   ├── perplexity.ts
│   │   │   │   │   ├── perplexity-stream.ts
│   │   │   │   │   ├── qwen.ts
│   │   │   │   │   ├── qwen-ai.ts
│   │   │   │   │   ├── zai.ts
│   │   │   │   │   ├── providerModelOptions.ts
│   │   │   │   │   ├── prompt/                       # Tool Calling prompt 注入
│   │   │   │   │   │   ├── BasePromptAdapter.ts
│   │   │   │   │   │   ├── CherryStudioPromptAdapter.ts
│   │   │   │   │   │   ├── DefaultPromptAdapter.ts
│   │   │   │   │   │   ├── KiloCodePromptAdapter.ts
│   │   │   │   │   │   ├── PromptAdapterRegistry.ts
│   │   │   │   │   │   └── index.ts
│   │   │   │   ├── toolCalling/
│   │   │   │   │   └── providerProfiles.ts
│   │   │   │   ├── middleware/
│   │   │   │   │   └── managementAuth.ts
│   │   │   │   └── utils/
│   │   │   │       └── toolFormatConverter.ts
│   │   │   ├── oauth/                                # [移植] 从 Chat2API src/main/oauth/
│   │   │   │   ├── index.ts
│   │   │   │   ├── manager.ts
│   │   │   │   ├── inAppLogin.ts
│   │   │   │   ├── tokenExtractionConfig.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── adapters/
│   │   │   │       ├── base.ts
│   │   │   │       ├── index.ts
│   │   │   │       ├── deepseek.ts
│   │   │   │       ├── glm.ts
│   │   │   │       ├── kimi.ts
│   │   │   │       ├── mimo.ts
│   │   │   │       ├── minimax.ts
│   │   │   │       ├── perplexity.ts
│   │   │   │       ├── qwen.ts
│   │   │   │       ├── qwen-ai.ts
│   │   │   │       └── zai.ts
│   │   │   ├── store/                                # [移植] 从 Chat2API src/main/store/
│   │   │   │   ├── index.ts
│   │   │   │   ├── store.ts
│   │   │   │   ├── types.ts
│   │   │   │   ├── accounts.ts
│   │   │   │   ├── providers.ts
│   │   │   │   ├── config.ts
│   │   │   │   └── validator.ts
│   │   │   ├── providers/                            # [移植] 内置 Provider 配置
│   │   │   │   ├── index.ts
│   │   │   │   ├── checker.ts
│   │   │   │   ├── custom.ts
│   │   │   │   └── builtin/
│   │   │   │       ├── index.ts
│   │   │   │       ├── deepseek.ts
│   │   │   │       ├── glm.ts
│   │   │   │       ├── kimi.ts
│   │   │   │       ├── mimo.ts
│   │   │   │       ├── minimax.ts
│   │   │   │       ├── perplexity.ts
│   │   │   │       ├── qwen.ts
│   │   │   │       ├── qwen-ai.ts
│   │   │   │       └── zai.ts
│   │   │   ├── lib/
│   │   │   │   └── challenge.ts                      # [移植] WASM PoW 加载
│   │   │   └── data/
│   │   │       └── builtin-prompts.ts                # [移植] 内置提示词
│   │   ├── providers/
│   │   │   ├── index.ts                              # [修改] createProvider 新增 'webchat' 类型
│   │   │   └── webchat.provider.ts                   # [新建] 桥接到 localhost:8080
│   │   ├── ipc/
│   │   │   ├── index.ts                              # [修改] 注册 chat2api IPC
│   │   │   └── chat2api.ipc.ts                       # [新建] accounts/oauth/proxy IPC
│   │   └── database/
│   │       └── repositories/
│   │           └── provider.repo.ts                  # [修改] createDefaultProviders 新增 webchat
│   ├── preload/
│   │   └── api.ts                                    # [修改] 暴露 chat2api 命名空间
│   ├── shared/
│   │   └── types/
│   │       ├── model.ts                              # [修改] ProviderType 新增 'webchat'
│   │       └── chat2api.ts                           # [新建] Chat2API 共享类型
│   └── renderer/
│       └── src/
│           ├── components/
│           │   ├── settings/
│           │   │   └── WebChatSettings.tsx           # [新建] 网页大模型设置页
│           │   └── chat/
│           │       └── ModelSelector.tsx             # [修改] 展示网页模型分组
│           ├── pages/
│           │   └── SettingsPage.tsx                  # [修改] 新增 webchat tab
│           └── stores/
│               └── chat2apiStore.ts                  # [新建] Chat2API 状态管理
```

---

## Task 1: 许可证变更 + 依赖安装 + 目录准备

**文件:**
- 新建: `LICENSE`
- 修改: `package.json`
- 新建: `resources/wasm/` 目录
- 新建: `src/main/chat2api/README.md`

- [ ] **步骤 1: 创建 GPL-3.0 LICENSE 文件**

创建 `d:\ZX code\LICENSE`，内容为 GPL-3.0 完整文本（从 https://www.gnu.org/licenses/gpl-3.0.txt 获取）。文件开头添加：

```
ZX-Code
Copyright (C) 2026 zouyuxuan122

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.

---

This product includes code from Chat2API (https://github.com/xiaoY233/Chat2API)
Copyright (C) 2026 Chat2API Team, licensed under GPL-3.0.
```

- [ ] **步骤 2: 修改 package.json 许可证字段**

定位 `d:\ZX code\package.json` 第 7 行：

```json
"license": "MIT",
```

改为：

```json
"license": "GPL-3.0",
```

- [ ] **步骤 3: 安装 Chat2API 运行时依赖**

在 `d:\ZX code` 运行：

```bash
npm install koa@^2.15.3 @koa/router@^15.3.0 koa-bodyparser@^4.4.1 axios@^1.7.7 js-sha3@^0.9.3 eventsource-parser@^3.0.6 zstd-codec@^0.1.5
```

说明：
- `koa` + `@koa/router` + `koa-bodyparser`：代理 HTTP 服务器
- `axios`：Chat2API 适配器调用各 Provider Web API
- `js-sha3`：哈希算法（DeepSeek PoW 备用）
- `eventsource-parser`：SSE 流解析
- `zstd-codec`：部分 Provider 响应压缩解码
- 不安装 `electron-updater`（ZX-Code 自有更新机制）、`i18next`（ZX-Code 自有 i18n）

- [ ] **步骤 4: 创建 chat2api 模块说明文件**

创建 `d:\ZX code\src\main\chat2api\README.md`：

```markdown
# Chat2API 内置引擎

本目录是 Chat2API（https://github.com/xiaoY233/Chat2API）v1.4.0 的移植子模块。

## 许可证
GPL-3.0（与主项目一致）。原始版权属于 Chat2API Team。

## 模块结构
- `proxy/` - Koa HTTP 代理服务器（OpenAI 兼容 API）
- `oauth/` - OAuth/Token 登录管理
- `store/` - electron-store 配置持久化
- `providers/` - 内置 Provider 配置（DeepSeek/GLM/Kimi 等）
- `lib/challenge.ts` - DeepSeek PoW WASM 加载
- `data/builtin-prompts.ts` - 内置系统提示词

## 适配修改记录
移植时对原代码的修改记录在此，便于后续升级 Chat2API 时合并。
```

- [ ] **步骤 5: 创建 WASM 资源目录并复制 WASM 文件**

```bash
mkdir -p "d:\ZX code\resources\wasm"
copy "c:\Users\HUAWEI\.trae-cn\work\6a474338f14e51e655ce0fe3\Chat2API-ref\sha3_wasm_bg.7b9ca65ddd.wasm" "d:\ZX code\resources\wasm\"
```

- [ ] **步骤 6: 提交**

```bash
cd "d:\ZX code"
git add LICENSE package.json package-lock.json resources/wasm/ src/main/chat2api/README.md
git commit -m "feat(license): 变更为 GPL-3.0 以集成 Chat2API；安装 Koa/axios 等依赖；准备 chat2api 模块目录"
```

---

## Task 2: 移植 Chat2API store 模块（配置持久化层）

store 模块是其他模块的基础依赖（proxy/oauth 都依赖 storeManager 读写配置/账户）。

**文件:**
- 移植: `src/main/chat2api/store/` 全部 7 个文件
- 修改: 移植后的 `store.ts`（适配 electron-store 版本与存储路径）

- [ ] **步骤 1: 复制 store 模块文件**

从 Chat2API 源码复制以下文件到对应目标：

| 源（Chat2API-ref/src/main/store/）| 目标（src/main/chat2api/store/）|
|----------------------------------|-------------------------------|
| `index.ts` | `index.ts` |
| `store.ts` | `store.ts` |
| `types.ts` | `types.ts` |
| `accounts.ts` | `accounts.ts` |
| `providers.ts` | `providers.ts` |
| `config.ts` | `config.ts` |
| `validator.ts` | `validator.ts` |

PowerShell 命令：

```powershell
$src = "c:\Users\HUAWEI\.trae-cn\work\6a474338f14e51e655ce0fe3\Chat2API-ref\src\main\store"
$dst = "d:\ZX code\src\main\chat2api\store"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\*.ts" $dst -Force
```

- [ ] **步骤 2: 适配 store.ts 的 electron-store 导入与存储路径**

Chat2API 用 electron-store@10（ESM，动态 import），ZX-Code 用 electron-store@8（CJS，静态 import）。需要适配。

打开 `d:\ZX code\src\main\chat2api\store\store.ts`，找到 `initialize()` 方法中的动态 import：

```typescript
// 原始（Chat2API electron-store@10 ESM）
const Store = (await import('electron-store')).default
this.store = new Store(schema)
```

改为适配 electron-store@8（CJS）：

```typescript
// 适配后（ZX-Code electron-store@8 CJS）
import Store from 'electron-store'
// ... 在 initialize() 中：
this.store = new Store({
  name: 'chat2api',           // 文件名 chat2api.json
  cwd: 'zx-code',             // 存到 ~/.zx-code/ 下，与 ZX-Code 主配置隔离
  encryptionKey: 'chat2api-fixed-encryption-key-v1',
  clearInvalidConfig: true,
})
```

注意：在文件顶部添加 `import Store from 'electron-store'`，移除 `initialize()` 内的动态 import。

- [ ] **步骤 3: 适配 store.ts 的路径引用**

检查 `store.ts` 顶部的 import，把所有相对路径引用从 Chat2API 的结构改为 ZX-Code 结构：

```typescript
// 原始可能引用：
import { ... } from '../requestLogs/manager'
import { ... } from '../appLogs/manager'
```

由于 ZX-Code 暂不移植 requestLogs/appLogs（Task 4 才移植 proxy，日志非必需），将这些引用替换为空实现 stub。在 `store.ts` 顶部添加：

```typescript
// 日志管理 stub（Chat2API 的 requestLogs/appLogs 暂未移植，用空实现）
const requestLogManager = { addLog: () => {}, getLogs: () => [], getRequestLogs: () => [] }
const appLogManager = { addLog: () => {}, getLogs: () => [] }
```

并移除对应的 import 行。

- [ ] **步骤 4: 适配 store/types.ts 的 electron-store 类型**

打开 `d:\ZX code\src\main\chat2api\store\types.ts`，检查是否有 `electron-store` 的类型导入。electron-store@8 与 @10 的类型签名略有差异，若有类型错误，将 `import type { Store } from 'electron-store'` 改为内联类型 `any`。

- [ ] **步骤 5: 运行 typecheck 验证 store 模块**

```bash
cd "d:\ZX code"
npx tsc --noEmit -p tsconfig.node.json
```

预期：store 模块可能有少量类型错误（因未移植的依赖），记录错误但暂不阻塞（Task 4/5 会逐步修复）。重点关注 store.ts 本身的语法正确性。

- [ ] **步骤 6: 提交**

```bash
cd "d:\ZX code"
git add src/main/chat2api/store/
git commit -m "feat(chat2api): 移植 store 模块（electron-store 配置持久化层），适配 electron-store@8"
```

---

## Task 3: 移植 Chat2API oauth 模块（Token 登录管理）

oauth 模块负责各 Provider 的浏览器登录、Token 提取、验证、刷新。

**文件:**
- 移植: `src/main/chat2api/oauth/` 全部 16 个文件

- [ ] **步骤 1: 复制 oauth 模块文件**

```powershell
$src = "c:\Users\HUAWEI\.trae-cn\work\6a474338f14e51e655ce0fe3\Chat2API-ref\src\main\oauth"
$dst = "d:\ZX code\src\main\chat2api\oauth"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\*.ts" $dst -Force
New-Item -ItemType Directory -Force -Path "$dst\adapters" | Out-Null
Copy-Item "$src\adapters\*.ts" "$dst\adapters" -Force
```

- [ ] **步骤 2: 适配 oauth 模块的 import 路径**

oauth 模块内部引用 store 模块。检查所有 oauth 文件中的 import，把 `../store/...` 路径保持不变（因为 zx-code 中 oauth 和 store 同在 chat2api/ 下，相对路径一致）。

检查 oauth/manager.ts 和 oauth/inAppLogin.ts 是否引用了 Chat2API 的其他模块（如 logger、window），若有则改为 stub 或 ZX-Code 对应模块：

```typescript
// 原始可能引用：
import { logger } from '../logger'
import { getMainWindow } from '../window/manager'
```

适配为 ZX-Code 的 logger：

```typescript
import { logger } from '../../services/logger.service'
```

window 管理保持 stub（oauth manager 接收 mainWindow 参数注入，不直接引用 window 模块）。

- [ ] **步骤 3: 适配 oauth/adapters/base.ts 的 Electron API**

`base.ts` 使用 `BrowserWindow`、`shell.openExternal`、`http.Server`。这些在 Electron 主进程可用，无需修改。确认 import 路径正确：

```typescript
import { BrowserWindow, shell } from 'electron'
```

- [ ] **步骤 4: 运行 typecheck**

```bash
cd "d:\ZX code"
npx tsc --noEmit -p tsconfig.node.json
```

修复 oauth 模块的类型错误（主要是 import 路径和未移植依赖）。

- [ ] **步骤 5: 提交**

```bash
cd "d:\ZX code"
git add src/main/chat2api/oauth/
git commit -m "feat(chat2api): 移植 oauth 模块（9 个 Provider 的 Token 登录/验证/刷新）"
```

---

## Task 4: 移植 Chat2API proxy 核心模块（Koa 服务器 + 转发器）

proxy 模块是 Chat2API 的核心：接收 OpenAI 兼容请求，转发到各 Provider Web API。

**文件:**
- 移植: `src/main/chat2api/proxy/` 全部文件（不含 adapters/，adapters 在 Task 5）

- [ ] **步骤 1: 复制 proxy 核心文件（不含 adapters）**

```powershell
$src = "c:\Users\HUAWEI\.trae-cn\work\6a474338f14e51e655ce0fe3\Chat2API-ref\src\main\proxy"
$dst = "d:\ZX code\src\main\chat2api\proxy"
New-Item -ItemType Directory -Force -Path $dst | Out-Null

# 复制根级 .ts 文件
Copy-Item "$src\*.ts" $dst -Force

# 复制 routes/
New-Item -ItemType Directory -Force -Path "$dst\routes" | Out-Null
Copy-Item "$src\routes\*.ts" "$dst\routes" -Force

# 复制 toolCalling/、middleware/、utils/
foreach ($d in @('toolCalling','middleware','utils')) {
  New-Item -ItemType Directory -Force -Path "$dst\$d" | Out-Null
  Copy-Item "$src\$d\*.ts" "$dst\$d" -Force -ErrorAction SilentlyContinue
}
```

- [ ] **步骤 2: 移植 routes/management/ 子目录（管理 API）**

```powershell
$srcMgmt = "c:\Users\HUAWEI\.trae-cn\work\6a474338f14e51e655ce0fe3\Chat2API-ref\src\main\proxy\routes\management"
$dstMgmt = "d:\ZX code\src\main\chat2api\proxy\routes\management"
if (Test-Path $srcMgmt) {
  New-Item -ItemType Directory -Force -Path $dstMgmt | Out-Null
  Copy-Item "$srcMgmt\*.ts" $dstMgmt -Force
}
```

- [ ] **步骤 3: 适配 proxy 模块的 import 路径**

proxy 模块引用 store、oauth、lib。检查所有 proxy 文件的 import：

- `../store/...` → 保持（相对路径一致）
- `../oauth/...` → 保持
- `../lib/challenge` → 保持（Task 6 移植 lib）
- `../logger` → 改为 `../../services/logger.service`
- `../data/builtin-prompts` → 保持（Task 6 移植 data）

用 Grep 找到所有需要修改的 import：

```bash
# 在 src/main/chat2api/proxy/ 下搜索 logger 引用
```

- [ ] **步骤 4: 适配 proxy/server.ts 的服务启动参数**

打开 `d:\ZX code\src\main\chat2api\proxy\server.ts`，确认 `ProxyServer` 类的 `start(port, host)` 方法。默认端口 8080、host 127.0.0.1 符合需求，无需修改。

确认 `setupMiddleware` 中的 API Key 校验：ZX-Code 内部调用无需 API Key，确认 `enableApiKey` 默认 false（store/types.ts 的 AppConfig 默认值）。

- [ ] **步骤 5: 适配 proxy/forwarder.ts 的依赖**

`forwarder.ts`（~1500 行）是核心转发器，引用 adapters。此时 adapters 尚未移植（Task 5），forwarder 会报 import 错误。暂时在 forwarder 顶部添加 stub：

```typescript
// 临时 stub（Task 5 移植 adapters 后移除）
const dedicatedForwarders: any[] = []
```

或注释掉 adapters 的 import，待 Task 5 恢复。

- [ ] **步骤 6: 运行 typecheck（预期有 adapters 相关错误）**

```bash
cd "d:\ZX code"
npx tsc --noEmit -p tsconfig.node.json 2>&1 | Select-String "chat2api\\proxy"
```

记录错误，Task 5 移植 adapters 后修复。

- [ ] **步骤 7: 提交**

```bash
cd "d:\ZX code"
git add src/main/chat2api/proxy/
git commit -m "feat(chat2api): 移植 proxy 核心模块（Koa 服务器 + forwarder + loadbalancer + routes）"
```

---

## Task 5: 移植 9 个 Provider 适配器 + prompt 注入 + toolCalling

adapters 模块实现各 Provider 的 Web API 调用（DeepSeek/GLM/Kimi/Mimo/MiniMax/Perplexity/Qwen/QwenAi/Zai）。

**文件:**
- 移植: `src/main/chat2api/proxy/adapters/` 全部文件
- 移植: `src/main/chat2api/proxy/adapters/prompt/` 6 个文件

- [ ] **步骤 1: 复制 adapters 文件**

```powershell
$src = "c:\Users\HUAWEI\.trae-cn\work\6a474338f14e51e655ce0fe3\Chat2API-ref\src\main\proxy\adapters"
$dst = "d:\ZX code\src\main\chat2api\proxy\adapters"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\*.ts" $dst -Force
New-Item -ItemType Directory -Force -Path "$dst\prompt" | Out-Null
Copy-Item "$src\prompt\*.ts" "$dst\prompt" -Force
```

- [ ] **步骤 2: 移植内置 Provider 配置（providers/builtin/）**

```powershell
$src = "c:\Users\HUAWEI\.trae-cn\work\6a474338f14e51e655ce0fe3\Chat2API-ref\src\main\providers"
$dst = "d:\ZX code\src\main\chat2api\providers"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\*.ts" $dst -Force
New-Item -ItemType Directory -Force -Path "$dst\builtin" | Out-Null
Copy-Item "$src\builtin\*.ts" "$dst\builtin" -Force
```

- [ ] **步骤 3: 适配 adapters 的 import 路径**

adapters 引用 `../lib/challenge`（DeepSeek PoW）、`../../store`、`../../oauth`、`../utils`。相对路径在 chat2api 结构下一致，无需修改。

检查 adapters 是否引用了 Chat2API 的 logger：

```typescript
import { logger } from '../../../logger'
```

改为：

```typescript
import { logger } from '../../../services/logger.service'
```

- [ ] **步骤 4: 恢复 forwarder.ts 的 adapters 引用**

打开 `d:\ZX code\src\main\chat2api\proxy\forwarder.ts`，移除 Task 4 步骤 5 添加的 stub，恢复原始 adapters import。

- [ ] **步骤 5: 移植 lib/challenge.ts（DeepSeek PoW WASM）**

```powershell
$src = "c:\Users\HUAWEI\.trae-cn\work\6a474338f14e51e655ce0fe3\Chat2API-ref\src\main\lib"
$dst = "d:\ZX code\src\main\chat2api\lib"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\challenge.ts" $dst -Force
```

打开 `d:\ZX code\src\main\chat2api\lib\challenge.ts`，适配 WASM 路径解析。找到 `getDeepSeekHash()` 函数中的路径计算：

```typescript
// 原始
const wasmPath = app.isPackaged
  ? path.join(process.resourcesPath, 'sha3_wasm_bg.7b9ca65ddd.wasm')
  : path.join(app.getAppPath(), 'sha3_wasm_bg.7b9ca65ddd.wasm')
```

改为（适配 ZX-Code 的 resources/wasm/ 目录）：

```typescript
// 适配后
const wasmPath = app.isPackaged
  ? path.join(process.resourcesPath, 'wasm', 'sha3_wasm_bg.7b9ca65ddd.wasm')
  : path.join(app.getAppPath(), 'resources', 'wasm', 'sha3_wasm_bg.7b9ca65ddd.wasm')
```

- [ ] **步骤 6: 移植 data/builtin-prompts.ts**

```powershell
$src = "c:\Users\HUAWEI\.trae-cn\work\6a474338f14e51e655ce0fe3\Chat2API-ref\src\main\data"
$dst = "d:\ZX code\src\main\chat2api\data"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\builtin-prompts.ts" $dst -Force
```

- [ ] **步骤 7: 修改 electron-builder.yml 添加 WASM 打包配置**

打开 `d:\ZX code\electron-builder.yml`，在 `files` 字段后添加 `extraResources`：

```yaml
files:
  - out/**/*
  - resources/**/*
  - package.json
extraResources:
  - from: resources/wasm/
    to: wasm/
    filter: ['**/*']
```

- [ ] **步骤 8: 运行 typecheck 验证完整 chat2api 模块**

```bash
cd "d:\ZX code"
npx tsc --noEmit -p tsconfig.node.json
```

预期：可能有少量类型错误（第三方依赖类型），逐一修复。重点确保 chat2api 模块内部引用闭环。

- [ ] **步骤 9: 提交**

```bash
cd "d:\ZX code"
git add src/main/chat2api/ electron-builder.yml
git commit -m "feat(chat2api): 移植 9 个 Provider 适配器 + prompt 注入 + toolCalling + WASM PoW + builtin 配置"
```

---

## Task 6: 创建 chat2api 模块入口 + 主进程启动集成

创建 chat2api 模块的统一入口，在主进程启动时初始化 storeManager、启动 proxyServer。

**文件:**
- 新建: `src/main/chat2api/index.ts`
- 修改: `src/main/index.ts`

- [ ] **步骤 1: 创建 chat2api/index.ts 模块入口**

创建 `d:\ZX code\src\main\chat2api\index.ts`：

```typescript
/**
 * Chat2API 内置引擎模块入口
 *
 * 负责初始化 storeManager、oauthManager，启动 Koa 代理服务器。
 * 服务器监听 127.0.0.1:8080，暴露 OpenAI 兼容 API。
 */
import { BrowserWindow } from 'electron'
import { logger } from '../services/logger.service'
import { storeManager } from './store'
import { oauthManager } from './oauth'
import { proxyServer } from './proxy/server'

const DEFAULT_PORT = 8080
const DEFAULT_HOST = '127.0.0.1'

let initialized = false
let serverStarted = false

/**
 * 初始化 Chat2API 引擎：加载 store 配置。
 * 必须在 app.whenReady() 之后、createMainWindow 之前调用。
 */
export async function initChat2Api(): Promise<void> {
  if (initialized) {
    logger.warn('[chat2api] 已初始化，跳过')
    return
  }
  try {
    await storeManager.initialize()
    logger.info('[chat2api] storeManager 已初始化')
    initialized = true
  } catch (err) {
    logger.error('[chat2api] 初始化失败', err as Error)
    throw err
  }
}

/**
 * 启动 Chat2API 代理服务器。
 * 在主窗口创建后调用（oauth 需要 mainWindow）。
 */
export async function startChat2ApiServer(mainWindow: BrowserWindow): Promise<void> {
  if (!initialized) {
    await initChat2Api()
  }
  if (serverStarted) {
    logger.warn('[chat2api] 服务器已启动，跳过')
    return
  }

  // 注入 mainWindow 给 oauthManager（登录进度通知）
  oauthManager.setMainWindow(mainWindow)

  // 读取端口配置（用户可在设置中修改）
  const config = storeManager.getConfig()
  const port = config.proxyPort || DEFAULT_PORT
  const host = config.proxyHost || DEFAULT_HOST

  try {
    const ok = await proxyServer.start(port, host)
    if (ok) {
      serverStarted = true
      logger.info(`[chat2api] 代理服务器已启动: http://${host}:${port}`)
    } else {
      logger.error('[chat2api] 代理服务器启动失败')
    }
  } catch (err) {
    logger.error('[chat2api] 代理服务器启动异常', err as Error)
  }
}

/**
 * 停止 Chat2API 代理服务器（应用退出时调用）。
 */
export async function stopChat2ApiServer(): Promise<void> {
  if (serverStarted) {
    await proxyServer.stop()
    serverStarted = false
    logger.info('[chat2api] 代理服务器已停止')
  }
  storeManager.flushPendingWrites()
}

/**
 * 获取代理服务器运行状态。
 */
export function isChat2ApiRunning(): boolean {
  return serverStarted && proxyServer.isRunning()
}

/**
 * 获取代理服务器基础 URL。
 */
export function getChat2ApiBaseUrl(): string {
  const config = storeManager.getConfig()
  const port = config.proxyPort || DEFAULT_PORT
  const host = config.proxyHost || DEFAULT_HOST
  return `http://${host}:${port}`
}

export { storeManager, oauthManager, proxyServer }
```

- [ ] **步骤 2: 修改主进程 index.ts 集成 Chat2API 启动**

打开 `d:\ZX code\src\main\index.ts`，在 import 块添加：

```typescript
import { initChat2Api, startChat2ApiServer, stopChat2ApiServer } from './chat2api'
```

修改 `app.whenReady().then(...)` 回调（原 L24-45），在 `createMainWindow()` 后启动 Chat2API：

```typescript
  app.whenReady().then(async () => {
    initLogger('info')
    logger.info('应用启动中...')

    initDatabase()
    logger.info('数据库已初始化')

    createDefaultProviders()
    logger.info('默认 Provider 已就绪')

    registerBuiltinTools()
    logger.info('内置工具已注册')

    registerIpcHandlers()
    logger.info('IPC 处理器已注册')

    createMainWindow()
    createTray(getMainWindow)
    logger.info('应用启动完成')

    // 启动 Chat2API 内置引擎
    try {
      await initChat2Api()
      await startChat2ApiServer(getMainWindow())
      logger.info('Chat2API 引擎已启动')
    } catch (err) {
      logger.error('Chat2API 引擎启动失败，网页大模型功能不可用', err as Error)
    }
  })
```

修改 `before-quit` 回调（原 L59-63）添加 Chat2API 停止：

```typescript
  app.on('before-quit', async () => {
    logger.info('应用退出中...')
    destroyTray()
    await stopChat2ApiServer()
    closeDatabase()
  })
```

- [ ] **步骤 3: 运行 typecheck**

```bash
cd "d:\ZX code"
npx tsc --noEmit -p tsconfig.node.json
```

预期：通过。若 chat2api 子模块有类型错误，逐一修复 import 路径。

- [ ] **步骤 4: 启动应用验证 Chat2API 服务**

```bash
cd "d:\ZX code"
npm run dev
```

在应用启动日志中应看到：
```
[chat2api] storeManager 已初始化
[chat2api] 代理服务器已启动: http://127.0.0.1:8080
Chat2API 引擎已启动
```

在浏览器访问 `http://127.0.0.1:8080/health` 应返回 JSON 运行状态。

- [ ] **步骤 5: 提交**

```bash
cd "d:\ZX code"
git add src/main/chat2api/index.ts src/main/index.ts
git commit -m "feat(chat2api): 创建模块入口，主进程启动时自动启动 Koa 代理服务器"
```

---

## Task 7: 新增 WebChatProvider 桥接（OpenAI 兼容 → localhost:8080）

WebChatProvider 继承 BaseProvider，把请求转发到本地 Chat2API 服务。由于 Chat2API 暴露 OpenAI 兼容 API，WebChatProvider 可直接复用 OpenAIProvider 的逻辑，仅改 base_url。

**文件:**
- 新建: `src/main/providers/webchat.provider.ts`
- 修改: `src/main/providers/index.ts`
- 修改: `src/shared/types/model.ts`

- [ ] **步骤 1: 扩展 ProviderType 类型**

打开 `d:\ZX code\src\shared\types\model.ts`，找到第 1 行：

```typescript
export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom'
```

改为：

```typescript
export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom' | 'webchat'
```

- [ ] **步骤 2: 创建 WebChatProvider**

创建 `d:\ZX code\src\main\providers\webchat.provider.ts`：

```typescript
import { BaseProvider } from './base'
import { OpenAIProvider } from './openai.provider'
import type { ChatParams, ChatChunk, ModelInfo, ProviderConfig } from '@shared/types/model'
import { getChat2ApiBaseUrl, isChat2ApiRunning } from '../chat2api'
import { logger } from '../services/logger.service'

/**
 * WebChatProvider：桥接到内置 Chat2API 引擎。
 *
 * Chat2API 暴露 OpenAI 兼容 API（/v1/chat/completions、/v1/models），
 * 因此本 Provider 复用 OpenAIProvider 的请求逻辑，
 * 仅将 base_url 指向本地 Chat2API 服务（127.0.0.1:8080）。
 *
 * 用户在"网页大模型"设置页登录的账户（DeepSeek/GLM/Kimi 等）的模型，
 * 会通过 Chat2API 的 /v1/models 端点暴露，本 Provider 拉取后写入 SQLite。
 */
export class WebChatProvider extends BaseProvider {
  private delegate: OpenAIProvider

  constructor(config: ProviderConfig) {
    super(config)
    // 用 OpenAIProvider 处理实际请求，但覆盖 base_url 为本地 Chat2API
    this.delegate = new OpenAIProvider({
      ...config,
      base_url: getChat2ApiBaseUrl(),
      api_key: 'chat2api-internal', // Chat2API 内部调用无需真实 key
    })
  }

  get type(): string {
    return 'webchat'
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!isChat2ApiRunning()) {
      logger.warn('[webchat] Chat2API 引擎未运行，无法拉取模型列表')
      return []
    }
    try {
      const models = await this.delegate.listModels()
      // 标记来源为 webchat
      return models.map((m) => ({
        ...m,
        provider: 'webchat',
        type: 'webchat' as const,
      }))
    } catch (err) {
      logger.error('[webchat] 拉取模型列表失败', err as Error)
      throw err
    }
  }

  chat(params: ChatParams): AsyncGenerator<ChatChunk> {
    if (!isChat2ApiRunning()) {
      throw new Error('Chat2API 引擎未运行，请检查设置或重启应用')
    }
    return this.delegate.chat(params)
  }
}
```

- [ ] **步骤 3: 修改 createProvider 工厂支持 webchat 类型**

打开 `d:\ZX code\src\main\providers\index.ts`，找到 import 块（L1-8），添加：

```typescript
import { WebChatProvider } from './webchat.provider'
```

找到 `createProvider` 函数（L12-26），在 switch 中添加 webchat case：

```typescript
function createProvider(config: ProviderConfig): BaseProvider {
  switch (config.type as ProviderType) {
    case 'openai':
    case 'custom':
      return new OpenAIProvider(config)
    case 'anthropic':
      return new AnthropicProvider(config)
    case 'gemini':
      return new GeminiProvider(config)
    case 'ollama':
      return new OllamaProvider(config)
    case 'webchat':
      return new WebChatProvider(config)
    default:
      return new OpenAIProvider(config)
  }
}
```

- [ ] **步骤 4: 修改 createDefaultProviders 新增 webchat 默认 Provider**

打开 `d:\ZX code\src\main\providers\index.ts`，找到 `createDefaultProviders` 函数（L156-179），在 defaults 数组末尾添加 webchat：

```typescript
  const defaults: Array<{ name: string; type: ProviderType; base_url: string; api_key: string }> = [
    { name: 'OpenAI', type: 'openai', base_url: 'https://api.openai.com', api_key: '' },
    { name: 'Anthropic', type: 'anthropic', base_url: 'https://api.anthropic.com', api_key: '' },
    { name: 'Google', type: 'gemini', base_url: 'https://generativelanguage.googleapis.com', api_key: '' },
    { name: 'DeepSeek', type: 'openai', base_url: 'https://api.deepseek.com', api_key: '' },
    { name: 'Qwen', type: 'openai', base_url: 'https://dashscope.aliyuncs.com/compatible-mode', api_key: '' },
    { name: 'Ollama (本地)', type: 'ollama', base_url: 'http://localhost:11434', api_key: '' },
    { name: '网页大模型 (Chat2API)', type: 'webchat', base_url: 'http://127.0.0.1:8080', api_key: '' },
  ]
```

同时修改 enabled 默认值（L175），让 webchat 默认启用：

```typescript
      enabled: def.type === 'ollama' || def.type === 'webchat', // 默认启用本地与网页大模型
```

- [ ] **步骤 5: 运行 typecheck**

```bash
cd "d:\ZX code"
npm run typecheck
```

预期：通过。

- [ ] **步骤 6: 提交**

```bash
cd "d:\ZX code"
git add src/main/providers/webchat.provider.ts src/main/providers/index.ts src/shared/types/model.ts
git commit -m "feat(webchat): 新增 WebChatProvider 桥接到内置 Chat2API，复用 OpenAI 兼容协议"
```

---

## Task 8: 创建 chat2api 共享类型 + IPC 通道

定义 Chat2API 前后端共享类型，注册 accounts/oauth/proxy IPC 通道。

**文件:**
- 新建: `src/shared/types/chat2api.ts`
- 新建: `src/main/ipc/chat2api.ipc.ts`
- 修改: `src/main/ipc/index.ts`
- 修改: `src/preload/api.ts`

- [ ] **步骤 1: 创建 chat2api 共享类型**

创建 `d:\ZX code\src\shared\types\chat2api.ts`：

```typescript
/** Chat2API Provider 类型（网页大模型供应商） */
export type Chat2ApiProviderType =
  | 'deepseek'
  | 'glm'
  | 'kimi'
  | 'mimo'
  | 'minimax'
  | 'perplexity'
  | 'qwen'
  | 'qwen-ai'
  | 'zai'

/** Chat2API 账户状态 */
export interface Chat2ApiAccount {
  id: string
  providerId: string
  name: string
  status: 'active' | 'inactive' | 'expired' | 'error'
  requestCount?: number
  dailyLimit?: number
  todayUsed?: number
  lastUsed?: number
  createdAt: number
  updatedAt: number
}

/** Chat2API Provider（内置供应商配置） */
export interface Chat2ApiProvider {
  id: string
  name: string
  type: 'builtin' | 'custom'
  enabled: boolean
  supportedModels?: string[]
  status?: {
    online: boolean
    latency?: number
    lastCheck?: number
  }
}

/** OAuth 登录选项 */
export interface OAuthLoginOptions {
  providerId: string
  providerType: Chat2ApiProviderType
  timeout?: number
  proxyMode?: 'system' | 'none'
}

/** OAuth 登录结果 */
export interface OAuthLoginResult {
  success: boolean
  providerId: string
  providerType: Chat2ApiProviderType
  account?: Chat2ApiAccount
  error?: string
}

/** Token 登录参数 */
export interface TokenLoginParams {
  providerId: string
  providerType: Chat2ApiProviderType
  token: string
  realUserID?: string // MiniMax 需要
  mimoUserId?: string // Mimo 需要
  mimoPhToken?: string // Mimo 需要
}

/** 代理服务器状态 */
export interface ProxyStatus {
  running: boolean
  port: number
  host: string
  uptime?: number
  totalRequests?: number
  successRequests?: number
  failedRequests?: number
}

/** 拉取网页模型结果 */
export interface FetchWebModelsResult {
  ok: boolean
  models: Array<{
    id: string
    name: string
    providerId: string
    providerName: string
  }>
  error?: string
}
```

- [ ] **步骤 2: 创建 chat2api.ipc.ts**

创建 `d:\ZX code\src\main\ipc\chat2api.ipc.ts`：

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { storeManager, oauthManager, proxyServer } from '../chat2api'
import { isChat2ApiRunning, getChat2ApiBaseUrl } from '../chat2api'
import { clearProviderCache } from '../providers'
import * as providerRepo from '../database/repositories/provider.repo'
import { logger } from '../services/logger.service'
import type {
  Chat2ApiAccount,
  Chat2ApiProvider,
  OAuthLoginOptions,
  OAuthLoginResult,
  TokenLoginParams,
  ProxyStatus,
  FetchWebModelsResult,
} from '@shared/types/chat2api'

/**
 * 注册 Chat2API 相关 IPC 通道。
 * 包括：accounts（账户管理）、oauth（登录）、proxy（代理状态）、models（模型同步）
 */
export function registerChat2ApiIpc(mainWindow: BrowserWindow): void {
  // ===== 账户管理 =====

  ipcMain.handle('chat2api:accounts:list', (_e, providerId?: string) => {
    return providerId
      ? storeManager.getAccountsByProviderId(providerId)
      : storeManager.getAccounts()
  })

  ipcMain.handle('chat2api:accounts:delete', (_e, accountId: string) => {
    const ok = storeManager.deleteAccount(accountId)
    return ok
  })

  ipcMain.handle('chat2api:accounts:update', (_e, accountId: string, updates: Partial<Chat2ApiAccount>) => {
    return storeManager.updateAccount(accountId, updates)
  })

  // ===== Provider（Chat2API 内置供应商）管理 =====

  ipcMain.handle('chat2api:providers:list', () => {
    return storeManager.getProviders()
  })

  ipcMain.handle('chat2api:providers:update', (_e, providerId: string, updates: Partial<Chat2ApiProvider>) => {
    return storeManager.updateProvider(providerId, updates)
  })

  // ===== OAuth 登录 =====

  ipcMain.handle('chat2api:oauth:startLogin', async (_e, options: OAuthLoginOptions): Promise<OAuthLoginResult> => {
    try {
      const result = await oauthManager.startLogin(options)
      return result
    } catch (err) {
      logger.error('[chat2api:oauth] 登录失败', err as Error)
      return {
        success: false,
        providerId: options.providerId,
        providerType: options.providerType,
        error: (err as Error).message,
      }
    }
  })

  ipcMain.handle('chat2api:oauth:loginWithToken', async (_e, params: TokenLoginParams): Promise<OAuthLoginResult> => {
    try {
      const result = await oauthManager.loginWithToken(
        params.providerId,
        params.providerType,
        params.token,
        params.realUserID,
        params.mimoUserId,
        params.mimoPhToken,
      )
      return result
    } catch (err) {
      logger.error('[chat2api:oauth] Token 登录失败', err as Error)
      return {
        success: false,
        providerId: params.providerId,
        providerType: params.providerType,
        error: (err as Error).message,
      }
    }
  })

  ipcMain.handle('chat2api:oauth:startInAppLogin', async (_e, options: OAuthLoginOptions): Promise<OAuthLoginResult> => {
    try {
      const result = await oauthManager.startInAppLogin(
        options.providerId,
        options.providerType,
        options.timeout,
        options.proxyMode,
      )
      return result
    } catch (err) {
      logger.error('[chat2api:oauth] 应用内登录失败', err as Error)
      return {
        success: false,
        providerId: options.providerId,
        providerType: options.providerType,
        error: (err as Error).message,
      }
    }
  })

  ipcMain.handle('chat2api:oauth:cancelLogin', async () => {
    await oauthManager.cancelLogin()
    oauthManager.cancelInAppLogin()
    return true
  })

  ipcMain.handle('chat2api:oauth:validateToken', async (_e, providerId: string, providerType: string, credentials: Record<string, string>) => {
    return oauthManager.validateToken(providerId, providerType as any, credentials)
  })

  // ===== 代理服务器状态 =====

  ipcMain.handle('chat2api:proxy:status', (): ProxyStatus => {
    const config = storeManager.getConfig()
    return {
      running: isChat2ApiRunning(),
      port: config.proxyPort || 8080,
      host: config.proxyHost || '127.0.0.1',
    }
  })

  ipcMain.handle('chat2api:proxy:restart', async () => {
    try {
      const config = storeManager.getConfig()
      await proxyServer.restart(config.proxyPort, config.proxyHost)
      return true
    } catch (err) {
      logger.error('[chat2api:proxy] 重启失败', err as Error)
      return false
    }
  })

  // ===== 模型同步：拉取 Chat2API 可用模型并写入 SQLite =====

  ipcMain.handle('chat2api:models:fetch', async (): Promise<FetchWebModelsResult> => {
    if (!isChat2ApiRunning()) {
      return { ok: false, models: [], error: 'Chat2API 引擎未运行' }
    }
    try {
      const baseUrl = getChat2ApiBaseUrl()
      const resp = await fetch(`${baseUrl}/v1/models`)
      if (!resp.ok) {
        return { ok: false, models: [], error: `HTTP ${resp.status}` }
      }
      const data = await resp.json() as { data?: Array<{ id: string; owned_by?: string }> }
      const models = (data.data || []).map((m) => ({
        id: m.id,
        name: m.id,
        providerId: m.owned_by || 'webchat',
        providerName: m.owned_by || '网页大模型',
      }))

      // 同步到 SQLite：找到 webchat 类型的 provider，更新其 models
      const providers = providerRepo.findAll()
      const webchatProvider = providers.find((p) => p.type === 'webchat')
      if (webchatProvider) {
        providerRepo.removeModels(webchatProvider.id)
        for (const m of models) {
          providerRepo.addModel({
            provider_id: webchatProvider.id,
            model_id: m.id,
            name: m.name,
            context_length: 8192,
            supports_tools: true,
            supports_vision: false,
            description: `网页大模型 ${m.providerName}`,
          })
        }
        clearProviderCache(webchatProvider.id)
        logger.info(`[chat2api] 已同步 ${models.length} 个网页模型到数据库`)
      }

      return { ok: true, models }
    } catch (err) {
      logger.error('[chat2api:models] 拉取失败', err as Error)
      return { ok: false, models: [], error: (err as Error).message }
    }
  })
}
```

- [ ] **步骤 3: 修改 ipc/index.ts 注册 chat2api IPC**

打开 `d:\ZX code\src\main\ipc\index.ts`，在 import 块添加：

```typescript
import { registerChat2ApiIpc } from './chat2api.ipc'
```

找到 `registerIpcHandlers()` 函数，在末尾（其他 register 调用之后）添加：

```typescript
  registerChat2ApiIpc(mainWindow)
```

注意：`registerIpcHandlers` 需要接收 `mainWindow` 参数。检查现有签名，若未接收则修改为 `export function registerIpcHandlers(mainWindow: BrowserWindow): void`，并在 `src/main/index.ts` 调用处传入 `getMainWindow()`。

- [ ] **步骤 4: 修改 preload/api.ts 暴露 chat2api 命名空间**

打开 `d:\ZX code\src\preload\api.ts`，在 api 对象中添加 chat2api 命名空间：

```typescript
  chat2api: {
    // 账户
    listAccounts: (providerId?: string) => ipcRenderer.invoke('chat2api:accounts:list', providerId),
    deleteAccount: (accountId: string) => ipcRenderer.invoke('chat2api:accounts:delete', accountId),
    updateAccount: (accountId: string, updates: any) => ipcRenderer.invoke('chat2api:accounts:update', accountId, updates),
    // Provider
    listProviders: () => ipcRenderer.invoke('chat2api:providers:list'),
    updateProvider: (providerId: string, updates: any) => ipcRenderer.invoke('chat2api:providers:update', providerId, updates),
    // OAuth
    startLogin: (options: any) => ipcRenderer.invoke('chat2api:oauth:startLogin', options),
    loginWithToken: (params: any) => ipcRenderer.invoke('chat2api:oauth:loginWithToken', params),
    startInAppLogin: (options: any) => ipcRenderer.invoke('chat2api:oauth:startInAppLogin', options),
    cancelLogin: () => ipcRenderer.invoke('chat2api:oauth:cancelLogin'),
    validateToken: (providerId: string, providerType: string, credentials: any) =>
      ipcRenderer.invoke('chat2api:oauth:validateToken', providerId, providerType, credentials),
    // 代理状态
    getProxyStatus: () => ipcRenderer.invoke('chat2api:proxy:status'),
    restartProxy: () => ipcRenderer.invoke('chat2api:proxy:restart'),
    // 模型同步
    fetchModels: () => ipcRenderer.invoke('chat2api:models:fetch'),
    // OAuth 进度事件
    onOAuthProgress: (callback: (event: any) => void) => {
      ipcRenderer.on('oauth:progress', (_e, event) => callback(event))
    },
  },
```

- [ ] **步骤 5: 修改 shared/types/ipc.ts 添加 Chat2ApiApi 类型**

打开 `d:\ZX code\src\shared\types\ipc.ts`，在文件末尾添加 Chat2ApiApi 接口，并合并到主 IpcApi 接口：

```typescript
export interface Chat2ApiApi {
  listAccounts(providerId?: string): Promise<any[]>
  deleteAccount(accountId: string): Promise<boolean>
  updateAccount(accountId: string, updates: any): Promise<any>
  listProviders(): Promise<any[]>
  updateProvider(providerId: string, updates: any): Promise<any>
  startLogin(options: any): Promise<any>
  loginWithToken(params: any): Promise<any>
  startInAppLogin(options: any): Promise<any>
  cancelLogin(): Promise<boolean>
  validateToken(providerId: string, providerType: string, credentials: any): Promise<any>
  getProxyStatus(): Promise<any>
  restartProxy(): Promise<boolean>
  fetchModels(): Promise<any>
  onOAuthProgress(callback: (event: any) => void): void
}
```

在 `IpcApi` 接口中添加 `chat2api: Chat2ApiApi`。

- [ ] **步骤 6: 运行 typecheck**

```bash
cd "d:\ZX code"
npm run typecheck
```

预期：通过。

- [ ] **步骤 7: 提交**

```bash
cd "d:\ZX code"
git add src/shared/types/chat2api.ts src/shared/types/ipc.ts src/main/ipc/chat2api.ipc.ts src/main/ipc/index.ts src/preload/api.ts
git commit -m "feat(chat2api): 新增共享类型与 IPC 通道（accounts/oauth/proxy/models）"
```

---

## Task 9: 创建网页大模型设置界面（WebChatSettings）

新建设置页 tab，展示 Chat2API 内置 Provider 列表、账户登录/管理、代理状态。

**文件:**
- 新建: `src/renderer/src/stores/chat2apiStore.ts`
- 新建: `src/renderer/src/components/settings/WebChatSettings.tsx`
- 修改: `src/renderer/src/pages/SettingsPage.tsx`

- [ ] **步骤 1: 创建 chat2apiStore**

创建 `d:\ZX code\src\renderer\src\stores\chat2apiStore.ts`：

```typescript
import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import { logger } from '@/utils/logger'

interface Chat2ApiAccount {
  id: string
  providerId: string
  name: string
  status: 'active' | 'inactive' | 'expired' | 'error'
  requestCount?: number
  todayUsed?: number
}

interface Chat2ApiProvider {
  id: string
  name: string
  type: 'builtin' | 'custom'
  enabled: boolean
  supportedModels?: string[]
}

interface ProxyStatus {
  running: boolean
  port: number
  host: string
}

interface Chat2ApiState {
  providers: Chat2ApiProvider[]
  accounts: Chat2ApiAccount[]
  proxyStatus: ProxyStatus | null
  loading: boolean
  loginInProgress: boolean
  loginProviderId: string | null
  error: string | null

  loadProviders: () => Promise<void>
  loadAccounts: () => Promise<void>
  loadProxyStatus: () => Promise<void>
  startLogin: (providerId: string, providerType: string) => Promise<boolean>
  startInAppLogin: (providerId: string, providerType: string) => Promise<boolean>
  cancelLogin: () => Promise<void>
  deleteAccount: (accountId: string) => Promise<void>
  fetchModels: () => Promise<number>
  restartProxy: () => Promise<void>
}

export const useChat2ApiStore = create<Chat2ApiState>((set, get) => ({
  providers: [],
  accounts: [],
  proxyStatus: null,
  loading: false,
  loginInProgress: false,
  loginProviderId: null,
  error: null,

  loadProviders: async () => {
    try {
      const providers = await ipc.chat2api.listProviders()
      set({ providers })
    } catch (err) {
      logger.error('加载 Chat2API Provider 失败', err as Error)
      set({ error: (err as Error).message })
    }
  },

  loadAccounts: async () => {
    try {
      const accounts = await ipc.chat2api.listAccounts()
      set({ accounts })
    } catch (err) {
      logger.error('加载账户失败', err as Error)
    }
  },

  loadProxyStatus: async () => {
    try {
      const status = await ipc.chat2api.getProxyStatus()
      set({ proxyStatus: status })
    } catch (err) {
      logger.error('加载代理状态失败', err as Error)
    }
  },

  startLogin: async (providerId, providerType) => {
    set({ loginInProgress: true, loginProviderId: providerId, error: null })
    try {
      const result = await ipc.chat2api.startLogin({ providerId, providerType })
      if (result.success) {
        await get().loadAccounts()
        await get().fetchModels()
      }
      return result.success
    } catch (err) {
      set({ error: (err as Error).message })
      return false
    } finally {
      set({ loginInProgress: false, loginProviderId: null })
    }
  },

  startInAppLogin: async (providerId, providerType) => {
    set({ loginInProgress: true, loginProviderId: providerId, error: null })
    try {
      const result = await ipc.chat2api.startInAppLogin({ providerId, providerType })
      if (result.success) {
        await get().loadAccounts()
        await get().fetchModels()
      }
      return result.success
    } catch (err) {
      set({ error: (err as Error).message })
      return false
    } finally {
      set({ loginInProgress: false, loginProviderId: null })
    }
  },

  cancelLogin: async () => {
    await ipc.chat2api.cancelLogin()
    set({ loginInProgress: false, loginProviderId: null })
  },

  deleteAccount: async (accountId) => {
    try {
      await ipc.chat2api.deleteAccount(accountId)
      await get().loadAccounts()
      await get().fetchModels()
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  fetchModels: async () => {
    const result = await ipc.chat2api.fetchModels()
    if (!result.ok) {
      set({ error: result.error || '拉取模型失败' })
    }
    return result.models?.length || 0
  },

  restartProxy: async () => {
    await ipc.chat2api.restartProxy()
    await get().loadProxyStatus()
  },
}))
```

- [ ] **步骤 2: 创建 WebChatSettings 组件**

创建 `d:\ZX code\src\renderer\src\components\settings\WebChatSettings.tsx`：

```typescript
import { memo, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat2ApiStore } from '@/stores/chat2apiStore'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  glm: '智谱 GLM',
  kimi: 'Kimi (月之暗面)',
  mimo: '小米 MiMo',
  minimax: 'MiniMax',
  perplexity: 'Perplexity',
  qwen: '通义千问 (国内)',
  'qwen-ai': 'Qwen (国际)',
  zai: 'Z.ai',
}

const PROVIDER_ORDER = ['deepseek', 'glm', 'kimi', 'qwen', 'qwen-ai', 'minimax', 'mimo', 'perplexity', 'zai']

function ProviderCard({ providerId, providerName }: { providerId: string; providerName: string }) {
  const accounts = useChat2ApiStore((s) => s.accounts)
  const startInAppLogin = useChat2ApiStore((s) => s.startInAppLogin)
  const deleteAccount = useChat2ApiStore((s) => s.deleteAccount)
  const loginInProgress = useChat2ApiStore((s) => s.loginInProgress)
  const loginProviderId = useChat2ApiStore((s) => s.loginProviderId)

  const providerAccounts = accounts.filter((a) => a.providerId === providerId)
  const isLoggingIn = loginInProgress && loginProviderId === providerId

  const handleLogin = async () => {
    await startInAppLogin(providerId, providerId)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="surface-3d rounded-lg border border-border-default p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{providerName}</h3>
          {providerAccounts.length > 0 && (
            <span className="rounded-full bg-accent-green/15 px-2 py-0.5 text-[10px] font-medium text-accent-green">
              {providerAccounts.length} 个账户
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogin}
          disabled={isLoggingIn}
          className={cn(
            'btn-metallic inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium',
            isLoggingIn && 'opacity-50 cursor-not-allowed',
          )}
        >
          {isLoggingIn ? (
            <>
              <span className="animate-pulse-soft">●</span>
              <span>登录中...</span>
            </>
          ) : (
            <span>应用内登录</span>
          )}
        </button>
      </div>

      <AnimatePresence>
        {providerAccounts.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 border-t border-border-default pt-2">
              {providerAccounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between rounded-md bg-hover-surface px-2.5 py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        account.status === 'active' ? 'bg-accent-green' : 'bg-accent-red',
                      )}
                    />
                    <span className="text-xs text-text-secondary">{account.name}</span>
                    {account.todayUsed != null && (
                      <span className="text-[10px] text-text-tertiary tabular-nums">
                        今日 {account.todayUsed} 次
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteAccount(account.id)}
                    className="text-[10px] text-text-tertiary transition-smooth-fast hover:text-accent-red"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ProxyStatusBar() {
  const proxyStatus = useChat2ApiStore((s) => s.proxyStatus)
  const loadProxyStatus = useChat2ApiStore((s) => s.loadProxyStatus)
  const restartProxy = useChat2ApiStore((s) => s.restartProxy)

  useEffect(() => {
    loadProxyStatus()
  }, [loadProxyStatus])

  if (!proxyStatus) return null

  return (
    <div className="surface-3d mb-4 flex items-center justify-between rounded-lg border border-border-default px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            proxyStatus.running ? 'bg-accent-green animate-pulse-soft' : 'bg-accent-red',
          )}
        />
        <div>
          <div className="text-xs font-semibold text-text-primary">
            Chat2API 代理服务器 {proxyStatus.running ? '运行中' : '已停止'}
          </div>
          <div className="text-[10px] text-text-tertiary tabular-nums">
            {proxyStatus.host}:{proxyStatus.port}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => restartProxy()}
        className="btn-metallic inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium"
      >
        重启
      </button>
    </div>
  )
}

export const WebChatSettings = memo(function WebChatSettings() {
  const loadProviders = useChat2ApiStore((s) => s.loadProviders)
  const loadAccounts = useChat2ApiStore((s) => s.loadAccounts)
  const fetchModels = useChat2ApiStore((s) => s.fetchModels)
  const error = useChat2ApiStore((s) => s.error)
  const [syncing, setSyncing] = useState(false)
  const [syncCount, setSyncCount] = useState<number | null>(null)

  useEffect(() => {
    loadProviders()
    loadAccounts()
  }, [loadProviders, loadAccounts])

  const handleSyncModels = async () => {
    setSyncing(true)
    const count = await fetchModels()
    setSyncCount(count)
    setSyncing(false)
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-text-primary">网页大模型</h2>
        <p className="mt-1 text-xs text-text-secondary">
          通过 Chat2API 引擎接入 DeepSeek、GLM、Kimi、Qwen、MiniMax 等网页版大模型。登录账户后即可在对话中直接使用。
        </p>
      </div>

      <ProxyStatusBar />

      {error && (
        <div className="rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">供应商账户</h3>
        <button
          type="button"
          onClick={handleSyncModels}
          disabled={syncing}
          className="btn-metallic inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium"
        >
          {syncing ? '同步中...' : '同步模型列表'}
        </button>
      </div>

      {syncCount !== null && syncCount > 0 && (
        <div className="rounded-md border border-accent-green/30 bg-accent-green/10 px-3 py-2 text-xs text-accent-green">
          已同步 {syncCount} 个网页模型，可在对话页模型选择器中使用
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PROVIDER_ORDER.map((pid) => (
          <ProviderCard key={pid} providerId={pid} providerName={PROVIDER_LABELS[pid] || pid} />
        ))}
      </div>
    </div>
  )
})
```

- [ ] **步骤 3: 修改 SettingsPage 新增 webchat tab**

打开 `d:\ZX code\src\renderer\src\pages\SettingsPage.tsx`，找到 tab 列表定义（约 L19-28），添加 webchat tab：

```typescript
  const tabs = [
    // ... 现有 tabs
    { id: 'webchat', label: '网页大模型', icon: <GlobeIcon /> },
    // ...
  ]
```

在渲染区域（约 L99 附近 `case 'model':`），添加 webchat case：

```typescript
        {activeTab === 'webchat' && <WebChatSettings />}
```

在文件顶部添加 import：

```typescript
import { WebChatSettings } from '@/components/settings/WebChatSettings'
```

确保 tab 列表顺序合理（webchat 放在 model 之后）。

- [ ] **步骤 4: 运行 typecheck**

```bash
cd "d:\ZX code"
npm run typecheck:web
```

- [ ] **步骤 5: 提交**

```bash
cd "d:\ZX code"
git add src/renderer/src/stores/chat2apiStore.ts src/renderer/src/components/settings/WebChatSettings.tsx src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(webchat): 新增网页大模型设置页（账户登录/管理、代理状态、模型同步）"
```

---

## Task 10: ModelSelector 接入网页模型 + 对话验证

确保 ModelSelector 能展示网页模型，并验证端到端对话流程。

**文件:**
- 修改: `src/renderer/src/components/chat/ModelSelector.tsx`

- [ ] **步骤 1: 修改 ModelSelector 分组展示网页模型**

打开 `d:\ZX code\src\renderer\src\components\chat\ModelSelector.tsx`，找到分组逻辑（约 L75-92）。现有逻辑已按 provider 分组，网页模型的 `provider` 字段为 'webchat'，会自动归入一组。

优化分组显示名称，在分组渲染处添加：

```typescript
const providerGroupName = (provider: string) => {
  if (provider === 'webchat') return '网页大模型'
  return provider
}
```

确保网页模型在选择器中有视觉标识（如 Globe 图标），可在模型项渲染处添加：

```typescript
{model.provider === 'webchat' && (
  <span className="text-[9px] text-accent-blue">网页</span>
)}
```

- [ ] **步骤 2: 运行 typecheck**

```bash
cd "d:\ZX code"
npm run typecheck
```

- [ ] **步骤 3: 端到端验证**

启动应用：

```bash
cd "d:\ZX code"
npm run dev
```

验证步骤：
1. 打开设置页 → "网页大模型" tab
2. 确认代理服务器状态为"运行中"
3. 点击"应用内登录"任一 Provider（如 DeepSeek），完成登录
4. 点击"同步模型列表"，确认提示同步成功
5. 回到对话页，打开 ModelSelector，确认出现"网页大模型"分组及模型
6. 选择一个网页模型，发送消息，确认能收到流式回复

- [ ] **步骤 4: 提交**

```bash
cd "d:\ZX code"
git add src/renderer/src/components/chat/ModelSelector.tsx
git commit -m "feat(webchat): ModelSelector 展示网页模型分组，端到端验证通过"
```

---

## Task 11: 集成验证 + 文档更新

**文件:**
- 修改: `src/main/chat2api/README.md`（记录适配修改）

- [ ] **步骤 1: 完整 typecheck**

```bash
cd "d:\ZX code"
npm run typecheck
```

预期：通过，无错误。

- [ ] **步骤 2: 启动应用全功能验证**

```bash
cd "d:\ZX code"
npm run dev
```

验证清单：
- [ ] 应用正常启动，日志显示 Chat2API 引擎已启动
- [ ] 设置页"网页大模型"tab 可见，代理状态运行中
- [ ] 至少一个 Provider 登录成功
- [ ] 同步模型列表成功，对话页 ModelSelector 出现网页模型
- [ ] 使用网页模型发送消息，收到流式回复
- [ ] 工具调用（read_file 等）在网页模型下正常工作
- [ ] ChangesPanel 面板正常显示工具调用
- [ ] 原有 API Provider（OpenAI/DeepSeek API）仍正常工作

- [ ] **步骤 3: 更新 chat2api/README.md 记录适配修改**

打开 `d:\ZX code\src\main\chat2api\README.md`，在"适配修改记录"部分添加：

```markdown
## 适配修改记录

### store/store.ts
- electron-store@10（ESM 动态 import）→ @8（CJS 静态 import）
- 存储路径：`name: 'chat2api'`, `cwd: 'zx-code'`（~/.zx-code/chat2api.json）
- requestLogs/appLogs 未移植，用 stub 替代

### lib/challenge.ts
- WASM 路径：`process.resourcesPath/wasm/`（packaged）、`app.getAppPath()/resources/wasm/`（dev）

### 所有模块
- logger 引用：`../logger` → `../../services/logger.service`
- 窗口管理：保持 mainWindow 注入式，不直接引用 window 模块
```

- [ ] **步骤 4: 提交**

```bash
cd "d:\ZX code"
git add src/main/chat2api/README.md
git commit -m "docs(chat2api): 更新适配修改记录，Chat2API 移植完成"
```

---

## Phase 5A 完成标准

- [ ] ZX-Code 许可证变更为 GPL-3.0
- [ ] Chat2API 核心模块（proxy/oauth/store/adapters/lib）移植完成
- [ ] 主进程启动时自动启动 Koa 代理服务器（127.0.0.1:8080）
- [ ] WebChatProvider 桥接正常，OpenAI 兼容协议
- [ ] 设置页"网页大模型"tab：账户登录/管理、代理状态、模型同步
- [ ] ModelSelector 展示网页模型，对话可正常使用
- [ ] typecheck 通过，应用正常运行

---

# Phase 5B：Skill 系统（后续计划大纲）

> Chat2API 移植完成并验证后，进入 Skill 系统实现。以下为大纲，详细 task-by-task 计划在 Phase 5A 完成后展开。

## 目标
从对话中提取可复用的 Skill（工具调用序列 + 上下文模式），建立 Skill 库，支持 Skill 复用与组合。

## 架构要点
- **Skill 存储**：SQLite 新增 `skills` 表（id, name, description, trigger_pattern, tool_sequence, created_at, usage_count）
- **Skill 提取**：对话结束后，分析连续工具调用序列，识别可复用模式
- **Skill 复用**：在 Agent engine 中，匹配 trigger_pattern 后注入 Skill 的 tool_sequence
- **Skill 管理 UI**：设置页新增"Skill 库"tab，展示/编辑/删除/启用 Skill

## 主要 Task（待细化）
1. 数据库迁移：新增 skills 表
2. Skill 提取引擎：分析对话 metadata.tool_calls，生成 Skill 候选
3. Skill 匹配与注入：在 agent/engine.ts 中集成
4. Skill 管理 IPC + UI
5. Skill 组合（多个 Skill 串联）

---

# Phase 5C：赫尔墨斯自动进化（暂缓）

> 用户已决定暂缓。待 Chat2API + Skill 系统稳定后再评估。

---

## 自检清单

**Spec 覆盖：**
- [x] Chat2API 引擎内置 → Task 1-6（移植 + 启动）
- [x] 网页大模型接入（DeepSeek/GLM/Kimi/Qwen/MiniMax）→ Task 5（9 个 adapters）
- [x] 独立设置界面 → Task 9（WebChatSettings）
- [x] 对话列表直接使用网页大模型 → Task 7 + 10（WebChatProvider + ModelSelector）
- [x] AccessToken 管理 → Task 3 + 8 + 9（oauth + IPC + UI）
- [x] Skill 系统 → Phase 5B 大纲
- [x] 赫尔墨斯 → 暂缓说明
- [x] 验证项目正常运行 → Task 11

**风险提示：**
1. **GPL-3.0 不可逆**：移植后 ZX-Code 永久受 GPL-3.0 约束
2. **electron-store 版本差异**：Chat2API 用 @10（ESM），ZX-Code 用 @8（CJS），Task 2 已适配
3. **WASM 打包**：需确认 electron-builder extraResources 配置在 packaged 环境正确加载
4. **端口冲突**：8080 端口可能被占用，需在设置中支持修改
5. **Chat2API 升级**：模块独立存放便于后续合并上游更新
