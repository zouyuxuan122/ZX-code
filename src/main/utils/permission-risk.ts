/**
 * 根据工具名称判定风险等级
 * - high: 写入/删除类工具（可能修改或破坏文件）
 * - low: 读取/搜索类工具（只读操作）
 * - medium: 其他工具（执行命令、网络请求等）
 */
export function getRiskLevelForTool(toolName: string): 'low' | 'medium' | 'high' {
  const highRiskTools = new Set([
    'write_file',
    'edit_file',
    'delete_file',
    'create_directory',
    'remove_directory',
    'move_file',
    'copy_file',
  ])

  const lowRiskTools = new Set([
    'read_file',
    'list_files',
    'search_files',
    'glob',
    'grep',
    'find',
  ])

  if (highRiskTools.has(toolName)) return 'high'
  if (lowRiskTools.has(toolName)) return 'low'
  return 'medium'
}
