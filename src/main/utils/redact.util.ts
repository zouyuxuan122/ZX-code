/**
 * 凭证脱敏工具：用于日志中防止 API key / token / 密码等敏感信息泄露。
 * 独立于 electron 模块，便于单元测试。
 */

/** 判断设置 key 是否为敏感凭证字段 */
const SENSITIVE_KEY_RE = /(api[_-]?key|token|secret|password|passwd|credential|cookie|authorization)/i

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key)
}

/**
 * 递归脱敏对象中的敏感字段值。
 * 对 key 匹配敏感模式的字段，值替换为 '***'。
 */
export function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(redactValue)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? '***' : redactValue(v)
    }
    return out
  }
  return value
}

/**
 * 安全格式化设置更新日志。
 * 敏感 key 的值脱敏为 ***；对象值中嵌套的敏感字段同样脱敏。
 */
export function safeFormatSetting(key: string, value: unknown): string {
  if (isSensitiveKey(key)) {
    return `设置更新: ${key} = ***`
  }
  const safeValue = typeof value === 'object' && value !== null
    ? redactValue(value)
    : value
  return `设置更新: ${key} = ${JSON.stringify(safeValue)}`
}
