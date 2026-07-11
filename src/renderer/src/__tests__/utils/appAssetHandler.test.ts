// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { handleAppAssetRequest } from '../../../../main/utils/appAssetHandler'

/**
 * app-asset 协议处理器 Range 请求支持测试
 *
 * 卡顿根因：Audio 元素加载音频时发送 Range: bytes=0- 请求，
 * 旧处理器使用 fs.statSync / fs.readFileSync / fs.readSync 等同步 I/O，
 * 阻塞主进程事件循环，导致 UI 卡顿和音频无法播放。
 *
 * 修复：改为 async 函数，使用 fs.promises 异步 I/O。
 */
describe('handleAppAssetRequest — Range 请求支持', () => {
  let tmpDir: string
  let testFile: string
  let testContent: Buffer

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-asset-test-'))
    // 2000 字节的测试文件，内容为 0-255 循环
    testContent = Buffer.from(new Array(2000).fill(0).map((_, i) => i % 256))
    testFile = path.join(tmpDir, 'test.mp3')
    fs.writeFileSync(testFile, testContent)
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  /** 将本地路径转为 app-asset:// URL */
  function toAppAssetUrl(filePath: string): string {
    return 'app-asset:///' + filePath.replace(/\\/g, '/')
  }

  it('无 Range 头应返回 200 + Accept-Ranges + 完整文件', async () => {
    const request = new Request(toAppAssetUrl(testFile))
    const response = await handleAppAssetRequest(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    const data = Buffer.from(await response.arrayBuffer())
    expect(data).toEqual(testContent)
  })

  it('Range bytes=0-999 应返回 206 + Content-Range + 前 1000 字节', async () => {
    const request = new Request(toAppAssetUrl(testFile), {
      headers: { Range: 'bytes=0-999' },
    })
    const response = await handleAppAssetRequest(request)

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe(`bytes 0-999/${testContent.length}`)
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Length')).toBe('1000')
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    const data = Buffer.from(await response.arrayBuffer())
    expect(data).toEqual(testContent.slice(0, 1000))
  })

  it('Range bytes=500- 应返回 206 + 从 500 到末尾的部分数据', async () => {
    const request = new Request(toAppAssetUrl(testFile), {
      headers: { Range: 'bytes=500-' },
    })
    const response = await handleAppAssetRequest(request)

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe(
      `bytes 500-${testContent.length - 1}/${testContent.length}`,
    )
    expect(response.headers.get('Content-Length')).toBe(String(testContent.length - 500))
    const data = Buffer.from(await response.arrayBuffer())
    expect(data).toEqual(testContent.slice(500))
  })

  it('Range 只读取请求范围的数据，不读取整个文件', async () => {
    // 验证返回的数据长度等于请求范围长度（而非整个文件）
    const request = new Request(toAppAssetUrl(testFile), {
      headers: { Range: 'bytes=100-199' },
    })
    const response = await handleAppAssetRequest(request)

    expect(response.status).toBe(206)
    const data = Buffer.from(await response.arrayBuffer())
    expect(data.length).toBe(100)
    expect(data).toEqual(testContent.slice(100, 200))
  })

  it('图片文件无 Range 头也应返回 Accept-Ranges', async () => {
    const imgFile = path.join(tmpDir, 'test.png')
    fs.writeFileSync(imgFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const request = new Request(toAppAssetUrl(imgFile))
    const response = await handleAppAssetRequest(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Type')).toBe('image/png')
  })

  it('不存在的文件应返回 404', async () => {
    const request = new Request(toAppAssetUrl(path.join(tmpDir, 'no-such-file.mp3')))
    const response = await handleAppAssetRequest(request)
    expect(response.status).toBe(404)
  })
})

describe('handleAppAssetRequest — 异步非阻塞 I/O', () => {
  let tmpDir: string
  let testFile: string
  let testContent: Buffer

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-asset-async-test-'))
    testContent = Buffer.from(new Array(2000).fill(0).map((_, i) => i % 256))
    testFile = path.join(tmpDir, 'test.mp3')
    fs.writeFileSync(testFile, testContent)
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function toAppAssetUrl(filePath: string): string {
    return 'app-asset:///' + filePath.replace(/\\/g, '/')
  }

  it('应返回 Promise（异步执行，不阻塞主进程事件循环）', async () => {
    const request = new Request(toAppAssetUrl(testFile))
    const result = handleAppAssetRequest(request)
    // 必须是 Promise，否则同步 I/O 会阻塞主进程
    expect(result).toBeInstanceOf(Promise)
    await result
  })

  it('Range 请求也应返回 Promise（异步执行）', async () => {
    const request = new Request(toAppAssetUrl(testFile), {
      headers: { Range: 'bytes=0-999' },
    })
    const result = handleAppAssetRequest(request)
    expect(result).toBeInstanceOf(Promise)
    await result
  })

  it('不存在的文件也应返回 Promise（异步错误处理）', async () => {
    const request = new Request(toAppAssetUrl(path.join(tmpDir, 'no-such-file.mp3')))
    const result = handleAppAssetRequest(request)
    expect(result).toBeInstanceOf(Promise)
    const response = await result
    expect(response.status).toBe(404)
  })
})

describe('handleAppAssetRequest — Content-Length 头', () => {
  let tmpDir: string
  let testFile: string
  let testContent: Buffer

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-asset-clen-test-'))
    testContent = Buffer.from(new Array(2000).fill(0).map((_, i) => i % 256))
    testFile = path.join(tmpDir, 'test.mp3')
    fs.writeFileSync(testFile, testContent)
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function toAppAssetUrl(filePath: string): string {
    return 'app-asset:///' + filePath.replace(/\\/g, '/')
  }

  it('无 Range 头应返回 Content-Length（Audio 元素需要它来确定音频长度）', async () => {
    const request = new Request(toAppAssetUrl(testFile))
    const response = await handleAppAssetRequest(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Length')).toBe(String(testContent.length))
  })

  it('Range 请求应返回正确的 Content-Length', async () => {
    const request = new Request(toAppAssetUrl(testFile), {
      headers: { Range: 'bytes=0-999' },
    })
    const response = await handleAppAssetRequest(request)

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Length')).toBe('1000')
  })
})
