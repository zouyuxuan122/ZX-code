import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// 捕获 motion.span 接收到的 props
const capturedMotionSpanProps: Record<string, unknown>[] = []
vi.mock('framer-motion', () => ({
  motion: {
    span: (props: Record<string, unknown>) => {
      capturedMotionSpanProps.push(props)
      return null
    },
  },
}))

import { Toggle } from '@/components/ui/Toggle'

afterEach(() => {
  cleanup()
  capturedMotionSpanProps.length = 0
})

/**
 * 开关按钮白点位置测试
 *
 * Bug 描述：用户关闭再打开开关时，白色圆点一直锁在左边，不随 checked 状态移动。
 * 根因：motion.span 同时使用 layout 属性和 style.transform，framer-motion 的
 *       layout 动画会接管 transform，导致手动设置的 transform 不生效或被缓存。
 *
 * 由于 jsdom 没有布局引擎，layout 属性的冲突无法在单元测试中通过样式断言复现。
 * 因此本测试通过捕获 motion.span 的 props，直接验证根因：
 *   - 不应使用 layout 属性（会与 style.transform 冲突）
 *   - 应通过 animate 或 style 正确传递 transform
 */
describe('Toggle — 开关白点位置根因测试', () => {
  it('motion.span 不应使用 layout 属性（与 style.transform 冲突导致白点卡死）', () => {
    render(<Toggle checked={true} onChange={() => {}} />)
    expect(capturedMotionSpanProps).toHaveLength(1)
    const spanProps = capturedMotionSpanProps[0]
    // layout 属性会与手动 transform 冲突，导致关闭再打开后白点不回位
    expect(spanProps).not.toHaveProperty('layout')
  })

  it('checked=true 时通过 animate 或 style 正确设置右侧位置', () => {
    render(<Toggle checked={true} onChange={() => {}} />)
    const spanProps = capturedMotionSpanProps[0]
    // 必须通过 animate 或 style 传递 transform，且值为 18（md 尺寸）
    const animate = spanProps.animate as { x?: number } | undefined
    const style = spanProps.style as { transform?: string } | undefined
    const hasAnimateX = animate && typeof animate.x === 'number' && animate.x === 18
    const hasStyleTransform = style && typeof style.transform === 'string' && style.transform.includes('18')
    expect(hasAnimateX || hasStyleTransform).toBe(true)
  })

  it('checked=false 时位置应为 0（左侧）', () => {
    render(<Toggle checked={false} onChange={() => {}} />)
    const spanProps = capturedMotionSpanProps[0]
    const animate = spanProps.animate as { x?: number } | undefined
    const style = spanProps.style as { transform?: string } | undefined
    const hasAnimateX = animate && typeof animate.x === 'number' && animate.x === 0
    const hasStyleTransform = style && typeof style.transform === 'string' && (style.transform === 'translateX(0)' || style.transform === 'none' || !style.transform.includes('18'))
    expect(hasAnimateX || hasStyleTransform).toBe(true)
  })

  it('关闭再打开后 animate/style 应正确反映 checked=true（核心 Bug）', () => {
    // checked=true
    const { rerender } = render(<Toggle checked={true} onChange={() => {}} />)
    expect(capturedMotionSpanProps).toHaveLength(1)
    let spanProps = capturedMotionSpanProps[0]
    let animate = spanProps.animate as { x?: number } | undefined
    let style = spanProps.style as { transform?: string } | undefined
    let hasRight = (animate?.x === 18) || (style?.transform?.includes('18') ?? false)
    expect(hasRight).toBe(true)

    // checked=false
    capturedMotionSpanProps.length = 0
    rerender(<Toggle checked={false} onChange={() => {}} />)
    spanProps = capturedMotionSpanProps[0]
    animate = spanProps.animate as { x?: number } | undefined
    style = spanProps.style as { transform?: string } | undefined
    let hasLeft = (animate?.x === 0) || (!style?.transform?.includes('18') ?? false)
    expect(hasLeft).toBe(true)

    // checked=true 再次打开 — 这是 Bug 出现的地方
    capturedMotionSpanProps.length = 0
    rerender(<Toggle checked={true} onChange={() => {}} />)
    spanProps = capturedMotionSpanProps[0]
    animate = spanProps.animate as { x?: number } | undefined
    style = spanProps.style as { transform?: string } | undefined
    hasRight = (animate?.x === 18) || (style?.transform?.includes('18') ?? false)
    // 由于 layout 属性冲突，style.transform 可能被 framer-motion 缓存而不更新
    expect(hasRight).toBe(true)
  })
})
