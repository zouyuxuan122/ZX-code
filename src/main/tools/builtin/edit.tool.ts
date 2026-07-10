import fs from 'fs/promises'
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
 * edit 工具：对 workspace 内指定文件执行精确字符串替换，生成 diff
 */
export const editTool: BuiltinTool = {
  name: 'edit',
  description: '对工作区内指定文件执行精确字符串替换。若原文在文件中出现多次，需要提供更唯一的上下文；若未找到原文则报错。',
  parameters: {
    path: {
      type: 'string',
      description: '相对于工作区的文件路径',
    },
    oldString: {
      type: 'string',
      description: '要被替换的原文（必须在文件中唯一出现）',
    },
    newString: {
      type: 'string',
      description: '替换后的新文本',
    },
  },
  required: ['path', 'oldString', 'newString'],
  requiredPermissions: ['file:write'],
  async execute(args, context): Promise<ToolExecutionResult> {
    const targetPath = args.path as string
    const oldString = args.oldString as string
    const newString = args.newString as string

    if (typeof oldString !== 'string' || typeof newString !== 'string') {
      return {
        tool_call_id: '',
        content: '参数 oldString 和 newString 必须为字符串',
        is_error: true,
      }
    }

    if (oldString === newString) {
      return {
        tool_call_id: '',
        content: 'oldString 与 newString 相同，无需替换',
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
      // 读取原文件内容
      let oldContent: string
      try {
        oldContent = await fs.readFile(safe, { encoding: 'utf-8' })
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

      // 统计 oldString 出现次数
      let count = 0
      let idx = oldContent.indexOf(oldString)
      while (idx !== -1) {
        count++
        idx = oldContent.indexOf(oldString, idx + oldString.length)
      }

      if (count === 0) {
        return {
          tool_call_id: '',
          content: `未在文件中找到要替换的原文: ${targetPath}`,
          is_error: true,
        }
      }

      if (count > 1) {
        return {
          tool_call_id: '',
          content: `原文在文件中出现 ${count} 次，请提供更长的上下文使其唯一匹配: ${targetPath}`,
          is_error: true,
        }
      }

      // 执行精确替换（仅替换第一处，已在上方校验唯一性）
      const newContent = oldContent.replace(oldString, newString)
      await fs.writeFile(safe, newContent, { encoding: 'utf-8' })

      // 生成 diff
      const diff = generateDiff(targetPath, oldContent, newContent)

      return {
        tool_call_id: '',
        content: `已更新文件: ${targetPath} (+${diff.additions} -${diff.deletions})`,
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
        content: `编辑文件失败: ${(err as Error).message}`,
        is_error: true,
      }
    }
  },
}
