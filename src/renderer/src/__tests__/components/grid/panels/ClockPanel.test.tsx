import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ClockPanel } from '@/components/grid/panels/ClockPanel'

describe('ClockPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-09T14:30:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('显示当前时间 HH:MM', () => {
    render(<ClockPanel />)
    expect(screen.getByTestId('clock-time')).toHaveTextContent('14:30')
  })

  it('显示当前日期与星期', () => {
    render(<ClockPanel />)
    expect(screen.getByTestId('clock-date')).toHaveTextContent(/7月/)
    expect(screen.getByTestId('clock-date')).toHaveTextContent(/09/)
    expect(screen.getByTestId('clock-date')).toHaveTextContent(/星期四/)
  })

  it('每秒更新时间', () => {
    render(<ClockPanel />)
    expect(screen.getByTestId('clock-time')).toHaveTextContent('14:30')
    act(() => { vi.advanceTimersByTime(65000) })
    expect(screen.getByTestId('clock-time')).toHaveTextContent('14:31')
  })
})
