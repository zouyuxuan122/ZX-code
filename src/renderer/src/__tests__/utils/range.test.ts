// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseRangeHeader } from '../../../../main/utils/range'

describe('parseRangeHeader — HTTP Range 请求解析', () => {
  it('无 Range 头应返回 null', () => {
    expect(parseRangeHeader(null, 1000)).toBeNull()
    expect(parseRangeHeader('', 1000)).toBeNull()
  })

  it('bytes=0- 应返回从 0 到文件末尾的范围', () => {
    const result = parseRangeHeader('bytes=0-', 1000)
    expect(result).toEqual({ start: 0, end: 999 })
  })

  it('bytes=0-1023 应返回精确范围', () => {
    const result = parseRangeHeader('bytes=0-1023', 2000)
    expect(result).toEqual({ start: 0, end: 1023 })
  })

  it('bytes=500- 应返回从 500 到文件末尾的范围', () => {
    const result = parseRangeHeader('bytes=500-', 1000)
    expect(result).toEqual({ start: 500, end: 999 })
  })

  it('end 超过文件大小时应截断到文件末尾', () => {
    const result = parseRangeHeader('bytes=0-9999', 1000)
    expect(result).toEqual({ start: 0, end: 999 })
  })

  it('bytes=-500 应返回最后 500 字节', () => {
    const result = parseRangeHeader('bytes=-500', 1000)
    expect(result).toEqual({ start: 500, end: 999 })
  })

  it('start 超过文件大小应返回 null', () => {
    expect(parseRangeHeader('bytes=2000-', 1000)).toBeNull()
  })

  it('非 bytes= 范围应返回 null', () => {
    expect(parseRangeHeader('items=0-10', 1000)).toBeNull()
  })

  it('空范围 bytes=- 应返回 null', () => {
    expect(parseRangeHeader('bytes=-', 1000)).toBeNull()
  })

  it('start 大于 end 应返回 null', () => {
    expect(parseRangeHeader('bytes=500-100', 1000)).toBeNull()
  })
})
