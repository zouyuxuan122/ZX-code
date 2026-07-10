import fs from 'fs'
import path from 'path'
import { logger } from './logger.service'
import type { FileSearchResult, SearchOptions } from '@shared/types/search'

/** 搜索时需要跳过的目录 */
const IGNORED_DIRS = new Set<string>([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.next',
  'build',
])

/** 内容搜索时跳过的文件大小上限（1MB） */
const MAX_FILE_SIZE = 1024 * 1024

/** 二进制检测读取的字节数（前 8KB） */
const BINARY_CHECK_BYTES = 8 * 1024

/** 内容匹配预览的最大长度 */
const PREVIEW_MAX_LENGTH = 200

/** 文件名匹配分数 */
const SCORE_EXACT = 100
const SCORE_STARTS_WITH = 80
const SCORE_CONTAINS = 60
/** 内容匹配分数 */
const SCORE_CONTENT = 50

/**
 * 文件搜索主入口
 * 支持按文件名 / 内容 / 全部模式搜索工作区内的文件
 */
export async function searchFiles(options: SearchOptions): Promise<FileSearchResult[]> {
  const {
    workspacePath,
    query,
    mode,
    maxResults = 100,
    filePattern,
    useRegex = false,
    caseSensitive = false,
    wholeWord = false,
  } = options

  if (!query || !workspacePath) {
    return []
  }

  try {
    if (!fs.existsSync(workspacePath)) {
      logger.info(`搜索的工作区路径不存在: ${workspacePath}`)
      return []
    }

    const globMatcher = filePattern ? buildGlobMatcher(filePattern) : null
    const lineMatcher = buildLineMatcher(query, useRegex, caseSensitive, wholeWord)

    let results: FileSearchResult[] = []

    if (mode === 'filename' || mode === 'all') {
      const filenameResults = searchByFilename(
        workspacePath,
        query,
        globMatcher,
        caseSensitive,
        maxResults,
      )
      results = results.concat(filenameResults)
    }

    if (mode === 'content' || mode === 'all') {
      const contentResults = searchByContent(
        workspacePath,
        lineMatcher,
        globMatcher,
        maxResults,
      )
      results = results.concat(contentResults)
    }

    // 排序：分数降序，路径长度升序
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.filepath.length - b.filepath.length
    })

    if (results.length > maxResults) {
      results = results.slice(0, maxResults)
    }

    return results
  } catch (err) {
    logger.error(`文件搜索失败: ${(err as Error).message}`, err as Error)
    return []
  }
}

/** 转义正则特殊字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 构建简单的 glob 匹配器（支持 * 和 ?，匹配文件名） */
function buildGlobMatcher(pattern: string): (filename: string) => boolean {
  let regexPattern = ''
  for (const ch of pattern) {
    if (ch === '*') {
      regexPattern += '.*'
    } else if (ch === '?') {
      regexPattern += '.'
    } else {
      regexPattern += escapeRegex(ch)
    }
  }
  const regex = new RegExp(`^${regexPattern}$`, 'i')
  return (filename: string) => regex.test(filename)
}

/** 构建行匹配器（用于内容搜索） */
function buildLineMatcher(
  query: string,
  useRegex: boolean,
  caseSensitive: boolean,
  wholeWord: boolean,
): (line: string) => { matched: boolean; column: number } {
  let pattern: string
  if (useRegex) {
    pattern = query
  } else {
    pattern = escapeRegex(query)
  }
  if (wholeWord) {
    pattern = `\\b${pattern}\\b`
  }
  const flags = caseSensitive ? '' : 'i'
  let regex: RegExp
  try {
    regex = new RegExp(pattern, flags)
  } catch {
    // 非法正则，回退为字面量匹配
    regex = new RegExp(escapeRegex(query), flags)
  }
  return (line: string) => {
    const m = regex.exec(line)
    if (m) {
      return { matched: true, column: m.index + 1 }
    }
    return { matched: false, column: -1 }
  }
}

/** 计算文件名匹配分数（0 表示不匹配） */
function scoreFilename(filename: string, query: string, caseSensitive: boolean): number {
  const f = caseSensitive ? filename : filename.toLowerCase()
  const q = caseSensitive ? query : query.toLowerCase()
  if (f === q) return SCORE_EXACT
  if (f.startsWith(q)) return SCORE_STARTS_WITH
  if (f.includes(q)) return SCORE_CONTAINS
  return 0
}

/**
 * 递归遍历目录，对每个文件调用回调
 * @param onFile 文件回调，返回 false 时停止遍历
 * @returns false 表示提前终止
 */
function walkDirectory(
  dir: string,
  onFile: (absPath: string, dirent: fs.Dirent) => boolean,
): boolean {
  let items: fs.Dirent[]
  try {
    items = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return true
  }
  for (const item of items) {
    if (item.isDirectory()) {
      if (IGNORED_DIRS.has(item.name)) continue
      if (!walkDirectory(path.join(dir, item.name), onFile)) return false
    } else if (item.isFile()) {
      if (!onFile(path.join(dir, item.name), item)) return false
    }
  }
  return true
}

/** 按文件名搜索 */
function searchByFilename(
  workspacePath: string,
  query: string,
  globMatcher: ((filename: string) => boolean) | null,
  caseSensitive: boolean,
  maxResults: number,
): FileSearchResult[] {
  const results: FileSearchResult[] = []
  walkDirectory(workspacePath, (absPath, dirent) => {
    if (results.length >= maxResults) return false
    const filename = dirent.name
    if (globMatcher && !globMatcher(filename)) return true
    const score = scoreFilename(filename, query, caseSensitive)
    if (score > 0) {
      results.push({
        filepath: path.relative(workspacePath, absPath),
        absolutePath: absPath,
        filename,
        matchType: 'filename',
        score,
      })
    }
    return true
  })
  return results
}

/** 按内容搜索 */
function searchByContent(
  workspacePath: string,
  lineMatcher: (line: string) => { matched: boolean; column: number },
  globMatcher: ((filename: string) => boolean) | null,
  maxResults: number,
): FileSearchResult[] {
  const results: FileSearchResult[] = []
  walkDirectory(workspacePath, (absPath, dirent) => {
    if (results.length >= maxResults) return false
    const filename = dirent.name
    if (globMatcher && !globMatcher(filename)) return true

    let stat: fs.Stats
    try {
      stat = fs.statSync(absPath)
    } catch {
      return true
    }
    if (stat.size > MAX_FILE_SIZE) return true

    let buf: Buffer
    try {
      buf = fs.readFileSync(absPath)
    } catch {
      return true
    }

    // 检测二进制文件：前 8KB 是否包含 null 字节
    const checkLen = Math.min(BINARY_CHECK_BYTES, buf.length)
    for (let i = 0; i < checkLen; i++) {
      if (buf[i] === 0) return true
    }

    const content = buf.toString('utf-8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const { matched, column } = lineMatcher(line)
      if (matched) {
        results.push({
          filepath: path.relative(workspacePath, absPath),
          absolutePath: absPath,
          filename,
          line: i + 1,
          column,
          preview: line.length > PREVIEW_MAX_LENGTH ? line.slice(0, PREVIEW_MAX_LENGTH) : line,
          matchType: 'content',
          score: SCORE_CONTENT,
        })
        // 每个文件只取第一个匹配，保持结果多样性
        if (results.length >= maxResults) return false
        break
      }
    }
    return true
  })
  return results
}
