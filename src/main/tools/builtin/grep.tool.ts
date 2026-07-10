import fs from 'fs/promises'
import path from 'path'
import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'
import { resolveSafePath, isIgnoredDir } from './path.util'

interface GrepMatch {
  path: string
  line: number
  text: string
}

/**
 * grep 工具：在文件内容中搜索正则，返回匹配的文件路径与行号
 */
export const grepTool: BuiltinTool = {
  name: 'grep',
  description: '在工作区内对文件内容进行正则搜索，返回匹配的文件路径、行号与行内容。',
  parameters: {
    pattern: {
      type: 'string',
      description: '正则表达式字符串',
    },
    path: {
      type: 'string',
      description: '搜索的起始目录（相对工作区），默认为 .',
      default: '.',
    },
    include: {
      type: 'string',
      description: '可选的文件名 glob 过滤，如 "*.ts"（简化实现：仅做后缀或子串匹配）',
    },
    max_results: {
      type: 'number',
      description: '最大返回匹配条目数，默认 50',
      default: 50,
    },
  },
  required: ['pattern'],
  requiredPermissions: [],
  async execute(args, context): Promise<ToolExecutionResult> {
    const patternStr = (args.pattern as string) || ''
    const startPath = (args.path as string) || '.'
    const include = (args.include as string) || ''
    const maxResults = Number(args.max_results) > 0 ? Number(args.max_results) : 50

    if (!patternStr) {
      return {
        tool_call_id: '',
        content: '参数 pattern 必须为非空字符串',
        is_error: true,
      }
    }

    let regex: RegExp
    try {
      regex = new RegExp(patternStr)
    } catch (err) {
      return {
        tool_call_id: '',
        content: `无效的正则表达式: ${(err as Error).message}`,
        is_error: true,
      }
    }

    const safe = resolveSafePath(startPath, context.workspacePath, context.allowedDirectories, true)
    if (!safe) {
      return {
        tool_call_id: '',
        content: `路径越界或非法: ${startPath}`,
        is_error: true,
      }
    }

    const matches: GrepMatch[] = []
    try {
      await walkAndGrep(safe, context.workspacePath, regex, include, matches, maxResults)
      return {
        tool_call_id: '',
        content: JSON.stringify(matches, null, 2),
        is_error: false,
      }
    } catch (err) {
      return {
        tool_call_id: '',
        content: `grep 搜索失败: ${(err as Error).message}`,
        is_error: true,
      }
    }
  },
}

function matchesInclude(fileName: string, include: string): boolean {
  if (!include) return true
  // 简化匹配：支持 "*.ext" 或纯子串
  if (include.startsWith('*.')) {
    return fileName.toLowerCase().endsWith(include.slice(1).toLowerCase())
  }
  return fileName.toLowerCase().includes(include.toLowerCase())
}

async function walkAndGrep(
  absDir: string,
  workspacePath: string,
  regex: RegExp,
  include: string,
  out: GrepMatch[],
  maxResults: number,
): Promise<void> {
  if (out.length >= maxResults) return
  let items: import('fs').Dirent[]
  try {
    items = await fs.readdir(absDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const item of items) {
    if (out.length >= maxResults) return
    if (item.isDirectory() && isIgnoredDir(item.name)) continue
    const abs = path.join(absDir, item.name)
    if (item.isDirectory()) {
      await walkAndGrep(abs, workspacePath, regex, include, out, maxResults)
    } else if (item.isFile() && matchesInclude(item.name, include)) {
      await grepFile(abs, workspacePath, regex, out, maxResults)
    }
  }
}

async function grepFile(
  absFile: string,
  workspacePath: string,
  regex: RegExp,
  out: GrepMatch[],
  maxResults: number,
): Promise<void> {
  let content: string
  try {
    content = await fs.readFile(absFile, { encoding: 'utf-8' })
  } catch {
    return
  }
  const lines = content.split(/\r?\n/)
  const rel = path.relative(workspacePath, absFile)
  for (let i = 0; i < lines.length; i++) {
    if (out.length >= maxResults) return
    if (regex.test(lines[i])) {
      out.push({
        path: rel,
        line: i + 1,
        text: lines[i].length > 500 ? lines[i].slice(0, 500) + '...' : lines[i],
      })
    }
  }
}
