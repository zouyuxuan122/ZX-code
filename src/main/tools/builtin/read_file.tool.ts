import fs from 'fs/promises'
import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'
import { resolveSafePath } from './path.util'

/** 文件大小上限：超过此值拒绝读取 */
const MAX_FILE_SIZE = 256 * 1024 // 256KB
/** 截断阈值：超过此值但未超过 MAX_FILE_SIZE 时截断 */
const TRUNCATE_THRESHOLD = 64 * 1024 // 64KB

/**
 * read_file 工具：读取 workspace 内指定文件的内容
 * - 超过 256KB 拒绝读取（返回错误）
 * - 64KB-256KB 截断到 64KB 并附加截断提示
 * - 64KB 以内正常读取
 */
export const readFileTool: BuiltinTool = {
  name: 'read_file',
  description: '读取工作区内指定路径文件的内容。路径必须位于当前工作区之内。超过 256KB 的文件将被拒绝，64KB-256KB 的文件会被截断。',
  parameters: {
    path: {
      type: 'string',
      description: '相对于工作区的文件路径，也可使用绝对路径（但必须位于工作区内）',
    },
    encoding: {
      type: 'string',
      description: "文件编码，默认 'utf-8'",
      default: 'utf-8',
    },
  },
  required: ['path'],
  requiredPermissions: [],
  async execute(args, context): Promise<ToolExecutionResult> {
    const targetPath = args.path as string
    const encoding = (args.encoding as BufferEncoding) || 'utf-8'

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
      if (!stat.isFile()) {
        return {
          tool_call_id: '',
          content: `目标路径不是文件: ${targetPath}`,
          is_error: true,
        }
      }

      // 大文件保护：超过 256KB 拒绝读取
      if (stat.size > MAX_FILE_SIZE) {
        return {
          tool_call_id: '',
          content: `文件过大（${(stat.size / 1024).toFixed(1)}KB），超过 256KB 上限，拒绝读取: ${targetPath}`,
          is_error: true,
        }
      }

      const content = await fs.readFile(safe, { encoding })

      // 中等文件截断：64KB-256KB 截断到 64KB
      if (content.length > TRUNCATE_THRESHOLD) {
        const truncated = content.slice(0, TRUNCATE_THRESHOLD)
        return {
          tool_call_id: '',
          content: truncated + `\n\n[...文件内容已截断，原始大小 ${(stat.size / 1024).toFixed(1)}KB，仅显示前 64KB...]`,
          is_error: false,
        }
      }

      return {
        tool_call_id: '',
        content,
        is_error: false,
      }
    } catch (err) {
      const message = (err as NodeJS.ErrnoException)?.code === 'ENOENT'
        ? `文件不存在: ${targetPath}`
        : `读取文件失败: ${(err as Error).message}`
      return {
        tool_call_id: '',
        content: message,
        is_error: true,
      }
    }
  },
}
