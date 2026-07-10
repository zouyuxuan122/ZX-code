import { describe, it, expect } from 'vitest'
import { resolveSafePath, isWithin } from '../../../../main/tools/builtin/path.util'

describe('resolveSafePath — 外部目录白名单支持', () => {
  const workspace = process.platform === 'win32' ? 'D:\\proj' : '/home/proj'

  it('工作区内路径合法', () => {
    const result = resolveSafePath('src/index.ts', workspace)
    expect(result).not.toBeNull()
  })

  it('工作区外路径默认拒绝（无白名单）', () => {
    const outside = process.platform === 'win32' ? 'C:\\Windows\\system32\\config' : '/etc/hosts'
    const result = resolveSafePath(outside, workspace)
    expect(result).toBeNull()
  })

  it('白名单目录内的路径合法', () => {
    const allowed = process.platform === 'win32' ? 'D:\\other' : '/home/other'
    const target = process.platform === 'win32' ? 'D:\\other\\file.txt' : '/home/other/file.txt'
    const result = resolveSafePath(target, workspace, [allowed])
    expect(result).not.toBeNull()
  })

  it('白名单目录的子目录路径合法', () => {
    const allowed = process.platform === 'win32' ? 'D:\\lib' : '/home/lib'
    const target = process.platform === 'win32' ? 'D:\\lib\\sub\\deep.ts' : '/home/lib/sub/deep.ts'
    const result = resolveSafePath(target, workspace, [allowed])
    expect(result).not.toBeNull()
  })

  it('不在任何白名单内的外部路径仍被拒绝', () => {
    const allowed = process.platform === 'win32' ? 'D:\\lib' : '/home/lib'
    const target = process.platform === 'win32' ? 'C:\\Windows\\system32\\config' : '/etc/hosts'
    const result = resolveSafePath(target, workspace, [allowed])
    expect(result).toBeNull()
  })

  it('空白名单数组等同于无白名单', () => {
    const outside = process.platform === 'win32' ? 'D:\\outside\\file.txt' : '/tmp/outside.txt'
    const result = resolveSafePath(outside, workspace, [])
    expect(result).toBeNull()
  })

  it('非法路径始终返回 null', () => {
    expect(resolveSafePath('', workspace)).toBeNull()
    // @ts-expect-error 测试非法类型
    expect(resolveSafePath(null, workspace)).toBeNull()
  })
})

describe('resolveSafePath — 允许访问工作区外的本地文件', () => {
  const workspace = process.platform === 'win32' ? 'D:\\proj' : '/home/proj'

  it('工作区外的绝对路径应被解析为规范化路径（不再返回 null）', () => {
    const outside = process.platform === 'win32'
      ? 'C:\\Users\\test\\Documents\\file.txt'
      : '/home/test/Documents/file.txt'
    const result = resolveSafePath(outside, workspace, undefined, true)
    expect(result).not.toBeNull()
    expect(result).toBe(process.platform === 'win32'
      ? 'C:\\Users\\test\\Documents\\file.txt'
      : '/home/test/Documents/file.txt')
  })

  it('工作区外的相对路径（含 .. 跨越）应被解析为绝对路径', () => {
    const result = resolveSafePath('../other/file.txt', workspace, undefined, true)
    expect(result).not.toBeNull()
    expect(result).toBe(process.platform === 'win32'
      ? 'D:\\other\\file.txt'
      : '/home/other/file.txt')
  })

  it('allowOutside=true 时空白名单不影响解析', () => {
    const outside = process.platform === 'win32' ? 'E:\\data\\config.json' : '/var/data/config.json'
    const result = resolveSafePath(outside, workspace, [], true)
    expect(result).not.toBeNull()
  })

  it('allowOutside=true 时非法路径仍返回 null', () => {
    expect(resolveSafePath('', workspace, undefined, true)).toBeNull()
    // @ts-expect-error 测试非法类型
    expect(resolveSafePath(null, workspace, undefined, true)).toBeNull()
  })
})

describe('isWithin — 路径边界判断', () => {
  it('工作区内的路径返回 true', () => {
    const workspace = process.platform === 'win32' ? 'D:\\proj' : '/home/proj'
    const file = process.platform === 'win32' ? 'D:\\proj\\src\\index.ts' : '/home/proj/src/index.ts'
    expect(isWithin(file, workspace)).toBe(true)
  })

  it('工作区外的路径返回 false', () => {
    const workspace = process.platform === 'win32' ? 'D:\\proj' : '/home/proj'
    const outside = process.platform === 'win32' ? 'C:\\Windows' : '/etc'
    expect(isWithin(outside, workspace)).toBe(false)
  })

  it('工作区根本身返回 true', () => {
    const workspace = process.platform === 'win32' ? 'D:\\proj' : '/home/proj'
    expect(isWithin(workspace, workspace)).toBe(true)
  })
})
