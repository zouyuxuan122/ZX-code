import { net } from 'electron'
import type { ChatParams, ChatChunk, ModelInfo, ProviderConfig } from '@shared/types/model'

/** 连接超时（首次响应等待） */
export const CONNECT_TIMEOUT_MS = 30_000
/** SSE 读取超时（两个 chunk 之间最大间隔） */
export const SSE_READ_TIMEOUT_MS = 60_000

/**
 * 选择可用的 fetch 函数。
 * 优先使用 Electron net.fetch（基于 Chromium 网络栈，尊重系统代理设置），
 * Electron 环境不可用时回退到 Node.js 原生 fetch。
 * 注意：net.fetch 的类型签名与 globalThis.fetch 略有不同（不接受 URL 实例），
 * 这里用宽松类型兼容两者。
 */
type FetchLike = (input: string | Request | URL, init?: RequestInit) => Promise<Response>
const fetchFn: FetchLike =
  typeof net !== 'undefined' && typeof net.fetch === 'function'
    ? (net.fetch as unknown as FetchLike)
    : (fetch as FetchLike)

export abstract class BaseProvider {
  protected config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  abstract get type(): string
  abstract listModels(): Promise<ModelInfo[]>
  abstract chat(params: ChatParams): AsyncGenerator<ChatChunk>

  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.config.api_key) {
      headers['Authorization'] = `Bearer ${this.config.api_key}`
    }
    return headers
  }

  /** 带超时的 fetch（使用 Electron net.fetch 尊重系统代理） */
  protected async fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number, externalSignal?: AbortSignal): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    // 外部 signal 联动：chat:stop 时 abort 底层 HTTP 请求
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort()
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    try {
      const response = await fetchFn(url, { ...options, signal: controller.signal })
      return response
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // 区分外部取消和超时
        if (externalSignal?.aborted) {
          throw new Error(`请求被取消 [${url}]`)
        }
        throw new Error(`请求超时 (${timeoutMs}ms) [${url}]`)
      }
      // 网络错误带上 URL 方便排查
      const msg = (err as Error).message || String(err)
      throw new Error(`网络请求失败 [${url}]: ${msg}`)
    } finally {
      clearTimeout(timer)
    }
  }

  protected async fetchJson(url: string, options: RequestInit, externalSignal?: AbortSignal): Promise<unknown> {
    const response = await this.fetchWithTimeout(url, options, CONNECT_TIMEOUT_MS, externalSignal)
    if (!response.ok) {
      const errorText = await response.text()
      // 错误信息带上实际请求的 URL，方便排查 404/路径拼接问题
      throw new Error(`HTTP ${response.status} [${url}]: ${errorText.slice(0, 500)}`)
    }
    return response.json()
  }

  protected async *fetchSSE(url: string, options: RequestInit, externalSignal?: AbortSignal): AsyncGenerator<string> {
    const response = await this.fetchWithTimeout(url, options, CONNECT_TIMEOUT_MS, externalSignal)
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status} [${url}]: ${errorText.slice(0, 500)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    // 注册 abort 监听器：当外部信号触发时（用户点击停止生成），
    // 主动取消 reader 以中断正在进行的 reader.read() 调用，
    // 否则流式读取会卡住直到服务端关闭连接或 SSE 读取超时。
    let abortListener: (() => void) | undefined
    if (externalSignal) {
      if (externalSignal.aborted) {
        // 信号已触发，直接取消 reader 并返回
        await reader.cancel()
        return
      }
      abortListener = () => {
        void reader.cancel()
      }
      externalSignal.addEventListener('abort', abortListener, { once: true })
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        // 检查 abort 信号：用户点击停止生成后应立即退出循环
        if (externalSignal?.aborted) {
          return
        }
        // 为每次 read 设置超时，防止服务端发了一半就卡住。
        // 关键：读取完成或抛出后必须清理定时器，否则长流式响应会累积大量未触发
        // 的定时器（每条消息数百个 chunk × N 条消息 → 数千个 pending timer），
        // 最终拖垮事件循环导致"对话超过一定次数后不再回复"。
        let timer: ReturnType<typeof setTimeout> | undefined
        const readPromise = reader.read()
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`SSE 读取超时 (${SSE_READ_TIMEOUT_MS}ms) [${url}]`)),
            SSE_READ_TIMEOUT_MS,
          )
        })
        try {
          const { done, value } = await Promise.race([
            readPromise as Promise<ReadableStreamReadResult<Uint8Array>>,
            timeoutPromise,
          ])
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('data: ')) {
              const data = trimmed.slice(6)
              if (data === '[DONE]') return
              yield data
            }
          }
        } finally {
          if (timer) clearTimeout(timer)
        }
      }
    } finally {
      if (abortListener && externalSignal) {
        externalSignal.removeEventListener('abort', abortListener)
      }
      reader.releaseLock()
    }
  }

  protected parseJsonSafely(json: string): unknown | null {
    try {
      return JSON.parse(json)
    } catch {
      return null
    }
  }
}
