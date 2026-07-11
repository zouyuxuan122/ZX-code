import type { IpcApi } from '@shared/types/ipc'

/**
 * 使用 Proxy 延迟访问 window.api，避免模块加载时 window.api 尚未注入的问题。
 * 测试中通过 Object.defineProperty(window, 'api', ...) 或 vi.mock 均可正常工作。
 */
export const ipc: IpcApi = new Proxy({} as IpcApi, {
  get(_target, prop: string) {
    const api = (window as unknown as { api?: IpcApi }).api
    if (!api) {
      throw new Error(`[ipc] window.api is not available when accessing '${prop}'`)
    }
    return api[prop as keyof IpcApi]
  },
})
