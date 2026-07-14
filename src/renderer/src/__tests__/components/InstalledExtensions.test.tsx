import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { connectServerMock, disconnectServerMock, listStatusMock, removeServerMock, toastSuccess, toastError } =
  vi.hoisted(() => ({
    connectServerMock: vi.fn(),
    disconnectServerMock: vi.fn(),
    listStatusMock: vi.fn(),
    removeServerMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  }))

vi.mock('@/services/ipc', () => ({
  ipc: {
    mcp: {
      connectServer: connectServerMock,
      disconnectServer: disconnectServerMock,
      listStatus: listStatusMock,
      removeServer: removeServerMock,
    },
  },
}))

vi.mock('@/stores/toastStore', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
    info: vi.fn(),
  },
}))

import { InstalledExtensions } from '@/components/market/InstalledExtensions'
import type { McpServerConfig, McpServerStatus } from '@shared/types/mcp'

const serverConfig: McpServerConfig = {
  id: 'm1',
  name: 'test-server',
  type: 'remote',
  url: 'https://example.com/mcp',
  enabled: true,
}

describe('InstalledExtensions - MCP 连接状态反馈', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStatusMock.mockResolvedValue([])
  })

  it('连接成功时显示成功 toast', async () => {
    connectServerMock.mockResolvedValue({
      id: 'm1',
      name: 'test-server',
      connected: true,
      toolCount: 3,
    })

    render(<InstalledExtensions servers={[serverConfig]} onServersChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('test-server')).toBeInTheDocument())

    await fireEvent.click(screen.getByText('连接'))

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('已连接', '「test-server」连接成功')
    })
    expect(toastError).not.toHaveBeenCalled()
  })

  it('连接失败时（connected=false）显示错误 toast，而非成功 toast', async () => {
    connectServerMock.mockResolvedValue({
      id: 'm1',
      name: 'test-server',
      connected: false,
      error: 'MCP HTTP 请求失败: 404 Not Found',
      toolCount: 0,
    })

    render(<InstalledExtensions servers={[serverConfig]} onServersChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('test-server')).toBeInTheDocument())

    await fireEvent.click(screen.getByText('连接'))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('连接失败', expect.stringContaining('404'))
    })
    // 关键：不应显示成功 toast
    expect(toastSuccess).not.toHaveBeenCalledWith('已连接', expect.anything())
  })

  it('连接失败时在卡片内联显示错误信息', async () => {
    connectServerMock.mockResolvedValue({
      id: 'm1',
      name: 'test-server',
      connected: false,
      error: '连接超时（30s）',
      toolCount: 0,
    })

    render(<InstalledExtensions servers={[serverConfig]} onServersChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('test-server')).toBeInTheDocument())

    await fireEvent.click(screen.getByText('连接'))

    await waitFor(() => {
      expect(screen.getByText(/连接超时/)).toBeInTheDocument()
    })
  })
})
