import fs from 'fs/promises'
import path from 'path'
import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'
import { resolveSafePath, isIgnoredDir } from './path.util'

interface SearchResult {
  path: string
  name: string
}

/**
 * search_files 工具：按文件名模糊匹配搜索 workspace 内的文件
 */
export const searchFilesTool: BuiltinTool = {
  name: 'search_files',
  description: '按文件名模糊匹配搜索工作区内的文件。返回相对路径与文件名列表。',
  parameters: {
    query: {
      type: 'string',
      description: '搜索关键词，将作为子串匹配文件名',
    },
    path: {
      type: 'string',
      description: '搜索的起始目录（相对工作区），默认为 .',
      default: '.',
    },
    max_results: {
      type: 'number',
      description: '最大返回结果数，默认 50',
      default: 50,
    },
  },
  required: ['query'],
  requiredPermissions: [],
  async execute(args, context): Promise<ToolExecutionResult> {
    const query = (args.query as string) || ''
    const startPath = (args.path as string) || '.'
    const maxResults = Number(args.max_results) > 0 ? Number(args.max_results) : 50

    if (!query) {
      return {
        tool_call_id: '',
        content: '参数 query 必须为非空字符串',
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

    const lowerQuery = query.toLowerCase()
    const results: SearchResult[] = []

    try {
      await walk(safe, context.workspacePath, lowerQuery, results, maxResults)
      return {
        tool_call_id: '',
        content: JSON.stringify(results, null, 2),
        is_error: false,
      }
    } catch (err) {
      return {
        tool_call_id: '',
        content: `搜索文件失败: ${(err as Error).message}`,
        is_error: true,
      }
    }
  },
}

async function walk(
  absDir: string,
  workspacePath: string,
  lowerQuery: string,
  out: SearchResult[],
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
      await walk(abs, workspacePath, lowerQuery, out, maxResults)
    } else if (item.isFile() && item.name.toLowerCase().includes(lowerQuery)) {
      out.push({
        path: path.relative(workspacePath, abs),
        name: item.name,
      })
    }
  }
}
