import { describe, it, expect } from 'vitest'
import { getRiskLevelForTool } from '../../../../main/utils/permission-risk'

describe('getRiskLevelForTool', () => {
  it('写入类工具返回 high', () => {
    expect(getRiskLevelForTool('write_file')).toBe('high')
    expect(getRiskLevelForTool('edit_file')).toBe('high')
    expect(getRiskLevelForTool('delete_file')).toBe('high')
    expect(getRiskLevelForTool('create_directory')).toBe('high')
  })

  it('读取类工具返回 low', () => {
    expect(getRiskLevelForTool('read_file')).toBe('low')
    expect(getRiskLevelForTool('list_files')).toBe('low')
    expect(getRiskLevelForTool('search_files')).toBe('low')
    expect(getRiskLevelForTool('glob')).toBe('low')
    expect(getRiskLevelForTool('grep')).toBe('low')
  })

  it('未知工具返回 medium', () => {
    expect(getRiskLevelForTool('run_command')).toBe('medium')
    expect(getRiskLevelForTool('unknown_tool')).toBe('medium')
    expect(getRiskLevelForTool('')).toBe('medium')
  })
})
