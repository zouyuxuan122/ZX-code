import { describe, it, expect } from 'vitest'
import { parseSlashCommand, filterCommands } from '@/utils/slashCommands'

describe('parseSlashCommand', () => {
  it('returns null for non-slash input', () => {
    expect(parseSlashCommand('hello')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parseSlashCommand('')).toBeNull()
  })

  it('parses command without args', () => {
    const result = parseSlashCommand('/help')
    expect(result).toEqual({ command: 'help', args: [] })
  })

  it('parses command with args', () => {
    const result = parseSlashCommand('/mode plan')
    expect(result).toEqual({ command: 'mode', args: ['plan'] })
  })

  it('parses command with multiple args', () => {
    const result = parseSlashCommand('/new hello world')
    expect(result).toEqual({ command: 'new', args: ['hello', 'world'] })
  })

  it('handles trailing whitespace', () => {
    const result = parseSlashCommand('/help   ')
    expect(result).toEqual({ command: 'help', args: [] })
  })

  it('lowercases command name', () => {
    const result = parseSlashCommand('/HELP')
    expect(result).toEqual({ command: 'help', args: [] })
  })
})

describe('filterCommands', () => {
  it('returns empty array for non-slash input', () => {
    expect(filterCommands('hello')).toEqual([])
  })

  it('filters commands by prefix match', () => {
    const results = filterCommands('/hel')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((c) => c.name.startsWith('hel'))).toBe(true)
  })

  it('returns exact match when full command typed', () => {
    const results = filterCommands('/help')
    expect(results.length).toBe(1)
    expect(results[0].name).toBe('help')
  })
})
