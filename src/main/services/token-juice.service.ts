export interface TokenJuiceConfig {
  enabled: boolean
  maxToolOutputChars: number
}

export interface CompressResult {
  output: string
  compressed: boolean
  originalLength: number
  compressedLength: number
}

// ANSI 转义码正则
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g
// 重复空行(3个及以上)压缩为2个
const MULTI_NEWLINE_REGEX = /\n{3,}/g

/**
 * 压缩工具输出
 * 策略:
 * 1. 去除 ANSI 终端转义码
 * 2. 压缩重复空行(3+→2)
 * 3. 若长度仍超 maxToolOutputChars,按行保留头尾,中间省略
 */
export function compressToolOutput(input: string, config: TokenJuiceConfig): CompressResult {
  const originalLength = input.length

  if (!config.enabled) {
    return { output: input, compressed: false, originalLength, compressedLength: input.length }
  }

  // 第一步:去除 ANSI 码
  let output = input.replace(ANSI_REGEX, '')

  // 第二步:压缩重复空行
  output = output.replace(MULTI_NEWLINE_REGEX, '\n\n')

  // 第三步:若仍超长,按行截断保留头尾
  if (output.length > config.maxToolOutputChars) {
    output = truncateWithHeadTail(output, config.maxToolOutputChars)
  }

  const compressedLength = output.length
  const compressed = compressedLength < originalLength

  if (compressed) {
    const reduction = ((1 - compressedLength / originalLength) * 100).toFixed(1)
    console.debug(`[TokenJuice] compressed ${originalLength} → ${compressedLength} chars (${reduction}% reduction)`)
  }

  return { output, compressed, originalLength, compressedLength }
}

/**
 * 按行保留头部和尾部,中间用省略映射替代
 */
function truncateWithHeadTail(text: string, maxChars: number): string {
  const lines = text.split('\n')
  if (lines.length <= 2) {
    // 行数太少,直接按字符截断
    return text.slice(0, maxChars)
  }

  // 预算分配:头部 40%,尾部 40%,中间 20% 用于省略标记
  const headBudget = Math.floor(maxChars * 0.4)
  const tailBudget = Math.floor(maxChars * 0.4)

  const headLines: string[] = []
  const tailLines: string[] = []
  let headChars = 0
  let tailChars = 0

  // 从头部收集
  for (let i = 0; i < lines.length; i++) {
    if (headChars + lines[i].length + 1 > headBudget) break
    headLines.push(lines[i])
    headChars += lines[i].length + 1
  }

  // 从尾部收集
  for (let i = lines.length - 1; i >= 0; i--) {
    if (tailChars + lines[i].length + 1 > tailBudget) break
    tailLines.unshift(lines[i])
    tailChars += lines[i].length + 1
  }

  const headEndIndex = headLines.length
  const tailStartIndex = lines.length - tailLines.length
  const omittedCount = tailStartIndex - headEndIndex

  if (omittedCount <= 0) {
    // 头尾重叠,直接返回原文(已在预算内)
    return text.slice(0, maxChars)
  }

  const omittedMarker = `\n... [已省略 ${omittedCount} 行,行 ${headEndIndex + 1}-${tailStartIndex}] ...\n`
  return headLines.join('\n') + omittedMarker + tailLines.join('\n')
}
