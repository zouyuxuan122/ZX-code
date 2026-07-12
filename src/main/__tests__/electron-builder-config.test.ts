import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * 验证 electron-builder.yml 配置不会阻止 exe 图标嵌入
 *
 * signAndEditExecutable: false 会导致 electron-builder 跳过 rcedit 步骤，
 * exe 将保留 Electron 默认图标而非用户指定的 favicon.ico。
 * 安装包图标由 NSIS 独立设置不受影响，这正是之前 bug 的表现：
 * 安装包图标正确，但 exe 文件图标是 Electron 默认图标。
 */
describe('electron-builder.yml 图标配置', () => {
  const configPath = 'd:\\ZX-CODE-FREE-PLUS\\electron-builder.yml'
  const content = readFileSync(configPath, 'utf-8')

  it('win.icon 指向 favicon.ico', () => {
    expect(content).toMatch(/icon:\s*resources\/icons\/favicon\.ico/)
  })

  it('signAndEditExecutable 不为 false（否则 rcedit 被跳过，exe 保留默认图标）', () => {
    // signAndEditExecutable 为 false 时，electron-builder 不会用 rcedit 设置 exe 图标
    // 导致 exe 文件在资源管理器中显示 Electron 默认图标
    const match = content.match(/signAndEditExecutable:\s*(\w+)/)
    if (match) {
      expect(match[1]).not.toBe('false')
    }
    // 如果未设置，默认为 true，也是正确的
  })
})
