import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PetSubtitles } from '@/components/grid/panels/pet/PetSubtitles'

describe('PetSubtitles', () => {
  it('renders subtitle text when visible is true', () => {
    render(<PetSubtitles text="你好喵~" visible style="bubble" />)
    expect(screen.getByText('你好喵~')).toBeInTheDocument()
  })

  it('does not render subtitle text when visible is false', () => {
    render(<PetSubtitles text="你好喵~" visible={false} style="bubble" />)
    expect(screen.queryByText('你好喵~')).not.toBeInTheDocument()
  })

  it('limits text to a maximum of 2 lines', () => {
    render(<PetSubtitles text="这是一段很长的字幕文本，用于验证最大行数限制。" visible style="bubble" />)
    const textEl = screen.getByText(/这是一段很长的字幕文本/)
    expect(textEl).toHaveClass('line-clamp-2')
  })

  it('applies bubble style classes', () => {
    render(<PetSubtitles text="气泡样式" visible style="bubble" />)
    const wrapper = screen.getByTestId('pet-subtitles')
    expect(wrapper).toHaveClass('rounded-2xl')
    expect(wrapper).toHaveClass('bg-white/90')
  })

  it('applies line style classes', () => {
    render(<PetSubtitles text="单行样式" visible style="line" />)
    const wrapper = screen.getByTestId('pet-subtitles')
    expect(wrapper).toHaveClass('rounded-lg')
    expect(wrapper).toHaveClass('bg-black/70')
  })

  it('renders nothing when text is empty', () => {
    render(<PetSubtitles text="" visible style="bubble" />)
    expect(screen.queryByTestId('pet-subtitles')).not.toBeInTheDocument()
  })
})
