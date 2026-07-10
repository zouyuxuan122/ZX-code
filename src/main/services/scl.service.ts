import { net } from 'electron'
import * as settingsRepo from '../database/repositories/settings.repo'
import { logger } from './logger.service'
import type {
  SclExtension,
  SclCategory,
  RemoteCatalogEntry,
  RemoteCatalogResponse,
} from '@shared/types/scl'

/** settings 表中的存储键 */
const SCL_EXTENSIONS_KEY = 'scl.extensions'

/** 默认远程目录列表（精选技能包仓库） */
const DEFAULT_REMOTE_CATALOGS: string[] = [
  // 占位：未来可填入真实的远程目录 URL
]

// ============================================================================
// 内置技能定义
// ============================================================================

/** 内置精选技能 */
const BUILTIN_SKILLS: Array<Omit<SclExtension, 'id' | 'created_at' | 'updated_at' | 'source'>> = [
  {
    name: '代码审查专家',
    description: '系统化代码审查：关注正确性、安全性、性能、可读性四个维度，给出结构化反馈。',
    category: 'review',
    author: 'ZX-Code',
    version: '1.0.0',
    content: `## 代码审查技能

当审查代码时，按以下四个维度逐项检查：

### 1. 正确性
- 逻辑是否与需求一致
- 边界条件是否处理（空值、零、负数、溢出）
- 并发场景是否有竞态条件

### 2. 安全性
- 输入是否经过验证和转义
- 是否存在路径穿越 / 注入风险
- 密钥 / 凭证是否硬编码

### 3. 性能
- 是否有不必要的 N+1 查询
- 大数据集是否分页 / 流式处理
- 缓存策略是否合理

### 4. 可读性
- 命名是否清晰表达意图
- 复杂逻辑是否有注释
- 函数是否过长（>50 行需考虑拆分）

输出格式：按维度分类列出问题，每个问题标注严重程度（🔴 严重 / 🟡 建议 / 🟢 优化）。`,
    tags: ['审查', 'review', '质量'],
    enabled: false,
    icon: '🔍',
  },
  {
    name: '调试专家',
    description: '系统化调试：复现 → 定位 → 假设 → 验证 → 修复，避免盲目猜测。',
    category: 'debugging',
    author: 'ZX-Code',
    version: '1.0.0',
    content: `## 调试技能

遇到 bug 时，严格按以下流程：

### 步骤 1：复现
- 确定最小复现路径
- 记录环境信息（OS、版本、依赖）

### 步骤 2：定位
- 阅读相关代码，理解预期行为
- 添加日志或断点，缩小问题范围
- 二分法排查：逐步排除无关模块

### 步骤 3：假设
- 基于证据提出假设，而非猜测
- 写出"如果假设正确，应该观察到 X"

### 步骤 4：验证
- 用最小修改验证假设
- 如果假设错误，回到步骤 2

### 步骤 5：修复
- 修复根因而非症状
- 添加测试防止回归
- 检查类似问题是否存在于其他地方

禁止：盲目修改代码"试试看"。每次修改都必须有明确的理由。`,
    tags: ['调试', 'debug', '排错'],
    enabled: false,
    icon: '🐛',
  },
  {
    name: '测试驱动开发',
    description: 'TDD 流程：红 → 绿 → 重构，先写失败测试，再写实现，最后重构。',
    category: 'testing',
    author: 'ZX-Code',
    version: '1.0.0',
    content: `## TDD 技能

遵循测试驱动开发流程：

### 红（Red）
1. 先写一个失败的测试
2. 测试必须明确描述预期行为
3. 运行测试，确认它失败（且失败原因正确）

### 绿（Green）
1. 写最少的代码让测试通过
2. 不要过度设计
3. 运行测试，确认全部通过

### 重构（Refactor）
1. 在测试通过的前提下改进代码质量
2. 每次重构后运行测试
3. 提取重复逻辑、改善命名、简化结构

### 测试规范
- 测试名使用 "should ... when ..." 格式
- 每个测试只验证一个行为
- 使用 AAA 模式：Arrange / Act / Assert
- Mock 外部依赖，不 Mock 被测对象`,
    tags: ['TDD', '测试', 'test'],
    enabled: false,
    icon: '🧪',
  },
  {
    name: 'Git 工作流',
    description: '规范 Git 提交信息、分支管理、PR 描述，保持仓库历史清晰。',
    category: 'devops',
    author: 'ZX-Code',
    version: '1.0.0',
    content: `## Git 工作流技能

### 提交信息规范（Conventional Commits）
格式：\`<type>(<scope>): <subject>\`

类型：
- feat: 新功能
- fix: 修复 bug
- docs: 文档变更
- style: 代码格式（不影响功能）
- refactor: 重构
- test: 测试相关
- chore: 构建 / 工具变更

规则：
- subject 不超过 50 字符，使用祈使句
- body 解释"为什么"而非"做了什么"
- footer 标注 BREAKING CHANGE 或关联 Issue

### 分支管理
- main: 生产分支，只接受 PR 合并
- develop: 开发分支
- feature/*: 功能分支
- fix/*: 修复分支
- hotfix/*: 紧急修复

### PR 描述模板
## 变更说明
简述本次变更的目的和内容

## 变更类型
- [ ] 新功能
- [ ] Bug 修复
- [ ] 重构
- [ ] 文档

## 测试
说明如何验证本次变更

## 关联 Issue
Closes #XXX`,
    tags: ['Git', '提交', '分支'],
    enabled: false,
    icon: '🌿',
  },
  {
    name: '架构设计',
    description: '系统架构设计原则：关注点分离、依赖倒置、渐进式演进。',
    category: 'architecture',
    author: 'ZX-Code',
    version: '1.0.0',
    content: `## 架构设计技能

### 核心原则

#### 1. 关注点分离（Separation of Concerns）
- 每个模块 / 类 / 函数只负责一件事
- UI 逻辑、业务逻辑、数据访问分层
- 避免上帝类（God Class）

#### 2. 依赖倒置（Dependency Inversion）
- 高层模块不依赖低层模块，两者都依赖抽象
- 通过接口 / 协议解耦
- 便于测试和替换

#### 3. 渐进式演进
- 不要一开始就过度设计
- 先让功能跑通，再优化结构
- 重构是持续的过程

### 设计决策记录（ADR）
对重要架构决策，记录：
1. 上下文：为什么需要决策
2. 选项：考虑了哪些方案
3. 决策：选择了什么，为什么
4. 后果：带来的影响和限制

### 常见反模式
- 过早抽象：在只有一处使用时就抽象
- 分布式单体：微服务架构但紧耦合
- 魔法代码：隐式行为而非显式配置`,
    tags: ['架构', '设计', '架构'],
    enabled: false,
    icon: '🏗️',
  },
  {
    name: '文档编写',
    description: '编写清晰的技术文档：README、API 文档、注释规范。',
    category: 'documentation',
    author: 'ZX-Code',
    version: '1.0.0',
    content: `## 文档编写技能

### README 结构
1. 项目名称 + 一句话描述
2. 功能特性列表
3. 快速开始（安装、运行）
4. 使用示例
5. 配置说明
6. 贡献指南
7. 许可证

### 代码注释原则
- 解释"为什么"而非"是什么"
- 公共 API 必须有文档注释
- 复杂算法需要说明思路
- TODO / FIXME 必须带 Issue 编号

### API 文档规范
每个 API 包含：
- 功能描述
- 参数说明（类型、是否必填、默认值）
- 返回值
- 错误码
- 使用示例

### 提交文档检查清单
- [ ] 拼写检查
- [ ] 链接有效
- [ ] 代码示例可运行
- [ ] 版本号已更新`,
    tags: ['文档', 'README', '注释'],
    enabled: false,
    icon: '📝',
  },
]

// ============================================================================
// 配置管理
// ============================================================================

/** 生成技能 ID */
function generateId(): string {
  return `scl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 读取所有已安装技能 */
function loadExtensions(): SclExtension[] {
  const raw = settingsRepo.get(SCL_EXTENSIONS_KEY)
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is SclExtension => {
    if (!item || typeof item !== 'object') return false
    const r = item as Record<string, unknown>
    return (
      typeof r.id === 'string' &&
      typeof r.name === 'string' &&
      typeof r.content === 'string' &&
      typeof r.enabled === 'boolean'
    )
  })
}

/** 保存所有技能配置 */
function saveExtensions(extensions: SclExtension[]): void {
  settingsRepo.set(SCL_EXTENSIONS_KEY, extensions, 'scl')
  logger.debug(`SCL 技能配置已保存，共 ${extensions.length} 个`)
}

// ============================================================================
// 初始化内置技能
// ============================================================================

let initialized = false

/** 初始化内置技能（仅在首次调用时执行） */
export function initBuiltinSkills(): void {
  if (initialized) return
  initialized = true
  const existing = loadExtensions()
  const existingNames = new Set(existing.map((e) => e.name))
  const now = Date.now()
  let added = 0
  for (const skill of BUILTIN_SKILLS) {
    if (existingNames.has(skill.name)) continue
    const ext: SclExtension = {
      ...skill,
      id: generateId(),
      source: 'builtin',
      created_at: now,
      updated_at: now,
    }
    existing.push(ext)
    added++
  }
  if (added > 0) {
    saveExtensions(existing)
    logger.info(`已初始化 ${added} 个内置 SCL 技能`)
  }
}

// ============================================================================
// CRUD 操作
// ============================================================================

/** 列出所有已安装技能 */
export function listSclExtensions(): SclExtension[] {
  initBuiltinSkills()
  return loadExtensions()
}

/** 安装一个技能 */
export function installSclExtension(
  config: Omit<SclExtension, 'id' | 'created_at' | 'updated_at'>,
): SclExtension {
  const extensions = loadExtensions()
  const now = Date.now()
  const newExt: SclExtension = {
    ...config,
    id: generateId(),
    created_at: now,
    updated_at: now,
  }
  extensions.push(newExt)
  saveExtensions(extensions)
  logger.info(`已安装 SCL 技能: ${newExt.name} (${newExt.id})`)
  return newExt
}

/** 卸载一个技能 */
export function uninstallSclExtension(id: string): void {
  const extensions = loadExtensions()
  const idx = extensions.findIndex((e) => e.id === id)
  if (idx < 0) {
    throw new Error(`SCL 技能不存在: ${id}`)
  }
  const removed = extensions.splice(idx, 1)[0]
  saveExtensions(extensions)
  logger.info(`已卸载 SCL 技能: ${removed.name} (${id})`)
}

/** 更新技能配置 */
export function updateSclExtension(id: string, config: Partial<SclExtension>): SclExtension {
  const extensions = loadExtensions()
  const idx = extensions.findIndex((e) => e.id === id)
  if (idx < 0) {
    throw new Error(`SCL 技能不存在: ${id}`)
  }
  const { id: _omit, ...rest } = config
  void _omit
  const updated: SclExtension = {
    ...extensions[idx],
    ...rest,
    updated_at: Date.now(),
  }
  extensions[idx] = updated
  saveExtensions(extensions)
  logger.info(`已更新 SCL 技能: ${updated.name} (${id})`)
  return updated
}

/** 启用 / 禁用技能 */
export function toggleSclExtension(id: string, enabled: boolean): SclExtension {
  return updateSclExtension(id, { enabled })
}

// ============================================================================
// 技能内容获取
// ============================================================================

/**
 * 获取所有已启用技能的内容，拼接成一段文本
 * 用于注入到 Agent 的系统提示词中
 */
export function getEnabledSkillsContent(): string {
  const extensions = loadExtensions()
  const enabled = extensions.filter((e) => e.enabled)
  if (enabled.length === 0) return ''

  const sections = enabled.map((ext) => {
    return `### ${ext.icon} ${ext.name}\n\n${ext.content}`
  })

  return `## 已启用技能\n\n以下技能由用户安装，请在相关场景中遵循这些指引：\n\n${sections.join('\n\n---\n\n')}`
}

// ============================================================================
// 远程目录拉取
// ============================================================================

/** 默认远程目录列表 */
export function getDefaultRemoteCatalogs(): string[] {
  return [...DEFAULT_REMOTE_CATALOGS]
}

/**
 * 从远程 URL 拉取技能目录
 * 使用 Electron net.fetch（尊重系统代理）
 */
export async function fetchRemoteCatalog(url: string): Promise<RemoteCatalogResponse> {
  if (!url || typeof url !== 'string') {
    throw new Error('远程目录 URL 不能为空')
  }

  // 校验 URL
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`仅支持 http/https 协议: ${url}`)
    }
  } catch {
    throw new Error(`URL 格式非法: ${url}`)
  }

  const fetchFn =
    typeof net !== 'undefined' && typeof net.fetch === 'function' ? net.fetch : fetch

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    logger.info(`正在拉取远程 SCL 目录: ${url}`)
    const res = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as RemoteCatalogResponse
    // 基本校验
    if (!data || !Array.isArray(data.skills)) {
      throw new Error('远程目录响应格式无效：缺少 skills 数组')
    }
    logger.info(`远程目录 [${data.name}] 拉取成功，包含 ${data.skills.length} 个技能`)
    return data
  } catch (err) {
    const e = err as Error
    const isTimeout =
      e.name === 'TimeoutError' ||
      e.name === 'AbortError' ||
      (typeof e.message === 'string' && /timed? out|abort/i.test(e.message))
    const message = isTimeout
      ? `拉取远程目录超时（15s）: ${url}`
      : `拉取远程目录失败: ${e.message || String(err)}`
    logger.error(message, e)
    throw new Error(message)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 批量安装远程目录中的技能
 * @param url 远程目录 URL（记录来源）
 * @param entries 要安装的技能条目列表
 */
export function installFromRemote(
  url: string,
  entries: RemoteCatalogEntry[],
): SclExtension[] {
  const extensions = loadExtensions()
  const existingNames = new Set(extensions.map((e) => e.name))
  const now = Date.now()
  const installed: SclExtension[] = []

  for (const entry of entries) {
    // 跳过已存在的同名技能
    if (existingNames.has(entry.name)) {
      logger.debug(`SCL 技能已存在，跳过: ${entry.name}`)
      continue
    }
    const ext: SclExtension = {
      id: generateId(),
      name: entry.name,
      description: entry.description,
      category: entry.category as SclCategory,
      author: entry.author,
      version: entry.version,
      content: entry.content,
      tags: entry.tags,
      enabled: false, // 默认不启用，用户手动开启
      source: 'remote',
      sourceUrl: url,
      icon: entry.icon,
      created_at: now,
      updated_at: now,
    }
    extensions.push(ext)
    installed.push(ext)
  }

  saveExtensions(extensions)
  logger.info(`从远程目录安装了 ${installed.length} 个 SCL 技能（来源: ${url}）`)
  return installed
}
