import path from 'path'
import * as settingsRepo from '../database/repositories/settings.repo'
import { isWithin } from '../tools/builtin/path.util'
import { logger } from './logger.service'

/**
 * 权限配置服务
 *
 * 支持 allow / ask / deny 三种动作：
 * - allow: 自动允许工具执行
 * - ask:   执行前向用户确认
 * - deny:  拒绝执行
 *
 * 规则按声明顺序匹配，首个匹配的工具规则生效；
 * 通配符 '*' 作为工具名时匹配所有工具。
 *
 * 路径感知：工作区内的写入操作默认允许（无需询问），
 *           工作区外的操作需询问，用户批准后可加入目录级白名单。
 */

export type PermissionAction = 'allow' | 'ask' | 'deny'

/** 用户审批决策：once=仅本次允许；always=始终允许（写入规则或白名单）；reject=仅本次拒绝 */
export type ApprovalDecision = 'once' | 'always' | 'reject'

export interface PermissionRule {
  /** 工具名，支持通配符 '*' */
  tool: string
  action: PermissionAction
}

/** settings 表中的存储键 */
const PERMISSION_RULES_KEY = 'permission.rules'

/** 白名单外部目录的存储键 */
const ALLOWED_DIRECTORIES_KEY = 'permission.allowedDirectories'

/** 一键开启读取工作区外文件的存储键 */
const ALLOW_READ_OUTSIDE_KEY = 'permission.allowReadOutsideWorkspace'

/** 需要路径感知权限检查的写入类工具 */
const WRITE_TOOLS = new Set(['write_file', 'edit', 'create_file'])

/** 默认权限规则 */
export const DEFAULT_PERMISSION_RULES: PermissionRule[] = [
  { tool: 'read_file', action: 'allow' },
  { tool: 'list_files', action: 'allow' },
  { tool: 'search_files', action: 'allow' },
  { tool: 'grep', action: 'allow' },
  { tool: 'write_file', action: 'ask' },
  { tool: 'edit', action: 'ask' },
  { tool: 'run_command', action: 'ask' },
  { tool: 'webfetch', action: 'allow' },
  { tool: 'websearch', action: 'allow' },
  { tool: 'todo_write', action: 'allow' },
  { tool: 'question', action: 'allow' },
  { tool: 'task', action: 'allow' },
]

/** 读取权限规则列表 */
export function getPermissionRules(): PermissionRule[] {
  const raw = settingsRepo.get(PERMISSION_RULES_KEY)
  if (!Array.isArray(raw)) {
    return [...DEFAULT_PERMISSION_RULES]
  }
  // 过滤掉不合法的项，保证类型安全
  return raw
    .filter((item): item is PermissionRule => {
      if (!item || typeof item !== 'object') return false
      const r = item as Record<string, unknown>
      return (
        typeof r.tool === 'string' &&
        (r.action === 'allow' || r.action === 'ask' || r.action === 'deny')
      )
    })
    .map((r) => ({ tool: r.tool, action: r.action }))
}

/** 写入权限规则列表 */
export function setPermissionRules(rules: PermissionRule[]): void {
  settingsRepo.set(PERMISSION_RULES_KEY, rules, 'permission')
  logger.debug(`权限规则已更新，共 ${rules.length} 条`)
}

/**
 * 读取白名单外部目录列表（允许工具访问工作区外的目录）
 * 用户可在设置中配置，或通过审批"始终允许"自动添加
 */
export function getAllowedDirectories(): string[] {
  const raw = settingsRepo.get(ALLOWED_DIRECTORIES_KEY)
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

/** 写入白名单外部目录列表 */
export function setAllowedDirectories(dirs: string[]): void {
  const cleaned = dirs.filter((x): x is string => typeof x === 'string' && x.length > 0)
  settingsRepo.set(ALLOWED_DIRECTORIES_KEY, cleaned, 'permission')
  logger.debug(`白名单目录已更新，共 ${cleaned.length} 个`)
}

/** 添加单个目录到白名单（自动去重） */
export function addAllowedDirectory(dir: string): void {
  if (!dir || typeof dir !== 'string') return
  const normalized = path.normalize(dir)
  const allowed = getAllowedDirectories()
  if (!allowed.includes(normalized)) {
    allowed.push(normalized)
    setAllowedDirectories(allowed)
    logger.info(`目录已加入白名单: ${normalized}`)
  }
}

/**
 * 读取"允许访问工作区外文件"开关状态
 * - true（默认）：读取类工具可自由访问工作区外文件
 * - false：读取类工具访问工作区外文件时需询问
 * 写入/删除类工具始终需询问，不受此开关影响
 */
export function getAllowReadOutsideWorkspace(): boolean {
  const raw = settingsRepo.get(ALLOW_READ_OUTSIDE_KEY)
  return raw !== false
}

/** 设置"允许访问工作区外文件"开关状态 */
export function setAllowReadOutsideWorkspace(value: boolean): void {
  settingsRepo.set(ALLOW_READ_OUTSIDE_KEY, value, 'permission')
  logger.info(`允许读取工作区外文件: ${value ? '开启' : '关闭'}`)
}

/**
 * 检查指定工具的权限动作（工具级，不考虑路径）
 *
 * 匹配规则：
 * 1. 按声明顺序遍历，首个匹配的工具名生效
 * 2. 通配符 '*' 匹配任意工具名
 * 3. 未匹配到任何规则时，默认返回 'ask'
 */
export function checkPermission(toolName: string): PermissionAction {
  const rules = getPermissionRules()
  for (const rule of rules) {
    if (rule.tool === '*' || rule.tool === toolName) {
      return rule.action
    }
  }
  return 'ask'
}

/**
 * 路径感知权限检查
 *
 * 优先级：
 * 1. deny 规则始终优先
 * 2. 写入类工具（write_file/edit）无论 allow 还是 ask，都检查路径：
 *    a. 工作区内 → 自动允许
 *    b. 白名单目录内 → 自动允许
 *    c. 工作区外且不在白名单 → 需询问（即使全局 allow 也不放行外部写入）
 *    d. 无路径信息 → allow 放行 / ask 询问
 * 3. allow 规则下，读取类工具检查"允许读取工作区外"开关：
 *    a. 工作区内 → 自动允许
 *    b. 工作区外 + 开关开启 → 自动允许
 *    c. 工作区外 + 开关关闭 → 需询问
 * 4. ask 规则下（非写入类），检查目标路径：
 *    a. 工作区内 → 自动允许
 *    b. 白名单目录内 → 自动允许
 *    c. 其他 → 仍需询问
 * 5. 无 targetPath 时回退到工具级规则
 */
export function checkPermissionWithPath(
  toolName: string,
  targetPath: string | undefined,
  workspacePath: string,
): PermissionAction {
  const action = checkPermission(toolName)

  // deny 优先
  if (action === 'deny') return 'deny'

  // 写入类工具：无论 allow 还是 ask，都做路径检查（防止全局 allow 后写入任意路径）
  if (WRITE_TOOLS.has(toolName)) {
    if (!targetPath || !workspacePath) {
      // 无路径信息：allow 放行，ask 询问
      return action === 'allow' ? 'allow' : 'ask'
    }
    const normalizedTarget = path.normalize(targetPath)
    const normalizedWorkspace = path.normalize(workspacePath)
    // 工作区内 → 自动允许
    if (isWithin(normalizedTarget, normalizedWorkspace)) return 'allow'
    // 白名单目录内 → 自动允许
    const writeAllowedDirs = getAllowedDirectories()
    for (const dir of writeAllowedDirs) {
      if (isWithin(normalizedTarget, path.normalize(dir))) return 'allow'
    }
    // 工作区外且不在白名单 → 需询问
    return 'ask'
  }

  // allow：读取类工具受"允许读取工作区外"开关控制
  if (action === 'allow') {
    // 无路径信息 → 放行
    if (!targetPath || !workspacePath) return 'allow'

    const normalizedTarget = path.normalize(targetPath)
    const normalizedWorkspace = path.normalize(workspacePath)

    // 工作区内 → 放行
    if (isWithin(normalizedTarget, normalizedWorkspace)) return 'allow'

    // 工作区外 → 检查开关
    if (getAllowReadOutsideWorkspace()) return 'allow'
    // 开关关闭 → 需询问
    return 'ask'
  }

  // ask：检查路径是否在工作区或白名单内
  if (!targetPath) return 'ask'

  const normalizedTarget = path.normalize(targetPath)
  const normalizedWorkspace = path.normalize(workspacePath)

  // 工作区内 → 自动允许
  if (isWithin(normalizedTarget, normalizedWorkspace)) {
    return 'allow'
  }

  // 白名单目录内 → 自动允许
  const allowedDirs = getAllowedDirectories()
  for (const dir of allowedDirs) {
    if (isWithin(normalizedTarget, path.normalize(dir))) {
      return 'allow'
    }
  }

  // 工作区外且不在白名单 → 仍需询问
  return 'ask'
}

/**
 * 记住用户的审批决策（工具级，运行时记忆）
 *
 * - once:   不修改规则，仅本次允许
 * - always: 将对应工具规则改为 allow，以后自动放行
 * - reject: 不修改规则，仅本次拒绝
 */
export function rememberApproval(toolName: string, decision: ApprovalDecision): void {
  if (decision !== 'always') return
  const rules = getPermissionRules()
  const existingIdx = rules.findIndex((r) => r.tool === toolName)
  if (existingIdx >= 0) {
    rules[existingIdx] = { tool: toolName, action: 'allow' }
  } else {
    rules.push({ tool: toolName, action: 'allow' })
  }
  setPermissionRules(rules)
  logger.info(`权限规则已更新: ${toolName} → allow (用户选择"始终允许")`)
}

/**
 * 路径感知的审批记忆
 *
 * - always + 工作区外路径 → 将目标文件所在目录加入白名单
 * - always + 工作区内路径 → 无需操作（工作区内已默认允许）
 * - always + 无路径 → 回退到工具级 rememberApproval
 * - once/reject → 不修改任何状态
 */
export function rememberApprovalWithPath(
  toolName: string,
  decision: ApprovalDecision,
  targetPath?: string,
  workspacePath?: string,
): void {
  if (decision !== 'always') return

  // 无路径信息 → 回退到工具级
  if (!targetPath || !workspacePath) {
    rememberApproval(toolName, 'always')
    return
  }

  const normalizedTarget = path.normalize(targetPath)
  const normalizedWorkspace = path.normalize(workspacePath)

  // 工作区内 → 无需操作
  if (isWithin(normalizedTarget, normalizedWorkspace)) {
    return
  }

  // 工作区外 → 将目标文件所在目录加入白名单
  const dir = path.dirname(normalizedTarget)
  addAllowedDirectory(dir)
}
