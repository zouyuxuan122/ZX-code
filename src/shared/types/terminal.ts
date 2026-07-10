/** 终端支持的 shell 类型 */
export type TerminalShell = 'powershell' | 'cmd' | 'bash' | 'wsl'

/** 终端会话信息 */
export interface TerminalSession {
  id: string
  name: string
  shell: TerminalShell
  cwd: string
  running: boolean
  createdAt: number
}

/** 终端输出事件载荷 */
export interface TerminalOutputPayload {
  id: string
  data: string
}

/** 终端退出事件载荷 */
export interface TerminalExitPayload {
  id: string
  code: number | null
}

/** 终端相关 IPC API */
export interface TerminalApi {
  /** 创建一个终端会话，返回会话 ID */
  create: (shell: TerminalShell, cwd: string) => Promise<string>
  /** 向会话 stdin 写入数据 */
  write: (id: string, data: string) => Promise<void>
  /** 调整终端尺寸（spawn 模式下为存储，不真正生效） */
  resize: (id: string, cols: number, rows: number) => Promise<void>
  /** 终止会话 */
  kill: (id: string) => Promise<void>
  /** 列出所有活动会话 */
  list: () => Promise<TerminalSession[]>
  /** 获取会话最近的输出（用于 Agent 审阅终端输出） */
  getOutput: (id: string, lines?: number) => Promise<string>
}
