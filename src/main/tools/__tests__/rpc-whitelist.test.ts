import { describe, it, expect } from 'vitest'
import { RPC_ALLOWED_TOOLS } from '../index'

describe('RPC 工具白名单', () => {
  describe('只读工具应包含在白名单中', () => {
    it('包含 read_file', () => {
      expect(RPC_ALLOWED_TOOLS.has('read_file')).toBe(true)
    })
    it('包含 list_files', () => {
      expect(RPC_ALLOWED_TOOLS.has('list_files')).toBe(true)
    })
    it('包含 search_files', () => {
      expect(RPC_ALLOWED_TOOLS.has('search_files')).toBe(true)
    })
    it('包含 grep', () => {
      expect(RPC_ALLOWED_TOOLS.has('grep')).toBe(true)
    })
    it('包含 webfetch', () => {
      expect(RPC_ALLOWED_TOOLS.has('webfetch')).toBe(true)
    })
    it('包含 websearch', () => {
      expect(RPC_ALLOWED_TOOLS.has('websearch')).toBe(true)
    })
    it('包含 terminal_read', () => {
      expect(RPC_ALLOWED_TOOLS.has('terminal_read')).toBe(true)
    })
    it('包含 todo_write', () => {
      expect(RPC_ALLOWED_TOOLS.has('todo_write')).toBe(true)
    })
  })

  describe('有副作用的工具不应包含在白名单中', () => {
    it('不包含 write_file', () => {
      expect(RPC_ALLOWED_TOOLS.has('write_file')).toBe(false)
    })
    it('不包含 edit', () => {
      expect(RPC_ALLOWED_TOOLS.has('edit')).toBe(false)
    })
    it('不包含 run_command', () => {
      expect(RPC_ALLOWED_TOOLS.has('run_command')).toBe(false)
    })
    it('不包含 run_script（防止递归和副作用）', () => {
      expect(RPC_ALLOWED_TOOLS.has('run_script')).toBe(false)
    })
    it('不包含 cron_manage', () => {
      expect(RPC_ALLOWED_TOOLS.has('cron_manage')).toBe(false)
    })
    it('不包含 skill_create', () => {
      expect(RPC_ALLOWED_TOOLS.has('skill_create')).toBe(false)
    })
    it('不包含 goal_manage', () => {
      expect(RPC_ALLOWED_TOOLS.has('goal_manage')).toBe(false)
    })
  })
})
