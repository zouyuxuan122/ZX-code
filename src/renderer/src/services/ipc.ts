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

interface ElectronIpcRenderer {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

/**
 * 直接调用尚未在 IpcApi / preload api 中类型化的 IPC 通道。
 *
 * 用于 evolution / profile / cron / search:conversations / trace 等新通道，
 * 在 preload 正式暴露前的回退方案。任务要求：若 preload 未暴露新通道，
 * 使用 window.electron.ipcRenderer.invoke('channel:name', args) 直接调用。
 */
export function invokeRaw<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const electron = (
    window as unknown as { electron?: { ipcRenderer: ElectronIpcRenderer } }
  ).electron
  if (!electron?.ipcRenderer) {
    throw new Error(
      `[ipc] window.electron.ipcRenderer is not available for channel '${channel}'`,
    )
  }
  return electron.ipcRenderer.invoke(channel, ...args) as Promise<T>
}
