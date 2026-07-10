/**
 * 极简 token 估算
 *
 * 不依赖 tiktoken（Electron 打包体积大且需要 WASM），
 * 用以下经验规则做粗略估算：
 * - 英文：约 4 字符 / token
 * - 中文：约 1.5 字符 / token（中文每个字符通常占 1-2 token）
 * - 混合：按字符类型加权
 *
 * 估算结果用于右侧栏进度条与压缩触发，不需要精确到 token。
 */

/** 单条字符串的 token 估算 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  let tokens = 0
  // 简单遍历：中文字符按 0.7 token/字，其他按 0.25 token/字符
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK 统一表意
      tokens += 0.7
    } else if (code >= 0x3000 && code <= 0x30ff) {
      // 日文假名、CJK 标点
      tokens += 0.7
    } else {
      tokens += 0.25
    }
  }
  // 至少 1 token（非空字符串）
  return Math.max(1, Math.round(tokens))
}

/** 估算 ChatMessage 数组的总 token */
export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0
  for (const msg of messages) {
    // 每条消息固定开销（角色标记、分隔符等约 4 token）
    total += 4
    total += estimateTokens(msg.content || '')
  }
  // 全局回复开销
  total += 3
  return total
}
