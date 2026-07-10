import fs from 'fs/promises'
import path from 'path'
import { createTwoFilesPatch, diffLines } from 'diff'
import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'
import { resolveSafePath } from './path.util'

/**
 * 生成 unified diff 并统计 additions/deletions
 */
function generateDiff(filepath: string, oldContent: string, newContent: string) {
  const patch = createTwoFilesPatch(filepath, filepath, oldContent, newContent, '', '', { context: 3 })
  // 裁剪 jsdiff 多余的头部行（Index: / === / --- / +++）
  const lines = patch.split('\n')
  const trimmed = lines.filter((l, i) => {
    if (i < 4) {
      // 跳过前 4 行头部：空行 / Index: / === / --- / +++
      if (l.startsWith('Index:') || l.startsWith('===') || l.startsWith('---') || l.startsWith('+++') || l.trim() === '') {
        return false
      }
    }
    return true
  }).join('\n')

  let additions = 0
  let deletions = 0
  for (const change of diffLines(oldContent, newContent)) {
    if (change.added) additions += change.count || 0
    if (change.removed) deletions += change.count || 0
  }

  return { patch: trimmed, additions, deletions }
}

/**
 * write_file 工具：向 workspace 内指定文件写入内容，生成 diff
 */
export const writeFileTool: BuiltinTool = {
  name: 'write_file',
  description: '将内容写入工作区内指定文件。如果文件已存在，会显示变更 diff（新增行绿色、删除行红色）。可选择是否自动创建中间目录。',
  parameters: {
    path: {
      type: 'string',
      description: '相对于工作区的文件路径',
    },
    content: {
      type: 'string',
      description: '要写入的文本内容',
    },
    create_dirs: {
      type: 'boolean',
      description: '当父目录不存在时是否自动创建，默认 true',
      default: true,
    },
  },
  required: ['path', 'content'],
  requiredPermissions: ['file:write'],
  async execute(args, context): Promise<ToolExecutionResult> {
    const targetPath = args.path as string
    const content = args.content as string
    const createDirs = args.create_dirs !== false

    if (typeof content !== 'string') {
      return {
        tool_call_id: '',
        content: '参数 content 必须为字符串',
        is_error: true,
      }
    }

    const safe = resolveSafePath(targetPath, context.workspacePath, context.allowedDirectories, true)
    if (!safe) {
      return {
        tool_call_id: '',
        content: `路径越界或非法: ${targetPath}`,
        is_error: true,
      }
    }

    try {
      // 读取旧内容（用于 diff）
      let oldContent = ''
      let fileExisted = false
      try {
        oldContent = await fs.readFile(safe, { encoding: 'utf-8' })
        fileExisted = true
      } catch {
        // 文件不存在，oldContent 为空
      }

      if (createDirs) {
        const dir = path.dirname(safe)
        await fs.mkdir(dir, { recursive: true })
      }
      await fs.writeFile(safe, content, { encoding: 'utf-8' })

      // 生成 diff
      const diff = generateDiff(targetPath, oldContent, content)

      return {
        tool_call_id: '',
        content: fileExisted
          ? `已更新文件: ${targetPath} (+${diff.additions} -${diff.deletions})`
          : `已创建文件: ${targetPath} (${content.length} 字符)`,
        is_error: false,
        metadata: {
          diff: {
            filepath: targetPath,
            patch: diff.patch,
            additions: diff.additions,
            deletions: diff.deletions,
          },
        },
      }
    } catch (err) {
      return {
        tool_call_id: '',
        content: `写入文件失败: ${(err as Error).message}`,
        is_error: true,
      }
    }
  },
}
