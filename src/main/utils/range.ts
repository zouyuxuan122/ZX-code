/**
 * HTTP Range 请求解析工具
 *
 * 用于 app-asset 协议处理器支持 Audio 元素的 Range 请求。
 * Audio 元素在加载音频时会发送 `Range: bytes=0-` 请求，
 * 如果服务器不支持 Range，Audio 元素会反复请求整个文件，
 * 导致主进程被同步文件读取阻塞（卡顿）。
 */

/** 解析后的 Range 范围 */
export interface ByteRange {
  /** 起始字节（含） */
  start: number
  /** 结束字节（含） */
  end: number
}

/**
 * 解析 HTTP Range 头。
 *
 * 支持格式：
 * - `bytes=0-` （从字节 0 到文件末尾）
 * - `bytes=0-1023` （从字节 0 到 1023）
 * - `bytes=500-` （从字节 500 到文件末尾）
 *
 * 不支持的格式返回 null（服务器应忽略 Range 头，返回 200 OK）。
 *
 * @param rangeHeader Range 头的值，如 "bytes=0-1023"
 * @param fileSize 文件总大小（字节）
 * @returns 解析后的 ByteRange，或 null（无 Range 头或不支持）
 */
export function parseRangeHeader(rangeHeader: string | null, fileSize: number): ByteRange | null {
  if (!rangeHeader) return null

  // 仅支持 bytes= 范围
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return null

  const startStr = match[1]
  const endStr = match[2]

  let start: number
  let end: number

  if (startStr === '' && endStr === '') {
    // bytes=- 不合法
    return null
  }

  if (startStr === '') {
    // bytes=-500 → 最后 500 字节
    const suffixLength = parseInt(endStr, 10)
    if (isNaN(suffixLength) || suffixLength <= 0) return null
    start = Math.max(0, fileSize - suffixLength)
    end = fileSize - 1
  } else {
    start = parseInt(startStr, 10)
    if (isNaN(start) || start < 0 || start >= fileSize) return null

    if (endStr === '') {
      // bytes=0- → 从字节 0 到文件末尾
      end = fileSize - 1
    } else {
      end = parseInt(endStr, 10)
      if (isNaN(end) || end < start) return null
      // end 不能超过文件末尾
      end = Math.min(end, fileSize - 1)
    }
  }

  return { start, end }
}
