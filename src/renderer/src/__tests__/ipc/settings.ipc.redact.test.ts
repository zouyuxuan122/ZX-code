import { describe, it, expect } from 'vitest'
import { safeFormatSetting } from '../../../../main/utils/redact.util'

describe('settings.ipc — safeFormatSetting', () => {
  it('普通 key 应正常打印值', () => {
    expect(safeFormatSetting('theme', 'dark')).toBe('设置更新: theme = "dark"')
  })

  it('api_key 类 key 应脱敏值', () => {
    const out = safeFormatSetting('api_key', 'sk-secret-123456')
    expect(out).not.toContain('sk-secret-123456')
    expect(out).toContain('***')
  })

  it('包含 token 的 key 应脱敏值', () => {
    const out = safeFormatSetting('provider_token', 'bearer-xyz-789')
    expect(out).not.toContain('bearer-xyz-789')
    expect(out).toContain('***')
  })

  it('包含 secret 的 key 应脱敏值', () => {
    const out = safeFormatSetting('oauth_secret', 'super-secret-value')
    expect(out).not.toContain('super-secret-value')
    expect(out).toContain('***')
  })

  it('包含 password 的 key 应脱敏值', () => {
    const out = safeFormatSetting('db_password', 'p@ssw0rd')
    expect(out).not.toContain('p@ssw0rd')
    expect(out).toContain('***')
  })

  it('对象值中包含敏感 key 时也应脱敏', () => {
    const out = safeFormatSetting('provider_config', {
      name: 'openai',
      api_key: 'sk-leaked-key',
      base_url: 'https://api.openai.com',
    })
    expect(out).not.toContain('sk-leaked-key')
    expect(out).toContain('***')
    // 非敏感字段应保留
    expect(out).toContain('openai')
    expect(out).toContain('api.openai.com')
  })
})
