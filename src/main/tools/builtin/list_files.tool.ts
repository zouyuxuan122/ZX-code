import fs from 'fs/promises'
import path from 'path'
import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'
import { resolveSafePath, isIgnoredDir } from './path.util'

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
}

/**
 * list_files 工具：列出 workspace 内某目录的文件列表
 */
export const listFilesTool: BuiltinTool = {
  name: 'list_files',
  description: '列出工作区内指定目录的文件与子目录。默认非递归，可设置 recursive=true 进行有限深度遍历。',
  parameters: {
    path: {
      type: 'string',
      description: '相对于工作区的目录路径，默认为工作区根目录',
      default: '.',
    },
    recursive: {
      type: 'boolean',
      description: '是否递归列出子目录，默认 false',
      default: false,
    },
    max_depth: {
      type: 'number',
      description: '递归时的最大深度，默认 3',
      default: 3,
    },
  },
  required: [],
  requiredPermissions: [],
  async execute(args, context): Promise<ToolExecutionResult> {
    const targetPath = (args.path as string) || '.'
    const recursive = args.recursive === true
    const maxDepth = Number(args.max_depth) > 0 ? Number(args.max_depth) : 3

    const safe = resolveSafePath(targetPath, context.workspacePath, context.allowedDirectories, true)
    if (!safe) {
      return {
        tool_call_id: '',
        content: `路径越界或非法: ${targetPath}`,
        is_error: true,
      }
    }

    try {
      const stat = await fs.stat(safe)
      if (!stat.isDirectory()) {
        return {
          tool_call_id: '',
          content: `目标路径不是目录: ${targetPath}`,
          is_error: true,
        }
      }

      const entries: FileEntry[] = []
      await listDir(safe, context.workspacePath, entries, recursive, maxDepth, 0)

      return {
        tool_call_id: '',
        content: JSON.stringify(entries, null, 2),
        is_error: false,
      }
    } catch (err) {
      const message = (err as NodeJS.ErrnoException)?.code === 'ENOENT'
        ? `目录不存在: ${targetPath}`
        : `列出目录失败: ${(err as Error).message}`
      return {
        tool_call_id: '',
        content: message,
        is_error: true,
      }
    }
  },
}

async function listDir(
  absDir: string,
  workspacePath: string,
  out: FileEntry[],
  recursive: boolean,
  maxDepth: number,
  currentDepth: number,
): Promise<void> {
  let items: import('fs').Dirent[]
  try {
    items = await fs.readdir(absDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const item of items) {
    if (item.isDirectory() && isIgnoredDir(item.name)) continue
    const abs = path.join(absDir, item.name)
    const rel = path.relative(workspacePath, abs)
    if (item.isDirectory()) {
      out.push({ name: item.name, path: rel, type: 'directory' })
      if (recursive && currentDepth < maxDepth) {
        await listDir(abs, workspacePath, out, recursive, maxDepth, currentDepth + 1)
      }
    } else if (item.isFile()) {
      out.push({ name: item.name, path: rel, type: 'file' })
    }
  }
}
