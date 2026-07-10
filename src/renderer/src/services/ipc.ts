import type { IpcApi } from '@shared/types/ipc'

export const ipc: IpcApi = (window as unknown as { api: IpcApi }).api
