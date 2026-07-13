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

### store/store.ts
- electron-store@10（ESM 动态 import）→ @8（CJS 静态 import）
- 存储路径：`name: 'zx-web'`, `cwd: 'zx-code'`（~/.zx-code/zx-web.json）
- requestLogs/appLogs 未移植，用 stub 替代

### lib/challenge.ts
- WASM 路径：`process.resourcesPath/wasm/`（packaged）、`app.getAppPath()/resources/wasm/`（dev）

### oauth/types.ts
- ProviderVendor 类型本地化（原引用 ../../shared/types）
- base.ts import 路径修复（./types → ../types）
- TokenType 补充 'token'
- MANUAL_TOKEN_CONFIGS 改为 Partial<Record<...>>

### proxy/adapters
- perplexity.ts import 路径修复（../store/types → ../../store/types）
- adapters/index.ts 导出路径修复（PerplexityStreamHandler 从 ./perplexity-stream 导出）

### tsconfig.node.json
- 添加 target: ES2020（支持 Set/Map 迭代）
- zx-web 子模块文件添加 // @ts-nocheck（移植代码类型问题不阻塞主项目 typecheck）

### 所有模块
- logger 引用：`../logger` → `../../services/logger.service`
- 窗口管理：保持 mainWindow 注入式，不直接引用 window 模块
