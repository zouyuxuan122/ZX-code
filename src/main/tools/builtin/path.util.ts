import path from 'path'

/**
 * 工具模块共享的路径安全工具
 * 主要用途：解析并规范化路径，支持工作区内外文件访问
 *           （工作区外访问由权限层控制，路径层不再阻止）
 */

/**
 * 判断 absPath 是否位于 baseDir 之内（含 baseDir 本身）
 * 使用 path.relative 避免大小写/分隔符差异导致的误判
 */
export function isWithin(absPath: string, baseDir: string): boolean {
  const rel = path.relative(baseDir, absPath)
  if (!rel) return true // absPath === baseDir
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * 将相对路径解析为绝对路径，并校验结果位于 workspacePath 之内
 * 或位于 allowedDirectories（白名单外部目录）之内
 *
 * @param targetPath 用户输入的路径（相对或绝对）
 * @param workspacePath 当前工作区绝对路径
 * @param allowedDirectories 可选的白名单外部目录列表（绝对路径）
 * @param allowOutside 为 true 时允许访问工作区和白名单外的任意本地路径
 *                     （权限由 permission.service 层控制）
 * @returns 校验通过返回规范化绝对路径；否则返回 null
 */
export function resolveSafePath(
  targetPath: string,
  workspacePath: string,
  allowedDirectories?: string[],
  allowOutside?: boolean,
): string | null {
  if (!targetPath || typeof targetPath !== 'string') return null
  const resolved = path.resolve(workspacePath, targetPath)
  const normalizedWorkspace = path.normalize(workspacePath)
  const normalizedResolved = path.normalize(resolved)

  // 1. workspace 内
  if (isWithin(normalizedResolved, normalizedWorkspace)) {
    return normalizedResolved
  }

  // 2. 白名单外部目录内
  if (allowedDirectories && allowedDirectories.length > 0) {
    for (const dir of allowedDirectories) {
      if (!dir || typeof dir !== 'string') continue
      const normalizedDir = path.normalize(dir)
      if (isWithin(normalizedResolved, normalizedDir)) {
        return normalizedResolved
      }
    }
  }

  // 3. allowOutside=true 时允许访问任意本地路径（权限由上层控制）
  if (allowOutside) {
    return normalizedResolved
  }

  return null
}

/** 默认需要忽略的目录名 */
export const DEFAULT_IGNORED_DIRS = new Set<string>([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  '.vscode',
  '.idea',
])

/** 判断目录名是否应被忽略 */
export function isIgnoredDir(name: string): boolean {
  return DEFAULT_IGNORED_DIRS.has(name)
}
