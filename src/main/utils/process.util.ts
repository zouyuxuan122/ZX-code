import { spawn, type ChildProcess } from 'child_process'

/**
 * 终止进程及其子进程树。
 *
 * Windows 上使用 `taskkill /pid XXX /T /F` 杀掉整个进程树
 * （因为 `shell: true` 启动的进程是 cmd.exe 的子进程，
 * `process.kill()` 只杀 cmd.exe，真正的服务进程会变孤儿）。
 *
 * 非 Windows 上使用 SIGTERM 优雅终止。
 */
export function killProcessTree(proc: ChildProcess): void {
  if (!proc.pid) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'])
    } else {
      proc.kill('SIGTERM')
    }
  } catch {
    // 忽略：进程可能已退出
  }
}
