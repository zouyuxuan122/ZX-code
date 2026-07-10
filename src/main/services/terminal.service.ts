import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { logger } from './logger.service'
import type { TerminalSession, TerminalShell } from '@shared/types/terminal'

/**
 * 生成终端会话 ID。
 * 使用 Date.now() + Math.random() 而非 nanoid，避免 ESM-only 包在
 * CommonJS 主进程中的 require() 兼容性问题。
 */
function generateSessionId(): string {
  return `term_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** 终端输出事件载荷 */
export interface TerminalOutputEvent {
  id: string
  data: string
}

/** 终端退出事件载荷 */
export interface TerminalExitEvent {
  id: string
  code: number | null
}

/** 单个会话的内部状态 */
interface SessionEntry {
  id: string
  name: string
  shell: TerminalShell
  cwd: string
  process: ChildProcess
  running: boolean
  createdAt: number
  /** 终端尺寸（spawn 模式下仅存储，不真正生效） */
  cols: number
  rows: number
  /** 输出缓冲（用于在监听者附加前累积数据，避免丢失启动期输出） */
  buffer: string[]
}

/** 默认终端尺寸 */
const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

/** Git Bash 在 Windows 上的常见安装路径 */
const GIT_BASH_PATHS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  // Scoop / Chocolatey 等包管理器安装路径
  'C:\\Users\\' + (process.env.USERNAME || '') + '\\scoop\\apps\\git\\current\\bin\\bash.exe',
]

/** 解析 shell 启动命令 */
function resolveShellCommand(shell: TerminalShell): { command: string; args: string[] } {
  switch (shell) {
    case 'powershell':
      return { command: 'powershell.exe', args: ['-NoProfile', '-NoLogo'] }
    case 'cmd':
      return { command: 'cmd.exe', args: [] }
    case 'bash': {
      // Windows 上优先尝试 Git Bash
      if (process.platform === 'win32') {
        for (const p of GIT_BASH_PATHS) {
          if (p && fs.existsSync(p)) {
            return { command: p, args: ['--login', '-i'] }
          }
        }
      }
      return { command: 'bash', args: ['--login', '-i'] }
    }
    case 'wsl': {
      // WSL：通过 wsl.exe 启动默认发行版的默认 shell
      return { command: 'wsl.exe', args: ['--shell-type', 'login'] }
    }
    default:
      return { command: 'powershell.exe', args: ['-NoProfile', '-NoLogo'] }
  }
}

/** shell 显示名 */
const SHELL_LABEL: Record<TerminalShell, string> = {
  powershell: 'PowerShell',
  cmd: 'CMD',
  bash: 'Bash',
  wsl: 'WSL',
}

/**
 * 终端会话管理服务
 *
 * 使用 child_process.spawn 启动 shell 进程，并通过 EventEmitter 把 stdout/stderr/exit
 * 事件转发给调用方（通常是 IPC 层）。由于不使用 node-pty，无法做真正的 PTY 尺寸调整，
 * 但仍能完成命令执行与输出审阅的核心需求。
 */
class TerminalService {
  private sessions = new Map<string, SessionEntry>()
  private emitter = new EventEmitter()

  /**
   * 创建一个新的终端会话
   * @returns 会话 ID
   */
  createSession(shell: TerminalShell, cwd: string): string {
    const id = generateSessionId()
    const { command, args } = resolveShellCommand(shell)

    // 工作目录校验：不存在则回退到用户主目录
    let workingCwd = cwd
    if (!workingCwd || !fs.existsSync(workingCwd)) {
      workingCwd = process.env.USERPROFILE || process.env.HOME || process.cwd()
    }

    logger.info(`[terminal] 创建会话 id=${id} shell=${shell} cwd=${workingCwd}`)

    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      // 让 PowerShell/CMD 在交互场景下输出更友好的编码
      PYTHONIOENCODING: 'utf-8',
    }

    const child = spawn(command, args, {
      cwd: workingCwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Windows 上不使用 detached，避免进程组管理带来的复杂清理
      detached: false,
      shell: false,
    })

    const entry: SessionEntry = {
      id,
      name: SHELL_LABEL[shell],
      shell,
      cwd: workingCwd,
      process: child,
      running: true,
      createdAt: Date.now(),
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      buffer: [],
    }
    this.sessions.set(id, entry)

    const handleData = (data: Buffer) => {
      const text = data.toString('utf-8')
      entry.buffer.push(text)
      // 限制缓冲长度，避免长会话内存膨胀
      if (entry.buffer.length > 64) {
        entry.buffer.splice(0, entry.buffer.length - 64)
      }
      this.emitter.emit('output', { id, data: text } satisfies TerminalOutputEvent)
    }

    child.stdout?.on('data', handleData)
    child.stderr?.on('data', handleData)

    child.on('exit', (code, signal) => {
      entry.running = false
      const exitCode = code ?? (signal ? null : 0)
      logger.info(`[terminal] 会话退出 id=${id} code=${exitCode} signal=${signal ?? ''}`)
      this.emitter.emit('exit', { id, code: exitCode } satisfies TerminalExitEvent)
    })

    child.on('error', (err) => {
      entry.running = false
      logger.error(`[terminal] 会话错误 id=${id}: ${err.message}`, err)
      this.emitter.emit('output', {
        id,
        data: `\r\n\x1b[31m[进程错误] ${err.message}\x1b[0m\r\n`,
      } satisfies TerminalOutputEvent)
      this.emitter.emit('exit', { id, code: null } satisfies TerminalExitEvent)
    })

    return id
  }

  /** 向会话 stdin 写入数据 */
  writeToSession(id: string, data: string): void {
    const entry = this.sessions.get(id)
    if (!entry) {
      logger.warn(`[terminal] writeToSession 找不到会话: ${id}`)
      return
    }
    if (!entry.process.stdin || entry.process.stdin.destroyed) {
      return
    }
    entry.process.stdin.write(data)
  }

  /**
   * 调整终端尺寸
   * 注意：spawn 模式下没有真正的 PTY，这里仅记录尺寸供后续参考
   */
  resizeSession(id: string, cols: number, rows: number): void {
    const entry = this.sessions.get(id)
    if (!entry) return
    entry.cols = Math.max(1, Math.floor(cols))
    entry.rows = Math.max(1, Math.floor(rows))
  }

  /** 终止会话 */
  killSession(id: string): void {
    const entry = this.sessions.get(id)
    if (!entry) {
      logger.warn(`[terminal] killSession 找不到会话: ${id}`)
      return
    }
    if (entry.running) {
      try {
        // Windows 上 tree-kill 比较麻烦，这里直接 kill 主进程
        if (process.platform === 'win32') {
          // taskkill /pid XXX /T /F 可以杀掉子进程树
          spawn('taskkill', ['/pid', String(entry.process.pid), '/T', '/F'])
        } else {
          entry.process.kill('SIGKILL')
        }
      } catch (err) {
        logger.error(`[terminal] 终止会话失败 id=${id}: ${(err as Error).message}`, err as Error)
      }
    }
    this.sessions.delete(id)
  }

  /**
   * 终止所有会话并清理。
   * 在应用退出（before-quit）或窗口关闭时调用，防止 shell 子进程泄漏。
   */
  disposeAll(): void {
    const ids = Array.from(this.sessions.keys())
    for (const id of ids) {
      this.killSession(id)
    }
    if (ids.length > 0) {
      logger.info(`[terminal] disposeAll 已清理 ${ids.length} 个会话`)
    }
  }

  /** 列出所有活动会话 */
  listSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).map((e) => ({
      id: e.id,
      name: e.name,
      shell: e.shell,
      cwd: e.cwd,
      running: e.running,
      createdAt: e.createdAt,
    }))
  }

  /**
   * 获取会话最近的输出（用于 Agent 审阅终端输出）
   * @param id 会话 ID
   * @param maxLines 最多返回的行数（从末尾截取），默认 100
   * @returns 纯文本输出（已去除 ANSI 转义序列）
   */
  getRecentOutput(id: string, maxLines = 100): string {
    const entry = this.sessions.get(id)
    if (!entry) return ''
    const raw = entry.buffer.join('')
    // 去除 ANSI 转义序列（颜色、光标移动等）
    const clean = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
    const lines = clean.split('\n')
    return lines.slice(-maxLines).join('\n')
  }

  /** 注册输出事件回调 */
  onOutput(callback: (e: TerminalOutputEvent) => void): () => void {
    this.emitter.on('output', callback)
    return () => this.emitter.off('output', callback)
  }

  /** 注册退出事件回调 */
  onExit(callback: (e: TerminalExitEvent) => void): () => void {
    this.emitter.on('exit', callback)
    return () => this.emitter.off('exit', callback)
  }
}

/** 终端服务单例 */
export const terminalService = new TerminalService()
