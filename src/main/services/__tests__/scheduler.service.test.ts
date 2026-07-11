import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SchedulerService } from '../scheduler.service'

describe('SchedulerService', () => {
  let scheduler: SchedulerService

  beforeEach(() => {
    vi.useFakeTimers()
    scheduler = new SchedulerService()
  })

  afterEach(() => {
    scheduler.stopAll()
    vi.useRealTimers()
  })

  it('注册 job 并按周期触发', () => {
    const callback = vi.fn()
    scheduler.register('test-job', 60000, callback) // 60 秒
    scheduler.start('test-job')

    // 推进 60 秒
    vi.advanceTimersByTime(60000)
    expect(callback).toHaveBeenCalledTimes(1)

    // 再推进 60 秒
    vi.advanceTimersByTime(60000)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('start 单个 job', () => {
    const callback = vi.fn()
    scheduler.register('job1', 1000, callback)
    scheduler.start('job1')
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('stop 单个 job 停止触发', () => {
    const callback = vi.fn()
    scheduler.register('job1', 1000, callback)
    scheduler.start('job1')
    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    scheduler.stop('job1')
    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(1) // 不再增加
  })

  it('stopAll 停止所有 job', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    scheduler.register('job1', 1000, cb1)
    scheduler.register('job2', 2000, cb2)
    scheduler.startAll()

    scheduler.stopAll()
    vi.advanceTimersByTime(10000)
    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).not.toHaveBeenCalled()
  })

  it('startAll 启动所有已注册 job', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    scheduler.register('job1', 1000, cb1)
    scheduler.register('job2', 2000, cb2)
    scheduler.startAll()

    vi.advanceTimersByTime(2000)
    expect(cb1).toHaveBeenCalled()
    expect(cb2).toHaveBeenCalled()
  })

  it('triggerNow 立即触发一次(不影响定时)', () => {
    const callback = vi.fn()
    scheduler.register('job1', 60000, callback)
    scheduler.start('job1')

    scheduler.triggerNow('job1')
    expect(callback).toHaveBeenCalledTimes(1)

    // 定时仍正常
    vi.advanceTimersByTime(60000)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('unregister 移除 job', () => {
    const callback = vi.fn()
    scheduler.register('job1', 1000, callback)
    scheduler.start('job1')
    scheduler.unregister('job1')

    vi.advanceTimersByTime(5000)
    expect(callback).not.toHaveBeenCalled()
  })

  it('注册不存在的 job 的操作不抛错', () => {
    expect(() => scheduler.start('nonexistent')).not.toThrow()
    expect(() => scheduler.stop('nonexistent')).not.toThrow()
    expect(() => scheduler.triggerNow('nonexistent')).not.toThrow()
  })
})
