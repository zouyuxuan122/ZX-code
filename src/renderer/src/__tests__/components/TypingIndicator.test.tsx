import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TypingIndicator } from '@/components/chat/TypingIndicator'

describe('TypingIndicator', () => {
  it('renders three bouncing dots', () => {
    render(<TypingIndicator />)
    const dots = document.querySelectorAll('.animate-typing-bounce')
    expect(dots).toHaveLength(3)
  })

  it('displays "思考中..." text', () => {
    render(<TypingIndicator />)
    expect(screen.getByText('思考中...')).toBeInTheDocument()
  })

  it('applies staggered animation delays to dots', () => {
    render(<TypingIndicator />)
    const dots = document.querySelectorAll('.animate-typing-bounce')
    const delays = Array.from(dots).map((d) => (d as HTMLElement).style.animationDelay)
    expect(delays[0]).toBe('0s')
    expect(delays[1]).toBe('0.15s')
    expect(delays[2]).toBe('0.3s')
  })
})
