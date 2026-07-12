import { CronExpressionParser } from 'cron-parser'

interface Job {
  name: string
  intervalMs: number
  callback: () => void | Promise<void>
  timer: NodeJS.Timeout | null
  /** 若设置则使用 cron 表达式调度（基于 setTimeout 递归），忽略 intervalMs */
  cronExpression?: string
}

/**
 * 后台调度器服务
 * 基于 setInterval 的定时任务调度器,支持注册多个 job
 * 也支持基于 cron 表达式的调度（registerCronJob）
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

  /**
   * 注册一个基于 cron 表达式的定时任务
   * 解析 5 字段 cron 表达式，用 setTimeout 在下一次触发时间执行，然后重新调度
   * @returns true 表示注册成功，false 表示表达式无效
   */
  registerCronJob(name: string, cronExpression: string, callback: () => void | Promise<void>): boolean {
    // 校验表达式
    try {
      CronExpressionParser.parse(cronExpression)
    } catch {
      return false
    }
    // 如果已存在,先停止
    if (this.jobs.has(name)) {
      this.stop(name)
    }
    this.jobs.set(name, { name, intervalMs: 0, callback, timer: null, cronExpression })
    return true
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
    if (job.cronExpression) {
      this.startCronJob(job)
    } else {
      job.timer = setInterval(() => {
        try {
          job.callback()
        } catch (err) {
          console.warn(`[Scheduler] job "${name}" 执行失败:`, err)
        }
      }, job.intervalMs)
    }
  }

  /** 启动 cron 任务：setTimeout 到下次触发时间，执行后重新调度 */
  private startCronJob(job: Job): void {
    const scheduleNext = () => {
      let delay: number
      try {
        const iter = CronExpressionParser.parse(job.cronExpression!, { currentDate: new Date() })
        const next = iter.next()
        delay = next.getTime() - Date.now()
        if (delay < 0) delay = 0
      } catch (err) {
        console.warn(`[Scheduler] cron job "${job.name}" 解析失败:`, err)
        return
      }
      job.timer = setTimeout(async () => {
        try {
          await job.callback()
        } catch (err) {
          console.warn(`[Scheduler] cron job "${job.name}" 执行失败:`, err)
        }
        // 执行完成后重新调度下一次
        job.timer = null
        if (this.jobs.has(job.name)) {
          this.startCronJob(job)
        }
      }, delay)
    }
    scheduleNext()
  }

  /** 停止单个任务 */
  stop(name: string): void {
    const job = this.jobs.get(name)
    if (!job || !job.timer) return
    clearTimeout(job.timer)
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
