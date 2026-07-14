import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock 依赖的安装管线，避免触碰数据库 / 进程
vi.mock('../mcp.service', () => ({
  addMcpServer: vi.fn(),
  connectMcpServer: vi.fn(),
}))
vi.mock('../scl.service', () => ({
  installSclExtension: vi.fn(),
}))

import { addMcpServer, connectMcpServer } from '../mcp.service'
import { installSclExtension } from '../scl.service'
import { installListing } from '../marketplace.service'
import type { MarketListing } from '@shared/types/marketplace'

const mockedAddMcpServer = vi.mocked(addMcpServer)
const mockedConnectMcpServer = vi.mocked(connectMcpServer)
const mockedInstallScl = vi.mocked(installSclExtension)

beforeEach(() => {
  vi.clearAllMocks()
  // 默认模拟连接成功，个别测试可覆盖
  mockedConnectMcpServer.mockResolvedValue({
    id: 'mock',
    name: 'mock',
    connected: true,
    toolCount: 0,
  } as never)
})

describe('marketplace.service - installListing', () => {
  it('mcp remote listing（带 url）调用 addMcpServer 配置为 remote', async () => {
    mockedAddMcpServer.mockReturnValue({ id: 'mcp_1' } as never)
    const listing: MarketListing = {
      id: 'mcp-official:weather',
      type: 'mcp',
      name: 'Weather Server',
      description: '天气',
      author: '',
      version: '1.0.0',
      tags: [],
      icon: '🔌',
      registryId: 'mcp-official',
      install: { mcp: { type: 'remote', url: 'https://mcp.example.com/weather' } },
      raw: null,
    }

    const result = await installListing(listing)

    expect(result.ok).toBe(true)
    expect(mockedAddMcpServer).toHaveBeenCalledTimes(1)
    const arg = mockedAddMcpServer.mock.calls[0][0] as Record<string, unknown>
    expect(arg.name).toBe('Weather Server')
    expect(arg.type).toBe('remote')
    expect(arg.url).toBe('https://mcp.example.com/weather')
    expect(arg.enabled).toBe(true)
  })

  it('mcp local listing（带 command）调用 addMcpServer 配置为 local', async () => {
    mockedAddMcpServer.mockReturnValue({ id: 'mcp_2' } as never)
    const listing: MarketListing = {
      id: 'smithery:fs',
      type: 'mcp',
      name: 'Filesystem',
      description: '',
      author: '',
      version: '',
      tags: [],
      icon: '🔌',
      registryId: 'smithery',
      install: { mcp: { type: 'local', command: 'npx', args: ['-y', 'server-filesystem'] } },
      raw: null,
    }

    const result = await installListing(listing)

    expect(result.ok).toBe(true)
    const arg = mockedAddMcpServer.mock.calls[0][0] as Record<string, unknown>
    expect(arg.type).toBe('local')
    expect(arg.command).toBe('npx')
    expect(arg.args).toEqual(['-y', 'server-filesystem'])
  })

  it('mcp remote listing 缺少 url 时返回 ok:false 并提示', async () => {
    const listing: MarketListing = {
      id: 'smithery:gmail',
      type: 'mcp',
      name: 'Gmail',
      description: '',
      author: '',
      version: '',
      tags: [],
      icon: '🔌',
      registryId: 'smithery',
      install: { mcp: { type: 'remote' } }, // 无 url
      repository: 'https://smithery.ai/servers/gmail',
      raw: null,
    }

    const result = await installListing(listing)

    expect(result.ok).toBe(false)
    expect(mockedAddMcpServer).not.toHaveBeenCalled()
    expect(result.message).toMatch(/url|配置|主页/)
  })

  it('skill listing 调用 installSclExtension 注入 content/category', async () => {
    mockedInstallScl.mockReturnValue({ id: 'scl_1' } as never)
    const listing: MarketListing = {
      id: 'zx-skill:api',
      type: 'skill',
      name: 'API 设计技能',
      description: 'RESTful 规范',
      author: 'community',
      version: '1.0.0',
      tags: ['api'],
      icon: '🔌',
      registryId: 'zx-skill',
      install: {
        skill: { content: '## API 设计\n\n遵循 REST。', category: 'coding', icon: '🔌' },
      },
      raw: null,
    }

    const result = await installListing(listing)

    expect(result.ok).toBe(true)
    expect(mockedInstallScl).toHaveBeenCalledTimes(1)
    const arg = mockedInstallScl.mock.calls[0][0] as Record<string, unknown>
    expect(arg.name).toBe('API 设计技能')
    expect(arg.content).toContain('REST')
    expect(arg.category).toBe('coding')
    expect(arg.source).toBe('remote')
    expect(arg.enabled).toBe(false)
  })

  it('plugin listing 当前不支持直接安装，返回 ok:false', async () => {
    const listing: MarketListing = {
      id: 'plugin:theme',
      type: 'plugin',
      name: '极光主题',
      description: '',
      author: '',
      version: '',
      tags: [],
      icon: '🧩',
      registryId: 'plugin',
      install: { plugin: { manifest: { kind: 'theme' } } },
      raw: null,
    }

    const result = await installListing(listing)

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/暂不支持|插件/)
  })

  it('mcp remote 安装后自动尝试连接，连接成功时返回 ok:true', async () => {
    mockedAddMcpServer.mockReturnValue({ id: 'mcp_auto_1' } as never)
    mockedConnectMcpServer.mockResolvedValue({
      id: 'mcp_auto_1',
      name: 'Weather Server',
      connected: true,
      toolCount: 3,
    } as never)

    const listing: MarketListing = {
      id: 'mcp-official:weather',
      type: 'mcp',
      name: 'Weather Server',
      description: '',
      author: '',
      version: '',
      tags: [],
      icon: '🔌',
      registryId: 'mcp-official',
      install: { mcp: { type: 'remote', url: 'https://mcp.example.com/weather' } },
      raw: null,
    }

    const result = await installListing(listing)

    expect(result.ok).toBe(true)
    expect(mockedConnectMcpServer).toHaveBeenCalledWith('mcp_auto_1')
  })

  it('mcp remote 安装后自动连接失败时，返回 ok:true 但 message 提示连接失败', async () => {
    mockedAddMcpServer.mockReturnValue({ id: 'mcp_auto_2' } as never)
    mockedConnectMcpServer.mockResolvedValue({
      id: 'mcp_auto_2',
      name: 'Failing Server',
      connected: false,
      error: '连接超时',
      toolCount: 0,
    } as never)

    const listing: MarketListing = {
      id: 'mcp-official:failing',
      type: 'mcp',
      name: 'Failing Server',
      description: '',
      author: '',
      version: '',
      tags: [],
      icon: '🔌',
      registryId: 'mcp-official',
      install: { mcp: { type: 'remote', url: 'https://mcp.example.com/failing' } },
      raw: null,
    }

    const result = await installListing(listing)

    // 安装本身成功（配置已添加），但连接失败
    expect(result.ok).toBe(true)
    expect(mockedConnectMcpServer).toHaveBeenCalledWith('mcp_auto_2')
    expect(result.message).toMatch(/已安装|连接失败|未能连接/)
  })
})
