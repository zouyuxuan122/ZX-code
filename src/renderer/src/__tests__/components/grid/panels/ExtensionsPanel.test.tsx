import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExtensionsPanel } from '@/components/grid/panels/ExtensionsPanel'

vi.mock('@/services/ipc', () => ({
  ipc: {
    mcp: {
      listServers: vi.fn().mockResolvedValue([
        { id: 'm1', name: 'filesystem', type: 'local', enabled: true, command: 'npx' },
        { id: 'm2', name: 'github', type: 'remote', enabled: false, url: 'https://...' },
      ]),
      listStatus: vi.fn().mockResolvedValue([
        { id: 'm1', name: 'filesystem', connected: true, toolCount: 5 },
        { id: 'm2', name: 'github', connected: false, toolCount: 0 },
      ]),
    },
    scl: {
      list: vi.fn().mockResolvedValue([
        { id: 's1', name: 'TDD', description: '测试驱动', category: 'testing', enabled: true, icon: '🧪' },
        { id: 's2', name: 'Code Review', description: '代码审查', category: 'review', enabled: false, icon: '🔍' },
      ]),
    },
  },
}))

describe('ExtensionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('默认显示 Skill 列表', async () => {
    render(<ExtensionsPanel />)
    await waitFor(() => {
      expect(screen.getByText('TDD')).toBeInTheDocument()
      expect(screen.getByText('Code Review')).toBeInTheDocument()
    })
  })

  it('切换到 MCP Tab 显示服务器列表', async () => {
    render(<ExtensionsPanel />)
    await waitFor(() => expect(screen.getByText('TDD')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /MCP/ }))
    await waitFor(() => {
      expect(screen.getByText('filesystem')).toBeInTheDocument()
      expect(screen.getByText('github')).toBeInTheDocument()
    })
  })

  it('MCP 项显示连接状态和工具数', async () => {
    render(<ExtensionsPanel />)
    await waitFor(() => expect(screen.getByText('TDD')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /MCP/ }))
    await waitFor(() => expect(screen.getByText('filesystem')).toBeInTheDocument())
    expect(screen.getByText(/5.*工具/)).toBeInTheDocument()
  })
})
