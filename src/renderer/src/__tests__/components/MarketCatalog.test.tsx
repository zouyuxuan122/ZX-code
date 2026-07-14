import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { fetchAllMock, installMock, mcpAddServerMock } = vi.hoisted(() => ({
  fetchAllMock: vi.fn(),
  installMock: vi.fn(),
  mcpAddServerMock: vi.fn(),
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    marketplace: {
      fetchAll: fetchAllMock,
      install: installMock,
    },
    mcp: {
      addServer: mcpAddServerMock,
    },
  },
}))

vi.mock('@/stores/toastStore', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import { MarketCatalog } from '@/components/market/MarketCatalog'
import type {
  MarketFetchResult,
  MarketListing,
  MarketRegistry,
} from '@shared/types/marketplace'

/** 构造一个官方 MCP registry 的 listing */
function makeMcpListing(name: string, registryId: string): MarketListing {
  return {
    id: `${registryId}:${name}`,
    type: 'mcp',
    name,
    description: `${name} 描述`,
    author: 'Anthropic',
    version: '1.0.0',
    tags: ['官方'],
    icon: '🔌',
    registryId,
    verified: true,
    install: { mcp: { type: 'remote', url: `https://example.com/${name}` } },
    raw: {},
  }
}

/** 构造一个 Smithery registry 的 listing */
function makeSmitheryListing(name: string): MarketListing {
  return {
    id: `smithery:${name}`,
    type: 'mcp',
    name,
    description: `${name} from Smithery`,
    author: 'community',
    version: '',
    tags: [],
    icon: '🔌',
    registryId: 'smithery',
    verified: false,
    repository: 'https://github.com/example/repo',
    install: { mcp: { type: 'remote' } },
    raw: {},
  }
}

const officialRegistry: MarketRegistry = {
  id: 'mcp-official',
  name: 'MCP 官方注册表',
  type: 'mcp',
  url: 'https://registry.modelcontextprotocol.io/v0/servers',
  adapter: 'mcp-official',
  enabled: true,
  official: true,
}

const smitheryRegistry: MarketRegistry = {
  id: 'smithery',
  name: 'Smithery',
  type: 'mcp',
  url: 'https://registry.smithery.ai/servers',
  adapter: 'smithery',
  enabled: true,
}

describe('MarketCatalog - 接入真实社区市场', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('挂载时调用 ipc.marketplace.fetchAll 拉取真实社区注册表', async () => {
    fetchAllMock.mockResolvedValue([])
    render(
      <MarketCatalog
        searchQuery=""
        installedServers={[]}
        onInstalledChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(fetchAllMock).toHaveBeenCalledTimes(1)
    })
  })

  it('渲染来自真实 registry 的 listing', async () => {
    const fetchResult: MarketFetchResult = {
      registry: officialRegistry,
      listings: [makeMcpListing('filesystem', 'mcp-official')],
      error: undefined,
    }
    fetchAllMock.mockResolvedValue([fetchResult])
    render(
      <MarketCatalog
        searchQuery=""
        installedServers={[]}
        onInstalledChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('filesystem')).toBeInTheDocument()
    })
  })

  it('合并展示来自多个 registry（mcp-official + smithery）的条目', async () => {
    const results: MarketFetchResult[] = [
      {
        registry: officialRegistry,
        listings: [makeMcpListing('filesystem', 'mcp-official')],
      },
      {
        registry: smitheryRegistry,
        listings: [makeSmitheryListing('gmail-connector')],
      },
    ]
    fetchAllMock.mockResolvedValue(results)
    render(
      <MarketCatalog
        searchQuery=""
        installedServers={[]}
        onInstalledChange={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('filesystem')).toBeInTheDocument()
      expect(screen.getByText('gmail-connector')).toBeInTheDocument()
    })
  })

  it('当某个 registry 拉取失败时，其它 listing 正常展示', async () => {
    const results: MarketFetchResult[] = [
      {
        registry: officialRegistry,
        listings: [makeMcpListing('github', 'mcp-official')],
      },
      {
        registry: smitheryRegistry,
        listings: [],
        error: 'HTTP 503 Service Unavailable',
      },
    ]
    fetchAllMock.mockResolvedValue(results)
    render(
      <MarketCatalog
        searchQuery=""
        installedServers={[]}
        onInstalledChange={vi.fn()}
      />,
    )
    // 成功的 listing 应正常展示
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument()
    })
    // 失败的 registry 应有错误提示
    expect(screen.getByText(/Smithery/)).toBeInTheDocument()
    expect(screen.getByText(/503/)).toBeInTheDocument()
  })

  it('当所有 registry 拉取失败时，回退到内置精选目录', async () => {
    fetchAllMock.mockResolvedValue([
      { registry: officialRegistry, listings: [], error: '网络错误' },
      { registry: smitheryRegistry, listings: [], error: '网络错误' },
    ])
    render(
      <MarketCatalog
        searchQuery=""
        installedServers={[]}
        onInstalledChange={vi.fn()}
      />,
    )
    // 内置目录的 Filesystem 应该作为回退展示
    await waitFor(() => {
      expect(screen.getByText('Filesystem')).toBeInTheDocument()
    })
  })

  it('点击安装按钮调用 ipc.marketplace.install', async () => {
    const listing = makeMcpListing('todoist', 'mcp-official')
    fetchAllMock.mockResolvedValue([
      { registry: officialRegistry, listings: [listing], error: undefined },
    ])
    installMock.mockResolvedValue({ ok: true, message: '已安装' })

    const onInstalledChange = vi.fn()
    render(
      <MarketCatalog
        searchQuery=""
        installedServers={[]}
        onInstalledChange={onInstalledChange}
      />,
    )
    await waitFor(() => expect(screen.getByText('todoist')).toBeInTheDocument())

    // 找到 todoist 卡片上的安装按钮并点击
    const installButtons = screen.getAllByText('安装')
    await fireEvent.click(installButtons[0])

    await waitFor(() => {
      expect(installMock).toHaveBeenCalledTimes(1)
      expect(installMock).toHaveBeenCalledWith(listing)
    })
  })
})
