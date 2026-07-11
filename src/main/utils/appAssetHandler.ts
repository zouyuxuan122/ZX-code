/**
 * app-asset 协议处理器
 *
 * 将 app-asset:///path 映射为本地文件，支持 HTTP Range 请求。
 *
 * 重要：所有文件 I/O 必须使用异步 API（fs.promises），
 * 不能使用同步 API（fs.statSync / fs.readFileSync 等）。
 *
 * 原因：protocol.handle 回调在主进程事件循环中执行，
 * 同步 I/O 会阻塞事件循环，导致：
 * 1. UI 卡顿（窗口管理、渲染同步等全部阻塞）
 * 2. Audio 元素的 Range 请求排队，音频无法播放
 *
 * Range 支持是 Audio 元素正常播放的关键：
 * Audio 元素加载音频时会发送 Range: bytes=0- 请求，
 * 如果服务器不支持 Range（返回 200 而非 206），
 * Audio 元素会反复请求整个文件。
 */
import fs from 'fs'
import path from 'path'
import { parseRangeHeader } from './range'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.moc3': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
}

/** 文件大小上限 50MB，防止读取超大文件耗尽内存 */
const MAX_FILE_SIZE = 50 * 1024 * 1024

/**
 * 处理 app-asset:// 请求，将 URL 映射为本地文件并返回 Response。
 *
 * 使用异步文件 I/O（fs.promises）避免阻塞主进程事件循环。
 *
 * - 无 Range 头：返回 200 + 完整文件 + Content-Length + Accept-Ranges: bytes
 * - 有 Range 头：返回 206 + 部分数据 + Content-Range + Accept-Ranges: bytes
 * - 路径遍历：返回 403
 * - 文件不存在：返回 404
 * - 文件过大：返回 413
 */
export async function handleAppAssetRequest(request: Request): Promise<Response> {
  try {
    // app-asset:///C:/Users/.../img.png → 去掉 "app-asset://" 前缀
    const rawPath = decodeURIComponent(request.url.slice('app-asset://'.length))
    // 移除所有前导斜杠；Windows: C:/Users/... → C:\Users\...
    const filePath =
      process.platform === 'win32'
        ? rawPath.replace(/^\/+/, '').replace(/\//g, '\\')
        : rawPath.replace(/^\/+/, '/')

    // 安全校验：拒绝路径遍历
    const normalized = path.normalize(filePath)
    if (normalized.includes('..')) {
      return new Response(null, { status: 403 })
    }

    // 异步获取文件信息（不阻塞主进程）
    const stat = await fs.promises.stat(filePath)
    if (!stat.isFile()) {
      return new Response(null, { status: 404 })
    }
    if (stat.size > MAX_FILE_SIZE) {
      return new Response(null, { status: 413 })
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

    // 解析 Range 头
    const rangeHeader = request.headers.get('Range')
    const range = parseRangeHeader(rangeHeader, stat.size)

    if (range) {
      // Range 请求：返回 206 Partial Content + 部分数据
      const { start, end } = range
      const length = end - start + 1

      // 异步读取文件指定范围（不阻塞主进程）
      const fd = await fs.promises.open(filePath, 'r')
      try {
        const buffer = Buffer.alloc(length)
        await fd.read(buffer, 0, length, start)
        return new Response(buffer, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': String(length),
            'Accept-Ranges': 'bytes',
          },
        })
      } finally {
        await fd.close()
      }
    }

    // 无 Range 头：返回 200 + 完整文件
    // 异步读取整个文件（不阻塞主进程）
    const data = await fs.promises.readFile(filePath)
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes',
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
