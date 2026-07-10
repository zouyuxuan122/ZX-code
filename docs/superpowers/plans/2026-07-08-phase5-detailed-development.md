# Phase 5: 工具系统增强 — 详细开发文档

> 基于 opencode 仓库（`https://github.com/anomalyco/opencode`，dev 分支）的工具实现，将高级工具能力移植到 ZX-Code。
>
> 创建日期：2026-07-08
> 关联计划：`docs/superpowers/plans/2026-07-08-opencode-integration-and-fixes.md`

---

## 目录

1. [总体概述](#1-总体概述)
2. [当前实现缺陷分析](#2-当前实现缺陷分析)
3. [Task 5.1: 文件编辑工具 — 多策略模糊匹配](#3-task-51-文件编辑工具--多策略模糊匹配)
4. [Task 5.2: 文件读取工具 — 流式读取 + 二进制检测](#4-task-52-文件读取工具--流式读取--二进制检测)
5. [Task 5.3: 命令执行工具 — 权限改进](#5-task-53-命令执行工具--权限改进)
6. [Task 5.4: Bash 工具移植](#6-task-54-bash-工具移植)
7. [Task 5.5: 工具描述文件系统](#7-task-55-工具描述文件系统)
8. [依赖关系与执行顺序](#8-依赖关系与执行顺序)
9. [风险与注意事项](#9-风险与注意事项)
10. [验收标准汇总](#10-验收标准汇总)

---

## 1. 总体概述

### 1.1 目标

将 opencode 的高级工具能力移植到 ZX-Code，提升 Agent 工具调用的：

- **编辑成功率**：从当前"严格精确匹配"升级为"多策略模糊匹配"，容忍空白/缩进/行尾差异
- **读取健壮性**：支持大文件流式读取、二进制文件检测、图片/PDF 作为附件返回
- **命令权限体验**：权限请求展示人类可理解的命令名，移除工具内部双重权限检查
- **Bash 能力**：移植 opencode 的 bash 工具（如存在）
- **工具描述**：每个工具配备独立的 `.txt` 描述文件，提供详细的 usage 说明

### 1.2 opencode 架构与 ZX-Code 差异

| 维度 | opencode | ZX-Code |
|------|----------|---------|
| 运行时框架 | Effect（函数式效应系统） | 原生 async/await |
| 工具定义 | `Tool.define` + Schema | `BuiltinTool` 接口 |
| 权限 | `ctx.ask({ permission, patterns, always })` | `checkPermission` + `onToolCall` 回调 |
| LSP 集成 | 内置 LSP.Service | 无 LSP 集成（Phase 5 暂不引入） |
| 文件系统 | FSUtil.Service（Effect 封装） | 原生 `fs/promises` |
| 信号量 | `Semaphore.makeUnsafe(1)` | 无（需新增） |

**移植策略**：剥离 Effect 依赖，保留核心算法逻辑（Replacer 策略、二进制检测、流式读取），适配到 ZX-Code 的 `BuiltinTool` 接口和 async/await 风格。

---

## 2. 当前实现缺陷分析

### 2.1 edit.tool.ts 缺陷

**当前实现**（[src/main/tools/builtin/edit.tool.ts](file:///d:/ZX%20code/src/main/tools/builtin/edit.tool.ts)）：

```typescript
// 统计 oldString 出现次数
let count = 0
let idx = oldContent.indexOf(oldString)
while (idx !== -1) {
  count++
  idx = oldContent.indexOf(oldString, idx + oldString.length)
}

if (count === 0) {
  return { content: `未在文件中找到要替换的原文`, is_error: true }
}
if (count > 1) {
  return { content: `原文在文件中出现 ${count} 次`, is_error: true }
}

// 执行精确替换（仅替换第一处）
const newContent = oldContent.replace(oldString, newString)
```

**问题**：
1. **严格精确匹配**：缩进/空白/行尾差异（`\r\n` vs `\n`）导致匹配失败
2. **无模糊回退**：AI 提供的 oldString 有轻微差异时直接报错，无法编辑
3. **无并发锁**：多个工具调用同时编辑同一文件可能产生竞态
4. **无 replaceAll 支持**：无法批量替换
5. **无 LSP 诊断反馈**：编辑后不检查语法错误

### 2.2 read_file.tool.ts 缺陷

**当前实现**（[src/main/tools/builtin/read_file.tool.ts](file:///d:/ZX%20code/src/main/tools/builtin/read_file.tool.ts)）：

```typescript
const content = await fs.readFile(safe, { encoding })
return { tool_call_id: '', content, is_error: false }
```

**问题**：
1. **一次性读取全文件**：大文件（>1MB）导致内存膨胀和 token 爆炸
2. **无二进制检测**：读取二进制文件（.exe/.png）返回乱码
3. **无图片/PDF 附件支持**：无法将图片作为视觉内容返回给多模态模型
4. **无行号前缀**：AI 难以引用具体行号
5. **无 offset/limit 分页**：无法读取文件的指定区段

### 2.3 run_command.tool.ts 缺陷

**当前实现**（[src/main/tools/builtin/run_command.tool.ts](file:///d:/ZX%20code/src/main/tools/builtin/run_command.tool.ts)）：

```typescript
// 简化处理：未开启自动授权时，返回需要用户授权的提示
if (!context.autoAccept) {
  return {
    content: '需要用户授权执行命令。请在工具审批对话框中确认后重试。',
    is_error: true,
  }
}
```

**问题**：
1. **双重权限检查**：工具内部检查 `autoAccept`，agent engine 也检查 `onToolCall`，逻辑重复
2. **未开启 autoAccept 时直接报错**：不触发审批流程，Agent 无法继续
3. **权限请求不展示命令名**：审批对话框只显示 `run_command`，不显示具体命令
4. **无命令前缀解析**：无法按命令类型（git/npm/rm）分级授权

---

## 3. Task 5.1: 文件编辑工具 — 多策略模糊匹配

### 3.1 目标

移植 opencode edit.ts 的四种 Replacer 策略，将编辑成功率从"严格匹配"提升到"模糊容错匹配"。

### 3.2 opencode 实现分析

opencode 的 `replace()` 函数按顺序尝试四种 Replacer，每种 Replacer 是一个 Generator，yield 所有候选匹配位置：

```typescript
// opencode edit.ts 核心流程（简化）
function replace(content: string, find: string, replacement: string, replaceAll?: boolean): string {
  const replacers: Replacer[] = [
    SimpleReplacer,           // 1. 精确匹配
    LineTrimmedReplacer,      // 2. 行级 trim 匹配（容忍首尾空白）
    BlockAnchorReplacer,      // 3. 块锚点匹配（首行+末行锚定，中间行相似度）
    WhitespaceNormalizedReplacer, // 4. 空白归一化匹配
  ]

  for (const replacer of replacers) {
    const matches = [...replacer(content, find)]
    if (matches.length === 0) continue

    if (replaceAll) {
      // 替换所有匹配
      return content.split(find).join(replacement) // 简化版
    }

    if (matches.length === 1) {
      // 唯一匹配，直接替换
      return content.replace(matches[0], replacement)
    }

    // 多匹配：报错要求更多上下文
    throw new Error(`Found multiple matches, provide more context`)
  }

  throw new Error(`oldString not found in content`)
}
```

#### 四种 Replacer 策略详解

**策略 1: SimpleReplacer** — 精确匹配
```typescript
export const SimpleReplacer: Replacer = function* (_content, find) {
  yield find  // 直接 yield 原始 find 字符串
}
```
- 逻辑：返回原始 `find` 字符串，由调用方用 `String.indexOf` 查找
- 适用：AI 提供的 oldString 与文件内容完全一致

**策略 2: LineTrimmedReplacer** — 行级 trim 匹配
```typescript
export const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")
  // 逐行比较 trim() 后的内容
  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false; break
      }
    }
    if (matches) {
      // yield 文件中的原始文本（保留原始缩进）
      yield content.substring(matchStartIndex, matchEndIndex)
    }
  }
}
```
- 逻辑：逐行 `trim()` 后比较，匹配则 yield 文件中的**原始**文本（保留缩进）
- 适用：AI 提供的缩进与文件不一致（如 2空格 vs 4空格）

**策略 3: BlockAnchorReplacer** — 块锚点匹配
```typescript
export const BlockAnchorReplacer: Replacer = function* (content, find) {
  const searchLines = find.split("\n")
  if (searchLines.length < 3) return  // 至少 3 行才启用

  const firstLineSearch = searchLines[0].trim()
  const lastLineSearch = searchLines[searchLines.length - 1].trim()
  const maxLineDelta = Math.max(1, Math.floor(searchBlockSize * 0.25))

  // 收集首行+末行都匹配的候选位置
  const candidates = []
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i].trim() !== firstLineSearch) continue
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j].trim() === lastLineSearch) {
        if (Math.abs((j - i + 1) - searchBlockSize) <= maxLineDelta) {
          candidates.push({ startLine: i, endLine: j })
        }
        break
      }
    }
  }

  // 单候选：相似度 >= 0.65 即接受
  // 多候选：选最高相似度，需 >= 0.65
  // 相似度 = 中间行 Levenshtein 距离的归一化平均值
}
```
- 逻辑：用首行和末行作为锚点定位候选块，中间行用 Levenshtein 距离计算相似度
- 阈值：单候选 0.65，多候选 0.65
- 适用：AI 提供的代码块整体结构对，但中间行有细微差异

**策略 4: WhitespaceNormalizedReplacer** — 空白归一化匹配
```typescript
export const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const normalizeWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()
  const normalizedFind = normalizeWhitespace(find)

  // 单行匹配 + 多行匹配
  // 将所有空白字符（空格/Tab/换行）归一化为单个空格后比较
}
```
- 逻辑：将所有空白字符归一化为单个空格后比较
- 适用：空白分布差异极大（如代码被压缩/格式化）

### 3.3 移植方案

#### 3.3.1 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/tools/builtin/edit.replacer.ts` | **新建** | 四种 Replacer 策略实现 |
| `src/main/tools/builtin/edit.tool.ts` | 修改 | 集成 Replacer，添加 replaceAll、并发锁、行尾处理 |
| `src/renderer/src/__tests__/services/edit.replacer.test.ts` | **新建** | Replacer 单元测试 |

#### 3.3.2 edit.replacer.ts 设计

```typescript
// src/main/tools/builtin/edit.replacer.ts

/** Replacer 类型：Generator yield 文件中匹配的原始文本 */
export type Replacer = (content: string, find: string) => Generator<string, void, unknown>

/** Levenshtein 距离 */
function levenshtein(a: string, b: string): number { /* ... */ }

/** 策略 1: 精确匹配 */
export const SimpleReplacer: Replacer = function* (_content, find) {
  yield find
}

/** 策略 2: 行级 trim 匹配 */
export const LineTrimmedReplacer: Replacer = function* (content, find) { /* ... */ }

/** 策略 3: 块锚点匹配 */
export const BlockAnchorReplacer: Replacer = function* (content, find) { /* ... */ }

/** 策略 4: 空白归一化匹配 */
export const WhitespaceNormalizedReplacer: Replacer = function* (content, find) { /* ... */ }

/** 按顺序尝试所有 Replacer，返回首个成功的替换结果 */
export function replaceWithFuzzy(
  content: string,
  find: string,
  replacement: string,
  replaceAll?: boolean,
): { result: string; matchedReplacer: string } {
  const replacers: Array<{ name: string; fn: Replacer }> = [
    { name: 'Simple', fn: SimpleReplacer },
    { name: 'LineTrimmed', fn: LineTrimmedReplacer },
    { name: 'BlockAnchor', fn: BlockAnchorReplacer },
    { name: 'WhitespaceNormalized', fn: WhitespaceNormalizedReplacer },
  ]

  for (const { name, fn } of replacers) {
    const matches = [...fn(content, find)]
    if (matches.length === 0) continue

    if (replaceAll) {
      let result = content
      // 从后往前替换避免索引偏移
      for (const m of matches.reverse()) {
        result = result.replace(m, replacement)
      }
      return { result, matchedReplacer: name }
    }

    if (matches.length === 1) {
      return { result: content.replace(matches[0], replacement), matchedReplacer: name }
    }

    // 多匹配：尝试下一个 Replacer（更严格的）
    continue
  }

  throw new Error('未在文件中找到要替换的原文（已尝试 4 种模糊匹配策略）')
}
```

#### 3.3.3 edit.tool.ts 改造要点

```typescript
// 1. 添加行尾检测和归一化
function normalizeLineEndings(text: string): string {
  return text.replaceAll('\r\n', '\n')
}
function detectLineEnding(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n'
}
function convertToLineEnding(text: string, ending: '\n' | '\r\n'): string {
  return ending === '\n' ? text : text.replaceAll('\n', '\r\n')
}

// 2. 添加并发锁（简化的信号量）
const fileLocks = new Map<string, Promise<void>>()
async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(filePath) || Promise.resolve()
  let release: () => void
  const next = new Promise<void>((resolve) => { release = resolve })
  fileLocks.set(filePath, prev.then(() => next))
  await prev
  try {
    return await fn()
  } finally {
    release!()
    if (fileLocks.get(filePath) === next) {
      fileLocks.delete(filePath)
    }
  }
}

// 3. execute 主流程
async execute(args, context) {
  // ... 参数校验 ...
  return await withFileLock(safe, async () => {
    const oldContent = await fs.readFile(safe, 'utf-8')
    const ending = detectLineEnding(oldContent)
    const old = convertToLineEnding(normalizeLineEndings(oldString), ending)
    const replacement = convertToLineEnding(normalizeLineEndings(newString), ending)

    const { result: newContent, matchedReplacer } = replaceWithFuzzy(
      oldContent, old, replacement, args.replaceAll === true
    )

    await fs.writeFile(safe, newContent, 'utf-8')
    const diff = generateDiff(targetPath, oldContent, newContent)

    return {
      tool_call_id: '',
      content: `已更新文件: ${targetPath} (+${diff.additions} -${diff.deletions}) [匹配策略: ${matchedReplacer}]`,
      is_error: false,
      metadata: { diff: { ... } },
    }
  })
}
```

#### 3.3.4 参数变更

新增 `replaceAll` 参数：
```typescript
parameters: {
  path: { type: 'string', description: '相对于工作区的文件路径' },
  oldString: { type: 'string', description: '要被替换的原文' },
  newString: { type: 'string', description: '替换后的新文本' },
  replaceAll: {
    type: 'boolean',
    description: '替换所有匹配项（默认 false）。适用于重命名变量等场景。',
    default: false,
  },
},
```

### 3.4 TDD 测试计划

```typescript
// src/renderer/src/__tests__/services/edit.replacer.test.ts

describe('edit.replacer — 多策略模糊匹配', () => {
  describe('SimpleReplacer', () => {
    it('精确匹配成功', () => { /* ... */ })
    it('无匹配返回空', () => { /* ... */ })
  })

  describe('LineTrimmedReplacer', () => {
    it('容忍首尾空白差异', () => { /* AI 给 2空格缩进，文件是 4空格 */ })
    it('容忍 Tab 与空格混用', () => { /* ... */ })
    it('多匹配 yield 全部', () => { /* ... */ })
  })

  describe('BlockAnchorReplacer', () => {
    it('首末行锚定 + 中间行相似度 >= 0.65', () => { /* ... */ })
    it('少于 3 行不启用', () => { /* ... */ })
    it('单候选相似度 < 0.65 拒绝', () => { /* ... */ })
    it('多候选选最高相似度', () => { /* ... */ })
  })

  describe('WhitespaceNormalizedReplacer', () => {
    it('空白归一化后匹配', () => { /* ... */ })
    it('单行子串匹配', () => { /* ... */ })
  })

  describe('replaceWithFuzzy', () => {
    it('按顺序尝试 4 种策略', () => { /* ... */ })
    it('首个成功策略即返回', () => { /* ... */ })
    it('replaceAll 替换所有匹配', () => { /* ... */ })
    it('全部策略失败抛错', () => { /* ... */ })
    it('返回 matchedReplacer 名称', () => { /* ... */ })
  })
})
```

### 3.5 验收标准

- [ ] 四种 Replacer 策略全部实现，单元测试覆盖率 >= 90%
- [ ] `replaceWithFuzzy` 按顺序尝试，首个成功即返回
- [ ] `replaceAll` 参数支持批量替换
- [ ] 并发锁防止同一文件并发编辑
- [ ] 行尾 `\r\n` / `\n` 自动检测和保持
- [ ] 成功时返回匹配策略名称（便于调试）
- [ ] typecheck:node + typecheck:web 通过
- [ ] 所有现有测试不回归

---

## 4. Task 5.2: 文件读取工具 — 流式读取 + 二进制检测

### 4.1 目标

移植 opencode read.ts 的：
- 流式读取大文件（限制 50KB / 2000 行）
- 二进制文件检测（扩展名黑名单 + 不可打印字符比例）
- 图片/PDF 作为附件返回
- 行号前缀输出
- offset/limit 分页

### 4.2 opencode 实现分析

#### 常量定义
```typescript
const DEFAULT_READ_LIMIT = 2000        // 默认读取行数
const MAX_LINE_LENGTH = 2000            // 单行最大字符数
const MAX_BYTES = 50 * 1024             // 最大读取字节（50KB）
const SAMPLE_BYTES = 4096               // 二进制检测采样字节
const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
```

#### 二进制检测
```typescript
const isBinaryFile = (filepath: string, bytes: Uint8Array) => {
  // 1. 扩展名黑名单
  const ext = path.extname(filepath).toLowerCase()
  switch (ext) {
    case ".zip": case ".exe": case ".dll": case ".so":
    case ".class": case ".jar": case ".wasm": case ".pyc":
    // ... 等约 25 种扩展名
      return true
  }
  // 2. 采样字节检测
  if (bytes.length === 0) return false
  let nonPrintableCount = 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) return true  // NUL 字节 → 二进制
    if (bytes[i] < 9 || (bytes[i] > 13 && bytes[i] < 32)) {
      nonPrintableCount++
    }
  }
  return nonPrintableCount / bytes.length > 0.3  // 30% 阈值
}
```

#### 流式读取
```typescript
const lines = Effect.fn(function* (filepath, opts) {
  const start = opts.offset - 1
  const raw: string[] = []
  const flags = { bytes: 0, count: 0, cut: false, more: false, done: false }

  yield* fs.stream(filepath).pipe(
    Stream.map((bytes) => decoder.decode(bytes, { stream: true })),
    Stream.splitLines,
    Stream.runForEach((text) => {
      flags.count += 1
      if (flags.count <= start) return        // 跳过 offset 之前
      if (raw.length >= opts.limit) {           // 达到 limit
        flags.more = true; return
      }
      // 单行截断
      const line = text.length > MAX_LINE_LENGTH
        ? text.substring(0, MAX_LINE_LENGTH) + MAX_LINE_SUFFIX
        : text
      // 字节上限检测
      const size = Buffer.byteLength(line, "utf-8") + (raw.length > 0 ? 1 : 0)
      if (flags.bytes + size > MAX_BYTES) {
        flags.cut = true; flags.more = true; flags.done = true
        return
      }
      raw.push(line)
      flags.bytes += size
    }),
  )
  return { raw, count: flags.count, cut: flags.cut, more: flags.more, offset: opts.offset }
})
```

#### 图片/PDF 附件
```typescript
const mime = sniffAttachmentMime(sample, FSUtil.mimeType(filepath))
const isImage = SUPPORTED_IMAGE_MIMES.has(mime)
if (isImage || isPdfAttachment(mime)) {
  const bytes = yield* fs.readFile(filepath)
  return {
    output: isPdfAttachment(mime) ? "PDF read successfully" : "Image read successfully",
    attachments: [{
      type: "file",
      mime,
      url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`,
    }],
  }
}
```

#### 输出格式（带行号）
```typescript
let output = `<path>${filepath}</path>\n<type>file</type>\n<content>\n`
output += file.raw.map((line, i) => `${i + file.offset}: ${line}`).join("\n")
if (file.cut) {
  output += `\n\n(Output capped at ${MAX_BYTES_LABEL}. Showing lines ${file.offset}-${last}. Use offset=${next} to continue.)`
} else if (file.more) {
  output += `\n\n(Showing lines ${file.offset}-${last} of ${file.count}. Use offset=${next} to continue.)`
} else {
  output += `\n\n(End of file - total ${file.count} lines)`
}
output += "\n</content>"
```

### 4.3 移植方案

#### 4.3.1 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/tools/builtin/read_file.tool.ts` | 修改 | 流式读取、二进制检测、行号、分页 |
| `src/main/tools/builtin/binary.util.ts` | **新建** | 二进制检测 + MIME 嗅探 |
| `src/renderer/src/__tests__/services/binary.util.test.ts` | **新建** | 二进制检测测试 |

#### 4.3.2 binary.util.ts 设计

```typescript
// src/main/tools/builtin/binary.util.ts
import path from 'path'

const BINARY_EXTENSIONS = new Set([
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.class', '.jar', '.war',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp',
  '.bin', '.dat', '.obj', '.o', '.a', '.lib',
  '.wasm', '.pyc', '.pyo',
])

const SAMPLE_BYTES = 4096
const NON_PRINTABLE_THRESHOLD = 0.3

/** 检测文件是否为二进制 */
export function isBinaryFile(filepath: string, sampleBytes: Uint8Array): boolean {
  const ext = path.extname(filepath).toLowerCase()
  if (BINARY_EXTENSIONS.has(ext)) return true

  if (sampleBytes.length === 0) return false

  let nonPrintableCount = 0
  for (let i = 0; i < sampleBytes.length; i++) {
    if (sampleBytes[i] === 0) return true  // NUL 字节
    if (sampleBytes[i] < 9 || (sampleBytes[i] > 13 && sampleBytes[i] < 32)) {
      nonPrintableCount++
    }
  }
  return nonPrintableCount / sampleBytes.length > NON_PRINTABLE_THRESHOLD
}

const SUPPORTED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

/** 通过扩展名获取 MIME 类型 */
export function getMimeType(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

export function isImageFile(filepath: string): boolean {
  return SUPPORTED_IMAGE_MIMES.has(getMimeType(filepath))
}

export function isPdfFile(filepath: string): boolean {
  return getMimeType(filepath) === 'application/pdf'
}
```

#### 4.3.3 read_file.tool.ts 改造要点

```typescript
// 常量
const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
const MAX_BYTES = 50 * 1024
const SAMPLE_BYTES = 4096

async execute(args, context) {
  const targetPath = args.path as string
  const offset = Number(args.offset) > 0 ? Number(args.offset) : 1
  const limit = Number(args.limit) > 0 ? Number(args.limit) : DEFAULT_READ_LIMIT

  const safe = resolveSafePath(targetPath, context.workspacePath, context.allowedDirectories)
  if (!safe) return { content: `路径越界`, is_error: true }

  const stat = await fs.stat(safe)

  // 目录处理
  if (stat.isDirectory()) {
    return await this.readDirectory(safe, offset, limit)
  }

  // 采样检测二进制
  const fd = await fs.open(safe, 'r')
  const sample = Buffer.alloc(Math.min(SAMPLE_BYTES, stat.size))
  await fd.read(sample, 0, sample.length, 0)
  await fd.close()

  // 图片/PDF 作为附件返回
  if (isImageFile(safe) || isPdfFile(safe)) {
    const content = await fs.readFile(safe)
    const mime = getMimeType(safe)
    return {
      tool_call_id: '',
      content: isPdfFile(safe) ? 'PDF read successfully' : 'Image read successfully',
      is_error: false,
      metadata: {
        attachment: {
          mime,
          data: `data:${mime};base64,${content.toString('base64')}`,
        },
      },
    }
  }

  // 二进制文件拒绝读取
  if (isBinaryFile(safe, sample)) {
    return { content: `Cannot read binary file: ${targetPath}`, is_error: true }
  }

  // 流式逐行读取
  const { lines, totalLines, truncated, cut } = await this.readLines(safe, offset, limit)

  // 格式化输出（带行号）
  const output = this.formatOutput(safe, lines, offset, totalLines, truncated, cut)

  return { tool_call_id: '', content: output, is_error: false }
}

/** 流式逐行读取（基于 readline） */
async readLines(filepath: string, offset: number, limit: number) {
  const readline = await import('readline')
  const stream = fsSync.createReadStream(filepath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  const lines: string[] = []
  let count = 0
  let bytes = 0
  let cut = false
  let more = false

  for await (const line of rl) {
    count++
    if (count < offset) continue
    if (lines.length >= limit) { more = true; break }

    const truncatedLine = line.length > MAX_LINE_LENGTH
      ? line.substring(0, MAX_LINE_LENGTH) + `... (line truncated to ${MAX_LINE_LENGTH} chars)`
      : line

    const size = Buffer.byteLength(truncatedLine, 'utf-8') + (lines.length > 0 ? 1 : 0)
    if (bytes + size > MAX_BYTES) { cut = true; more = true; break }

    lines.push(truncatedLine)
    bytes += size
  }

  return { lines, totalLines: count, truncated: more, cut }
}

/** 格式化输出 */
formatOutput(filepath, lines, offset, totalLines, more, cut) {
  const last = offset + lines.length - 1
  const next = last + 1
  let output = `<path>${filepath}</path>\n<type>file</type>\n<content>\n`
  output += lines.map((line, i) => `${i + offset}: ${line}`).join('\n')

  if (cut) {
    output += `\n\n(Output capped at 50 KB. Showing lines ${offset}-${last}. Use offset=${next} to continue.)`
  } else if (more) {
    output += `\n\n(Showing lines ${offset}-${last} of ${totalLines}. Use offset=${next} to continue.)`
  } else {
    output += `\n\n(End of file - total ${totalLines} lines)`
  }
  output += '\n</content>'
  return output
}
```

#### 4.3.4 参数变更

```typescript
parameters: {
  path: { type: 'string', description: '相对于工作区的文件路径' },
  offset: {
    type: 'number',
    description: '起始行号（1-indexed），默认 1',
  },
  limit: {
    type: 'number',
    description: '最大读取行数，默认 2000',
  },
  encoding: { type: 'string', description: "文件编码，默认 'utf-8'", default: 'utf-8' },
},
```

### 4.4 TDD 测试计划

```typescript
describe('binary.util — 二进制文件检测', () => {
  it('扩展名黑名单判定为二进制', () => { /* .exe, .zip, .png */ })
  it('NUL 字节判定为二进制', () => { /* Buffer.from([0, 65, 66]) */ })
  it('不可打印字符比例 > 30% 判定为二进制', () => { /* ... */ })
  it('纯文本文件判定为非二进制', () => { /* ... */ })
  it('空文件判定为非二进制', () => { /* ... */ })
  it('isImageFile / isPdfFile 正确识别', () => { /* ... */ })
})

describe('read_file — 流式读取', () => {
  it('默认读取前 2000 行', () => { /* ... */ })
  it('offset 跳过前 N 行', () => { /* ... */ })
  it('limit 限制读取行数，返回 more 提示', () => { /* ... */ })
  it('单行超过 2000 字符被截断', () => { /* ... */ })
  it('超过 50KB 触发 cut', () => { /* ... */ })
  it('输出包含行号前缀', () => { /* ... */ })
  it('二进制文件返回错误', () => { /* ... */ })
  it('图片文件返回 base64 附件', () => { /* ... */ })
  it('目录返回条目列表', () => { /* ... */ })
})
```

### 4.5 验收标准

- [ ] 大文件流式读取，限制 50KB / 2000 行
- [ ] 二进制文件检测（扩展名 + 采样字节）
- [ ] 图片/PDF 作为 base64 附件返回
- [ ] 行号前缀输出（`<行号>: <内容>`）
- [ ] offset/limit 分页，截断时提示 `Use offset=N to continue`
- [ ] 单行超过 2000 字符自动截断
- [ ] 目录读取返回条目列表
- [ ] typecheck 通过，测试覆盖率 >= 85%

---

## 5. Task 5.3: 命令执行工具 — 权限改进

### 5.1 目标

- 移除 `run_command.tool.ts` 内部的双重权限检查
- 权限请求展示人类可理解的命令名（如 `git commit` 而非 `run_command`）
- 添加命令前缀解析，支持按命令类型（git/npm/rm）分级授权

### 5.2 当前问题

```typescript
// run_command.tool.ts 内部检查（应移除）
if (!context.autoAccept) {
  return {
    content: '需要用户授权执行命令。请在工具审批对话框中确认后重试。',
    is_error: true,
  }
}
```

Agent engine 已有 `onToolCall` 回调做权限审批，工具内部不应重复检查。当前逻辑导致 `autoAccept=false` 时命令永远无法执行（因为工具直接报错，不走审批流程）。

### 5.3 改造方案

#### 5.3.1 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/tools/builtin/run_command.tool.ts` | 修改 | 移除内部权限检查，添加命令前缀到 metadata |
| `src/main/services/permission.service.ts` | 修改 | 添加 `parseCommandPrefix` 函数 |
| `src/renderer/src/components/chat/PermissionDialog.tsx` | 修改 | 显示命令文本 |

#### 5.3.2 run_command.tool.ts 改造

```typescript
async execute(args, context) {
  const command = args.command as string
  // ... 参数校验 ...

  // ❌ 删除：内部权限检查
  // if (!context.autoAccept) { return { ... } }

  const safeCwd = resolveSafePath(cwdRaw, context.workspacePath, context.allowedDirectories)
  if (!safeCwd) return { content: `cwd 路径越界`, is_error: true }

  // ✅ 新增：解析命令前缀，写入 metadata 供权限审批展示
  const commandPrefix = parseCommandPrefix(command)

  const startTime = Date.now()
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: safeCwd, timeout, maxBuffer: 1024 * 1024 * 4 })
    return {
      tool_call_id: '',
      content: JSON.stringify({ stdout, stderr, exitCode: 0, cwd: '...' }, null, 2),
      is_error: false,
      metadata: {
        command: { command, exitCode: 0, duration: Date.now() - startTime },
        commandPrefix,  // 新增：供权限审批展示
      },
    }
  } catch (err) { /* ... */ }
}
```

#### 5.3.3 permission.service.ts 改造

```typescript
/** 解析命令前缀（第一个 token），用于分级授权 */
export function parseCommandPrefix(command: string): string {
  const trimmed = command.trim()
  // 处理管道和逻辑运算符，取第一段
  const firstSegment = trimmed.split(/[|&;]\s*/)[0].trim()
  // 取第一个 token（命令名）
  const parts = firstSegment.split(/\s+/)
  return parts[0] || trimmed
}

/** 检查命令前缀权限（用于细粒度授权） */
export function checkCommandPermission(command: string): PermissionAction {
  const prefix = parseCommandPrefix(command)
  // 先检查具体命令规则（如 "git", "npm"）
  const rules = getPermissionRules()
  for (const rule of rules) {
    if (rule.tool === `cmd:${prefix}`) {
      return rule.action
    }
  }
  // 回退到 run_command 规则
  return checkPermission('run_command')
}
```

#### 5.3.4 PermissionDialog 改造

当工具是 `run_command` 时，从 `toolInput` 中解析命令文本并展示：

```typescript
// PermissionDialog.tsx
const commandText = request.toolName === 'run_command'
  ? (() => { try { return JSON.parse(request.toolInput)?.command || request.toolInput } catch { return request.toolInput } })()
  : request.toolInput

// 展示：
<div className="font-mono text-xs">{commandText}</div>
```

### 5.4 TDD 测试计划

```typescript
describe('parseCommandPrefix', () => {
  it('简单命令返回命令名', () => {
    expect(parseCommandPrefix('git commit -m "msg"')).toBe('git')
  })
  it('管道命令取第一段', () => {
    expect(parseCommandPrefix('ls | grep foo')).toBe('ls')
  })
  it('逻辑运算符取第一段', () => {
    expect(parseCommandPrefix('npm test && npm run build')).toBe('npm')
  })
  it('空白前缀容忍', () => {
    expect(parseCommandPrefix('  rm -rf /')).toBe('rm')
  })
})

describe('run_command 权限', () => {
  it('autoAccept=false 时不再直接报错（走审批流程）', () => { /* ... */ })
  it('metadata 包含 commandPrefix', () => { /* ... */ })
})
```

### 5.5 验收标准

- [ ] 移除 `run_command.tool.ts` 内部的 `autoAccept` 检查
- [ ] `autoAccept=false` 时命令通过 `onToolCall` 审批流程执行
- [ ] `parseCommandPrefix` 正确解析命令前缀
- [ ] PermissionDialog 展示命令文本
- [ ] metadata 包含 `commandPrefix`
- [ ] typecheck 通过，现有测试不回归

---

## 6. Task 5.4: Bash 工具移植

### 6.1 目标

调研 opencode 是否有独立的 bash 工具（区别于 `run_command`）。如有，移植其实现。

### 6.2 调研结论

opencode 的 `packages/opencode/src/tool/` 目录下工具文件包括：
- `edit.ts` — 编辑工具
- `read.ts` — 读取工具
- `write.ts` — 写入工具
- `list.ts` — 列表工具
- `grep.ts` — 搜索工具
- `glob.ts` — 通配符工具
- `remove.ts` — 删除工具
- `webfetch.ts` — 网页抓取
- `websearch.ts` — 网页搜索
- `task.ts` — 子任务

**未发现独立的 `bash.ts`**。opencode 的命令执行通过 MCP 插件或 `process` 工具实现。

### 6.3 替代方案

由于 opencode 无独立 bash 工具，本 Task 调整为：

**增强现有 `run_command` 工具**，使其更接近 opencode 的 `process` 能力：

1. **支持后台进程**：长运行命令（如 dev server）不阻塞
2. **支持终端会话**：复用已有的 terminal IPC，支持交互式命令
3. **支持命令历史**：记录执行过的命令供 AI 引用

### 6.4 改造方案

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/tools/builtin/run_command.tool.ts` | 修改 | 支持 `background: true` 参数 |
| `src/main/tools/builtin/terminal_read.tool.ts` | 修改 | 复用 terminal 会话能力 |

```typescript
// run_command 新增 background 参数
parameters: {
  command: { type: 'string' },
  cwd: { type: 'string', default: '.' },
  timeout: { type: 'number', default: 30000 },
  background: {
    type: 'boolean',
    description: '是否后台运行（不阻塞，返回进程 ID）',
    default: false,
  },
}

async execute(args, context) {
  if (args.background === true) {
    // 后台运行：返回 sessionId，不等待
    const sessionId = await startBackgroundProcess(command, safeCwd)
    return {
      content: `后台进程已启动 (session: ${sessionId})`,
      metadata: { background: true, sessionId },
    }
  }
  // 前台运行：原有逻辑
}
```

### 6.5 验收标准

- [ ] `background: true` 参数支持后台运行
- [ ] 后台进程返回 sessionId
- [ ] 不阻塞 Agent 主流程
- [ ] typecheck 通过

---

## 7. Task 5.5: 工具描述文件系统

### 7.1 目标

移植 opencode 的工具描述文件（`*.txt`），每个工具有详细的 usage 说明，提升 AI 对工具用法的理解。

### 7.2 opencode 实现

opencode 每个工具目录下有对应的 `.txt` 文件：

```
packages/opencode/src/tool/
├── edit.ts
├── edit.txt       ← 工具描述
├── read.ts
├── read.txt       ← 工具描述
├── write.ts
├── write.txt
├── ...
```

**edit.txt 内容示例**：
```
Performs exact string replacements in files.
Usage:
- You must use your `Read` tool at least once in the conversation before editing.
- When editing text from Read tool output, ensure you preserve the exact indentation.
- ALWAYS prefer editing existing files. NEVER write new files unless explicitly required.
- The edit will FAIL if `oldString` is not found in the file.
- Use `replaceAll` for replacing and renaming strings across the file.
```

**read.txt 内容示例**：
```
Read a file or directory from the local filesystem.
Usage:
- The filePath parameter should be an absolute path.
- By default, this tool returns up to 2000 lines from the start of the file.
- Use the offset parameter to read later sections.
- Any line longer than 2000 characters is truncated.
- This tool can read image files and PDFs and return them as file attachments.
```

工具注册时通过 `import DESCRIPTION from "./edit.txt"` 加载描述。

### 7.3 移植方案

#### 7.3.1 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/tools/descriptions/` | **新建目录** | 存放所有工具描述文件 |
| `src/main/tools/descriptions/edit.txt` | **新建** | edit 工具描述 |
| `src/main/tools/descriptions/read_file.txt` | **新建** | read_file 工具描述 |
| `src/main/tools/descriptions/write_file.txt` | **新建** | write_file 工具描述 |
| `src/main/tools/descriptions/run_command.txt` | **新建** | run_command 工具描述 |
| `src/main/tools/descriptions/list_files.txt` | **新建** | list_files 工具描述 |
| `src/main/tools/descriptions/search_files.txt` | **新建** | search_files 工具描述 |
| `src/main/tools/descriptions/grep.txt` | **新建** | grep 工具描述 |
| `src/main/tools/descriptions/webfetch.txt` | **新建** | webfetch 工具描述 |
| `src/main/tools/descriptions/websearch.txt` | **新建** | websearch 工具描述 |
| `src/main/tools/descriptions/todo_write.txt` | **新建** | todo_write 工具描述 |
| `src/main/tools/descriptions/task.txt` | **新建** | task 工具描述 |
| `src/main/tools/descriptions/question.txt` | **新建** | question 工具描述 |
| `src/main/tools/builtin/index.ts` | 修改 | 工具注册时加载对应描述文件 |
| `electron.vite.config.ts` | 修改 | 配置 `.txt` 文件导入 |

#### 7.3.2 描述文件加载机制

```typescript
// electron.vite.config.ts — 允许导入 .txt 文件
// 需要添加 raw 文件导入支持
```

```typescript
// src/main/tools/builtin/index.ts
import editDescription from '../descriptions/edit.txt'
import readDescription from '../descriptions/read_file.txt'
// ... 其他描述

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'edit',
        description: editDescription,  // 使用描述文件
        parameters: { /* ... */ },
      },
    },
    // ...
  ]
}
```

#### 7.3.3 Vite 配置

需要在 `electron.vite.config.ts` 中配置 `.txt` 文件的 raw 导入：

```typescript
// electron.vite.config.ts
main: {
  plugins: [externalizeDepsPlugin()],
  build: {
    rollupOptions: {
      // ...
    },
  },
  // 添加 raw 文件导入支持
  resolve: {
    alias: sharedAlias,
  },
}
```

Vite 默认支持 `import str from './file.txt?raw'` 语法。但需要在 TypeScript 中声明模块：

```typescript
// src/main/tools/descriptions/raw.d.ts
declare module '*.txt' {
  const content: string
  export default content
}
```

### 7.4 描述文件内容设计

每个描述文件应包含：

1. **功能概述**：一句话说明工具用途
2. **使用场景**：何时使用此工具
3. **参数说明**：各参数的详细说明和示例
4. **注意事项**：常见错误和最佳实践
5. **示例**：典型用例

### 7.5 验收标准

- [ ] 所有内置工具配备 `.txt` 描述文件
- [ ] 工具注册时自动加载描述文件
- [ ] 描述文件包含功能、参数、注意事项、示例
- [ ] typecheck 通过，`.txt` 导入无类型错误
- [ ] 工具描述在 AI 请求中正确传递

---

## 8. 依赖关系与执行顺序

```
Task 5.1 (edit 多策略匹配) ──────┐
                                   │
Task 5.2 (read 流式+二进制) ──────┤── 可并行执行
                                   │
Task 5.3 (run_command 权限) ──────┘

Task 5.4 (bash/后台进程) ────────── 依赖 Task 5.3

Task 5.5 (工具描述文件) ─────────── 独立，可随时执行
```

**推荐执行顺序**：

1. **Task 5.5**（工具描述文件）— 独立无依赖，可立即开始
2. **Task 5.1 + Task 5.2 + Task 5.3**（并行）— 三个工具改造相互独立
3. **Task 5.4**（后台进程）— 依赖 Task 5.3 的权限改进

---

## 9. 风险与注意事项

### 9.1 opencode Effect 依赖

opencode 使用 Effect 框架（`Effect.gen`、`Stream`、`Semaphore`），ZX-Code 使用原生 async/await。移植时必须：

- **剥离 Effect**：将 `Effect.gen(function* () {...})` 转为 `async function`
- **替换 Stream**：用 Node.js `readline` 或 `createReadStream` 替代 `Stream`
- **替换 Semaphore**：用 Promise 链实现简单的文件锁

### 9.2 LSP 集成

opencode 的 edit 工具在编辑后触发 LSP 诊断。ZX-Code 目前无 LSP 集成。

**Phase 5 决策**：暂不引入 LSP，编辑后不检查诊断。后续可作为独立 Phase 引入。

### 9.3 性能考量

- **Replacer 策略**：BlockAnchorReplacer 的 Levenshtein 距离计算是 O(n*m)，对大文件可能慢。限制：仅当 oldString < 100 行时启用 BlockAnchor
- **流式读取**：50KB 限制防止 token 爆炸，但 AI 读取大文件需要多次 offset 调用
- **二进制检测**：采样 4096 字节，避免读取整个文件

### 9.4 向后兼容

- `edit` 工具的 `replaceAll` 参数是新增的，默认 `false`，向后兼容
- `read_file` 的 `offset`/`limit` 参数是新增的，默认值保持原行为
- `run_command` 移除内部权限检查后，`autoAccept=false` 的行为变化：从"直接报错"变为"走审批流程"，这是 bugfix

### 9.5 测试隔离

Replacer 策略是纯函数，易于单元测试。但 `edit.tool.ts` 和 `read_file.tool.ts` 涉及文件 I/O，测试时需要：

- 使用临时目录（`os.tmpdir()`）
- 测试后清理临时文件
- mock `context.workspacePath` 指向临时目录

---

## 10. 验收标准汇总

| Task | 验收标准 | 测试数 |
|------|---------|--------|
| 5.1 edit 多策略匹配 | 4 种 Replacer + replaceWithFuzzy + replaceAll + 并发锁 + 行尾保持 | ~20 |
| 5.2 read 流式+二进制 | 50KB 限制 + 二进制检测 + 图片附件 + 行号 + offset/limit | ~15 |
| 5.3 run_command 权限 | 移除双重检查 + 命令前缀解析 + 审批展示命令 | ~8 |
| 5.4 bash/后台进程 | background 参数 + sessionId 返回 | ~5 |
| 5.5 工具描述文件 | 12 个 .txt 文件 + 自动加载 + 类型声明 | ~3 |
| **合计** | | **~51** |

---

## 附录：opencode 源码参考

- edit.ts: `https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/tool/edit.ts`
- read.ts: `https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/tool/read.ts`
- edit.txt: `https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/tool/edit.txt`
- read.txt: `https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/tool/read.txt`

> 注：opencode 仓库默认分支为 `dev`，非 `main`。
