interface Job {
  name: string
  intervalMs: number
  callback: () => void | Promise<void>
  timer: NodeJS.Timeout | null
}

/**
 * 后台调度器服务
 * 基于 setInterval 的定时任务调度器,支持注册多个 job
 */
export class SchedulerService {
  private jobs = new Map<string, Job>()

  /** 注册一个定时任务 */
  register(name: string, intervalMs: number, callback: () => void | Promise<void>): void {
    // 如果已存在,先停止
    if (this.jobs.has(name)) {
      this.stop(name)
    }
    this.jobs.set(name, { name, intervalMs, callback, timer: null })
  }

  /** 注销任务 */
  unregister(name: string): void {
    this.stop(name)
    this.jobs.delete(name)
  }

  /** 启动单个任务 */
  start(name: string): void {
    const job = this.jobs.get(name)
    if (!job) return
    if (job.timer) return // 已在运行
    job.timer = setInterval(() => {
      try {
        job.callback()
      } catch (err) {
        console.warn(`[Scheduler] job "${name}" 执行失败:`, err)
      }
    }, job.intervalMs)
  }

  /** 停止单个任务 */
  stop(name: string): void {
    const job = this.jobs.get(name)
    if (!job || !job.timer) return
    clearInterval(job.timer)
    job.timer = null
  }

  /** 启动所有已注册任务 */
  startAll(): void {
    for (const name of this.jobs.keys()) {
      this.start(name)
    }
  }

  /** 停止所有任务 */
  stopAll(): void {
    for (const name of this.jobs.keys()) {
      this.stop(name)
    }
  }

  /** 立即触发一次(不影响定时周期) */
  triggerNow(name: string): void {
    const job = this.jobs.get(name)
    if (!job) return
    try {
      job.callback()
    } catch (err) {
      console.warn(`[Scheduler] job "${name}" 立即触发失败:`, err)
    }
  }

  /** 获取所有任务名 */
  getJobNames(): string[] {
    return Array.from(this.jobs.keys())
  }

  /** 检查任务是否在运行 */
  isRunning(name: string): boolean {
    const job = this.jobs.get(name)
    return !!job?.timer
  }
}
