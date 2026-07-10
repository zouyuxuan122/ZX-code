import { describe, it, expect, beforeEach, vi } from 'vitest'

// 内存中的 settings 存储模拟
const memoryStore = new Map<string, unknown>()

vi.mock('../../../../main/database/repositories/settings.repo', () => ({
  get: (key: string) => memoryStore.get(key) ?? null,
  set: (key: string, value: unknown) => { memoryStore.set(key, value) },
  getAll: () => [],
  remove: (key: string) => { memoryStore.delete(key) },
}))

vi.mock('../../../../main/services/logger.service', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import {
  checkPermission,
  checkPermissionWithPath,
  setPermissionRules,
  getPermissionRules,
  DEFAULT_PERMISSION_RULES,
  rememberApproval,
  rememberApprovalWithPath,
  getAllowedDirectories,
  setAllowedDirectories,
  addAllowedDirectory,
  getAllowReadOutsideWorkspace,
  setAllowReadOutsideWorkspace,
} from '../../../../main/services/permission.service'

describe('权限系统 — always 运行时记忆', () => {
  beforeEach(() => {
    memoryStore.clear()
    setPermissionRules([...DEFAULT_PERMISSION_RULES])
  })

  it('checkPermission 返回 allow/ask/deny', () => {
    expect(checkPermission('read_file')).toBe('allow')
    expect(checkPermission('write_file')).toBe('ask')
  })

  it('rememberApproval always 将规则改为 allow', () => {
    // write_file 默认是 ask
    expect(checkPermission('write_file')).toBe('ask')

    rememberApproval('write_file', 'always')

    // 现在应该是 allow
    expect(checkPermission('write_file')).toBe('allow')
  })

  it('rememberApproval once 不修改规则', () => {
    expect(checkPermission('write_file')).toBe('ask')

    rememberApproval('write_file', 'once')

    // 规则不变
    expect(checkPermission('write_file')).toBe('ask')
  })

  it('rememberApproval reject 不修改规则', () => {
    expect(checkPermission('write_file')).toBe('ask')

    rememberApproval('write_file', 'reject')

    expect(checkPermission('write_file')).toBe('ask')
  })

  it('rememberApproval always 对新工具添加 allow 规则', () => {
    // custom_tool 不在默认规则中，默认返回 ask
    expect(checkPermission('custom_tool')).toBe('ask')

    rememberApproval('custom_tool', 'always')

    expect(checkPermission('custom_tool')).toBe('allow')
  })

  it('rememberApproval always 后规则列表包含对应 allow 规则', () => {
    rememberApproval('edit', 'always')

    const rules = getPermissionRules()
    const editRule = rules.find((r) => r.tool === 'edit')
    expect(editRule?.action).toBe('allow')
  })
})

describe('checkPermissionWithPath — 路径感知权限检查', () => {
  const workspace = process.platform === 'win32' ? 'D:\\proj' : '/home/proj'
  const outsideFile = process.platform === 'win32'
    ? 'D:\\other\\file.txt'
    : '/home/other/file.txt'
  const insideFile = process.platform === 'win32'
    ? 'D:\\proj\\src\\index.ts'
    : '/home/proj/src/index.ts'

  beforeEach(() => {
    memoryStore.clear()
    setPermissionRules([...DEFAULT_PERMISSION_RULES])
    setAllowedDirectories([])
  })

  it('工作区内的 write_file 应返回 allow（无需询问）', () => {
    // write_file 默认是 ask，但工作区内应自动允许
    expect(checkPermissionWithPath('write_file', insideFile, workspace)).toBe('allow')
  })

  it('工作区内的 edit 应返回 allow（无需询问）', () => {
    expect(checkPermissionWithPath('edit', insideFile, workspace)).toBe('allow')
  })

  it('工作区外的 write_file 应返回 ask（需询问）', () => {
    expect(checkPermissionWithPath('write_file', outsideFile, workspace)).toBe('ask')
  })

  it('工作区外的 edit 应返回 ask（需询问）', () => {
    expect(checkPermissionWithPath('edit', outsideFile, workspace)).toBe('ask')
  })

  it('read_file 无论路径内外都返回 allow', () => {
    expect(checkPermissionWithPath('read_file', insideFile, workspace)).toBe('allow')
    expect(checkPermissionWithPath('read_file', outsideFile, workspace)).toBe('allow')
  })

  it('白名单目录内的 write_file 应返回 allow', () => {
    const allowedDir = process.platform === 'win32' ? 'D:\\other' : '/home/other'
    setAllowedDirectories([allowedDir])
    expect(checkPermissionWithPath('write_file', outsideFile, workspace)).toBe('allow')
  })

  it('无 targetPath 时回退到工具级规则', () => {
    expect(checkPermissionWithPath('write_file', undefined, workspace)).toBe('ask')
  })

  it('deny 规则优先于路径检查', () => {
    setPermissionRules([
      { tool: 'write_file', action: 'deny' },
      ...DEFAULT_PERMISSION_RULES,
    ])
    expect(checkPermissionWithPath('write_file', insideFile, workspace)).toBe('deny')
  })
})

describe('rememberApprovalWithPath — 目录级白名单', () => {
  const workspace = process.platform === 'win32' ? 'D:\\proj' : '/home/proj'
  const outsideFile = process.platform === 'win32'
    ? 'D:\\other\\sub\\file.txt'
    : '/home/other/sub/file.txt'
  const expectedDir = process.platform === 'win32' ? 'D:\\other\\sub' : '/home/other/sub'

  beforeEach(() => {
    memoryStore.clear()
    setPermissionRules([...DEFAULT_PERMISSION_RULES])
    setAllowedDirectories([])
  })

  it('always + 工作区外路径 → 将目标目录加入白名单', () => {
    rememberApprovalWithPath('write_file', 'always', outsideFile, workspace)

    const allowed = getAllowedDirectories()
    expect(allowed).toContain(expectedDir)
  })

  it('always + 工作区内路径 → 不修改白名单（已在默认允许范围）', () => {
    const insideFile = process.platform === 'win32'
      ? 'D:\\proj\\src\\file.txt'
      : '/home/proj/src/file.txt'
    rememberApprovalWithPath('write_file', 'always', insideFile, workspace)

    const allowed = getAllowedDirectories()
    expect(allowed).not.toContain(expect.any(String))
    expect(allowed).toHaveLength(0)
  })

  it('once 不修改白名单', () => {
    rememberApprovalWithPath('write_file', 'once', outsideFile, workspace)

    const allowed = getAllowedDirectories()
    expect(allowed).toHaveLength(0)
  })

  it('reject 不修改白名单', () => {
    rememberApprovalWithPath('write_file', 'reject', outsideFile, workspace)

    const allowed = getAllowedDirectories()
    expect(allowed).toHaveLength(0)
  })

  it('同一目录重复 always 不产生重复条目', () => {
    rememberApprovalWithPath('write_file', 'always', outsideFile, workspace)
    rememberApprovalWithPath('edit', 'always', outsideFile, workspace)

    const allowed = getAllowedDirectories()
    const matchingDirs = allowed.filter((d) => d === expectedDir)
    expect(matchingDirs).toHaveLength(1)
  })

  it('无 targetPath 时回退到工具级 rememberApproval', () => {
    rememberApprovalWithPath('write_file', 'always', undefined, workspace)
    // 工具级规则应被修改为 allow
    expect(checkPermission('write_file')).toBe('allow')
    // 白名单不变
    expect(getAllowedDirectories()).toHaveLength(0)
  })
})

describe('addAllowedDirectory — 白名单目录管理', () => {
  beforeEach(() => {
    memoryStore.clear()
    setAllowedDirectories([])
  })

  it('添加新目录到白名单', () => {
    const dir = process.platform === 'win32' ? 'D:\\newDir' : '/home/newDir'
    addAllowedDirectory(dir)
    expect(getAllowedDirectories()).toContain(dir)
  })

  it('重复添加同一目录不产生重复', () => {
    const dir = process.platform === 'win32' ? 'D:\\dup' : '/home/dup'
    addAllowedDirectory(dir)
    addAllowedDirectory(dir)
    const allowed = getAllowedDirectories()
    expect(allowed.filter((d) => d === dir)).toHaveLength(1)
  })
})

describe('allowReadOutsideWorkspace — 一键开启读取工作区外文件', () => {
  const workspace = process.platform === 'win32' ? 'D:\\proj' : '/home/proj'
  const outsideFile = process.platform === 'win32'
    ? 'D:\\other\\file.txt'
    : '/home/other/file.txt'
  const insideFile = process.platform === 'win32'
    ? 'D:\\proj\\src\\index.ts'
    : '/home/proj/src/index.ts'

  beforeEach(() => {
    memoryStore.clear()
    setPermissionRules([...DEFAULT_PERMISSION_RULES])
    setAllowedDirectories([])
  })

  it('默认开启（true）：读取类工具在工作区外返回 allow', () => {
    expect(getAllowReadOutsideWorkspace()).toBe(true)
    expect(checkPermissionWithPath('read_file', outsideFile, workspace)).toBe('allow')
  })

  it('关闭开关后：读取类工具在工作区外返回 ask', () => {
    setAllowReadOutsideWorkspace(false)
    expect(getAllowReadOutsideWorkspace()).toBe(false)
    expect(checkPermissionWithPath('read_file', outsideFile, workspace)).toBe('ask')
  })

  it('关闭开关后：读取类工具在工作区内仍返回 allow', () => {
    setAllowReadOutsideWorkspace(false)
    expect(checkPermissionWithPath('read_file', insideFile, workspace)).toBe('allow')
  })

  it('关闭开关后：写入类工具在工作区外仍返回 ask（不受开关影响）', () => {
    setAllowReadOutsideWorkspace(false)
    expect(checkPermissionWithPath('write_file', outsideFile, workspace)).toBe('ask')
  })

  it('关闭开关后：写入类工具在工作区内仍返回 allow', () => {
    setAllowReadOutsideWorkspace(false)
    expect(checkPermissionWithPath('write_file', insideFile, workspace)).toBe('allow')
  })

  it('开启开关后：list_files / search_files / grep 在工作区外也 allow', () => {
    setAllowReadOutsideWorkspace(true)
    expect(checkPermissionWithPath('list_files', outsideFile, workspace)).toBe('allow')
    expect(checkPermissionWithPath('search_files', outsideFile, workspace)).toBe('allow')
    expect(checkPermissionWithPath('grep', outsideFile, workspace)).toBe('allow')
  })

  it('开关状态持久化：设置后再次读取应一致', () => {
    setAllowReadOutsideWorkspace(false)
    expect(getAllowReadOutsideWorkspace()).toBe(false)
    setAllowReadOutsideWorkspace(true)
    expect(getAllowReadOutsideWorkspace()).toBe(true)
  })
})

describe('安全修复 — write 工具设为 allow 后仍检查路径', () => {
  const workspace = process.platform === 'win32' ? 'D:\\proj' : '/home/proj'
  const insideFile = process.platform === 'win32'
    ? 'D:\\proj\\src\\index.ts'
    : '/home/proj/src/index.ts'
  const outsideFile = process.platform === 'win32'
    ? 'D:\\other\\file.txt'
    : '/home/other/file.txt'
  const outsideFile2 = process.platform === 'win32'
    ? 'E:\\secret\\key.txt'
    : '/etc/secret/key.txt'

  beforeEach(() => {
    memoryStore.clear()
    setPermissionRules([...DEFAULT_PERMISSION_RULES])
    setAllowedDirectories([])
  })

  it('write_file 被全局设为 allow 后，工作区内仍返回 allow', () => {
    rememberApproval('write_file', 'always')
    expect(checkPermissionWithPath('write_file', insideFile, workspace)).toBe('allow')
  })

  it('write_file 被全局设为 allow 后，工作区外路径仍应返回 ask', () => {
    rememberApproval('write_file', 'always')
    // 不能因为全局 allow 就放行工作区外写入
    expect(checkPermissionWithPath('write_file', outsideFile, workspace)).toBe('ask')
  })

  it('edit 被全局设为 allow 后，工作区外路径仍应返回 ask', () => {
    rememberApproval('edit', 'always')
    expect(checkPermissionWithPath('edit', outsideFile, workspace)).toBe('ask')
  })

  it('write_file allow + 白名单内路径 → allow', () => {
    rememberApproval('write_file', 'always')
    const allowedDir = process.platform === 'win32' ? 'D:\\other' : '/home/other'
    setAllowedDirectories([allowedDir])
    expect(checkPermissionWithPath('write_file', outsideFile, workspace)).toBe('allow')
  })

  it('write_file allow + 白名单外的工作区外路径 → ask', () => {
    rememberApproval('write_file', 'always')
    const allowedDir = process.platform === 'win32' ? 'D:\\other' : '/home/other'
    setAllowedDirectories([allowedDir])
    // outsideFile2 不在白名单内
    expect(checkPermissionWithPath('write_file', outsideFile2, workspace)).toBe('ask')
  })

  it('run_command 设为 allow 后无路径信息 → allow', () => {
    rememberApproval('run_command', 'always')
    // run_command 无 path 参数，应放行
    expect(checkPermissionWithPath('run_command', undefined, workspace)).toBe('allow')
  })
})
