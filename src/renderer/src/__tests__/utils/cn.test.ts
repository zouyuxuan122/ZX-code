import { describe, it, expect } from 'vitest'
import { cn } from '@/utils/cn'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('filters falsy values', () => {
    expect(cn('foo', false, undefined, null, 'bar')).toBe('foo bar')
  })

  it('resolves tailwind conflicts (later wins)', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })

  it('handles conditional classes', () => {
    const active = true
    const disabled = false
    expect(cn('base', active && 'active', disabled && 'disabled')).toBe('base active')
  })

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('')
  })
})
