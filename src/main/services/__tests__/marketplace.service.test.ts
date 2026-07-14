import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { MarketRegistry } from '@shared/types/marketplace'

// 捕获 fetch 调用，便于断言 URL / query
let fetchMock: ReturnType<typeof vi.fn>
let abortSignalArg: AbortSignal | undefined

beforeEach(() => {
  fetchMock = vi.fn()
  abortSignalArg = undefined
  // marketplace.service 默认使用 globalThis.fetch，测试中替换为 mock
  vi.stubGlobal('fetch', (...args: unknown[]) => {
    const [url, init] = args as [string, RequestInit | undefined]
    if (init?.signal) abortSignalArg = init.signal as AbortSignal
    return fetchMock(...args)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** 构造一个最小可用的官方 MCP registry 响应 */
function officialRegistryResponse(servers: unknown[]) {
  return { servers }
}

/** 官方 registry 中一个带 streamable-http remote 的服务器条目 */
function officialHttpServer(
  serverOverrides: Record<string, unknown> = {},
  metaOverrides: Record<string, unknown> = {},
) {
  return {
    server: {
      name: 'io.github.example/weather',
      title: 'Weather Server',
      description: '查询天气信息',
      version: '1.2.0',
      remotes: [{ type: 'streamable-http', url: 'https://mcp.example.com/weather' }],
      repository: { url: 'https://github.com/example/weather', source: 'github' },
      ...serverOverrides,
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active',
        isLatest: true,
        publishedAt: '2026-04-13T17:33:26.613537Z',
        ...metaOverrides,
      },
    },
  }
}

describe('marketplace.service - 官方 MCP registry 适配器', () => {
  it('将 streamable-http 远程服务器归一化为 remote MCP listing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => officialRegistryResponse([officialHttpServer()]),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    const officialRegistry: MarketRegistry = {
      id: 'mcp-official',
      name: 'MCP 官方注册表',
      type: 'mcp',
      url: 'https://registry.modelcontextprotocol.io/v0/servers',
      adapter: 'mcp-official',
      enabled: true,
    }

    const listings = await fetchListings(officialRegistry)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl] = fetchMock.mock.calls[0] as [string]
    expect(calledUrl).toBe('https://registry.modelcontextprotocol.io/v0/servers')

    expect(listings).toHaveLength(1)
    const listing = listings[0]
    expect(listing.type).toBe('mcp')
    expect(listing.registryId).toBe('mcp-official')
    expect(listing.name).toBe('Weather Server')
    expect(listing.description).toBe('查询天气信息')
    expect(listing.version).toBe('1.2.0')
    expect(listing.repository).toBe('https://github.com/example/weather')
    expect(listing.install.mcp).toBeDefined()
    expect(listing.install.mcp?.type).toBe('remote')
    expect(listing.install.mcp?.url).toBe('https://mcp.example.com/weather')
  })

  it('空 servers 数组返回空 listings', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => officialRegistryResponse([]),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    const listings = await fetchListings({
      id: 'mcp-official',
      name: 'MCP 官方注册表',
      type: 'mcp',
      url: 'https://registry.modelcontextprotocol.io/v0/servers',
      adapter: 'mcp-official',
      enabled: true,
    })

    expect(listings).toEqual([])
  })

  it('同一服务器仅保留 isLatest=true 的版本', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () =>
        officialRegistryResponse([
          officialHttpServer({ version: '1.0.0' }, { isLatest: false }), // 旧版本
          officialHttpServer({ version: '1.2.0' }), // 默认 isLatest:true
        ]),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    const listings = await fetchListings({
      id: 'mcp-official',
      name: 'MCP 官方注册表',
      type: 'mcp',
      url: 'https://registry.modelcontextprotocol.io/v0/servers',
      adapter: 'mcp-official',
      enabled: true,
    })

    // 两条同名 server（name 相同），只保留 isLatest 的那条
    expect(listings).toHaveLength(1)
    expect(listings[0].version).toBe('1.2.0')
  })

  it('HTTP 非 2xx 响应抛出包含状态码的错误', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    await expect(
      fetchListings({
        id: 'mcp-official',
        name: 'MCP 官方注册表',
        type: 'mcp',
        url: 'https://registry.modelcontextprotocol.io/v0/servers',
        adapter: 'mcp-official',
        enabled: true,
      }),
    ).rejects.toThrow(/503/)
  })

  it('fetchListings 请求中包含 User-Agent 头，避免被 API 拒绝 400', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => officialRegistryResponse([officialHttpServer()]),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    const officialRegistry: MarketRegistry = {
      id: 'mcp-official',
      name: 'MCP 官方注册表',
      type: 'mcp',
      url: 'https://registry.modelcontextprotocol.io/v0/servers',
      adapter: 'mcp-official',
      enabled: true,
    }

    await fetchListings(officialRegistry)

    // 检查 fetch 被调用时携带了 User-Agent 头
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const callArgs = fetchMock.mock.calls[0]
    const init = callArgs[1] as RequestInit | undefined
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers).toBeTruthy()
    expect(headers['User-Agent'] ?? headers['user-agent']).toBeTruthy()
  })
})

// ============================================================================
// Smithery registry 适配器（真实公开 API：https://registry.smithery.ai/servers）
// ============================================================================

describe('marketplace.service - Smithery 适配器', () => {
  it('将 Smithery server 归一化为 mcp listing，带 verified 与 homepage', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        servers: [
          {
            id: '69919e2f',
            qualifiedName: 'gmail',
            displayName: 'Gmail',
            description: 'Manage Gmail end-to-end.',
            iconUrl: 'https://api.smithery.ai/servers/gmail/icon',
            verified: true,
            useCount: 47258,
            remote: true,
            isDeployed: true,
            createdAt: '2025-11-26T14:34:03.393Z',
            homepage: 'https://smithery.ai/servers/gmail',
          },
        ],
        pagination: { currentPage: 1, pageSize: 200, totalPages: 250, totalCount: 7049 },
      }),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    const listings = await fetchListings({
      id: 'smithery',
      name: 'Smithery',
      type: 'mcp',
      url: 'https://registry.smithery.ai/servers?pageSize=200',
      adapter: 'smithery',
      enabled: true,
    })

    expect(listings).toHaveLength(1)
    const l = listings[0]
    expect(l.type).toBe('mcp')
    expect(l.registryId).toBe('smithery')
    expect(l.name).toBe('Gmail')
    expect(l.description).toBe('Manage Gmail end-to-end.')
    expect(l.verified).toBe(true)
    expect(l.repository).toBe('https://smithery.ai/servers/gmail')
    // Smithery list 未直接给出连接 URL，标记为 remote 但 url 留空（UI 引导到主页配置）
    expect(l.install.mcp?.type).toBe('remote')
    expect(l.install.mcp?.url).toBeUndefined()
  })

  it('空 servers 返回空数组', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ servers: [], pagination: { currentPage: 1, pageSize: 200, totalPages: 0, totalCount: 0 } }),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    const listings = await fetchListings({
      id: 'smithery',
      name: 'Smithery',
      type: 'mcp',
      url: 'https://registry.smithery.ai/servers?pageSize=200',
      adapter: 'smithery',
      enabled: true,
    })
    expect(listings).toEqual([])
  })
})

// ============================================================================
// SCL 技能目录适配器（项目自有 RemoteCatalogResponse 格式 → Skill 市场）
// ============================================================================

describe('marketplace.service - SCL 技能目录适配器', () => {
  it('将 RemoteCatalogResponse 归一化为 skill listing，带 install.skill 内容', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        name: '社区技能目录',
        description: '示例',
        skills: [
          {
            name: 'API 设计技能',
            description: 'RESTful API 设计规范',
            category: 'coding',
            content: '## API 设计技能\n\n遵循 REST 规范。',
            tags: ['api', 'design'],
            icon: '🔌',
            author: 'community',
            version: '1.0.0',
          },
        ],
      }),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    const listings = await fetchListings({
      id: 'zx-skill',
      name: '技能社区目录',
      type: 'skill',
      url: 'https://example.com/skills.json',
      adapter: 'scl-catalog',
      enabled: true,
    })

    expect(listings).toHaveLength(1)
    const l = listings[0]
    expect(l.type).toBe('skill')
    expect(l.registryId).toBe('zx-skill')
    expect(l.name).toBe('API 设计技能')
    expect(l.description).toBe('RESTful API 设计规范')
    expect(l.version).toBe('1.0.0')
    expect(l.install.skill).toBeDefined()
    expect(l.install.skill?.content).toContain('REST 规范')
    expect(l.install.skill?.category).toBe('coding')
  })

  it('缺少 skills 数组返回空 listings', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ name: '空目录' }),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    const listings = await fetchListings({
      id: 'zx-skill',
      name: '技能社区目录',
      type: 'skill',
      url: 'https://example.com/skills.json',
      adapter: 'scl-catalog',
      enabled: true,
    })
    expect(listings).toEqual([])
  })
})

// ============================================================================
// 通用 JSON 插件目录适配器（generic-json → Plugin 市场）
// ============================================================================

describe('marketplace.service - generic-json 插件目录适配器', () => {
  it('将标准插件目录归一化为 plugin listing，带 install.plugin manifest', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        plugins: [
          {
            name: '主题包 · 极光',
            description: '一套深色极光主题。',
            author: 'community',
            version: '0.1.0',
            tags: ['theme'],
            icon: '🎨',
            manifest: { kind: 'theme', colors: { bg: '#0b1020' } },
          },
        ],
      }),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    const listings = await fetchListings({
      id: 'plugin-community',
      name: '插件社区目录',
      type: 'plugin',
      url: 'https://example.com/plugins.json',
      adapter: 'generic-json',
      enabled: true,
    })

    expect(listings).toHaveLength(1)
    const l = listings[0]
    expect(l.type).toBe('plugin')
    expect(l.name).toBe('主题包 · 极光')
    expect(l.install.plugin?.manifest).toEqual({ kind: 'theme', colors: { bg: '#0b1020' } })
  })

  it('同时支持 mcp 数组字段（兼容社区目录命名）', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        mcp: [
          { name: 'x', description: 'd', manifest: { a: 1 } },
        ],
      }),
    } as Response)

    const { fetchListings } = await import('../marketplace.service')
    const listings = await fetchListings({
      id: 'plugin-community',
      name: '插件社区目录',
      type: 'plugin',
      url: 'https://example.com/plugins.json',
      adapter: 'generic-json',
      enabled: true,
    })
    expect(listings).toHaveLength(1)
    expect(listings[0].name).toBe('x')
  })
})

// ============================================================================
// searchListings 本地过滤
// ============================================================================

describe('marketplace.service - searchListings', () => {
  it('按 name 关键字过滤（大小写不敏感）', async () => {
    const { searchListings } = await import('../marketplace.service')
    const listings = [
      makeListing('mcp-official:fs', 'mcp', 'Filesystem', '本地文件系统', ['fs']),
      makeListing('mcp-official:git', 'mcp', 'Git', '版本控制', ['git']),
      makeListing('zx-skill:api', 'skill', 'API 设计', 'RESTful 规范', ['api']),
    ]
    const result = searchListings(listings, { query: 'files' })
    expect(result.map((l) => l.name)).toEqual(['Filesystem'])
  })

  it('同时匹配 description 与 tags', async () => {
    const { searchListings } = await import('../marketplace.service')
    const listings = [
      makeListing('a:1', 'mcp', 'A', '网络请求工具', ['http']),
      makeListing('b:2', 'skill', 'B', '代码审查', ['review']),
    ]
    expect(searchListings(listings, { query: 'review' }).map((l) => l.id)).toEqual(['b:2'])
    expect(searchListings(listings, { query: 'http' }).map((l) => l.id)).toEqual(['a:1'])
  })

  it('按 type 过滤', async () => {
    const { searchListings } = await import('../marketplace.service')
    const listings = [
      makeListing('a:1', 'mcp', 'A', 'd', []),
      makeListing('b:2', 'skill', 'B', 'd', []),
      makeListing('c:3', 'plugin', 'C', 'd', []),
    ]
    expect(searchListings(listings, { type: 'skill' }).map((l) => l.id)).toEqual(['b:2'])
    expect(searchListings(listings, { type: 'all' })).toHaveLength(3)
  })

  it('按 registryId 过滤', async () => {
    const { searchListings } = await import('../marketplace.service')
    const listings = [
      makeListing('mcp-official:x', 'mcp', 'X', 'd', []),
      makeListing('smithery:y', 'mcp', 'Y', 'd', []),
    ]
    expect(searchListings(listings, { registryId: 'smithery' }).map((l) => l.id)).toEqual([
      'smithery:y',
    ])
  })

  it('空 query 返回全部', async () => {
    const { searchListings } = await import('../marketplace.service')
    const listings = [
      makeListing('a:1', 'mcp', 'A', 'd', []),
      makeListing('b:2', 'skill', 'B', 'd', []),
    ]
    expect(searchListings(listings, {})).toHaveLength(2)
  })
})

/** 构造测试用 listing */
function makeListing(
  id: string,
  type: 'mcp' | 'skill' | 'plugin',
  name: string,
  description: string,
  tags: string[],
) {
  return {
    id,
    type,
    name,
    description,
    author: '',
    version: '',
    tags,
    icon: '🔌',
    registryId: id.split(':')[0],
    install: {} as Record<string, unknown>,
    raw: null,
  }
}

// ============================================================================
// fetchAllListings 聚合 + 错误隔离
// ============================================================================

describe('marketplace.service - fetchAllListings', () => {
  it('聚合多个 registry，单个失败不影响其它', async () => {
    // mcp-official → 成功
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ servers: [officialHttpServer()] }),
    } as Response))
    // smithery → 失败（503）
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    } as Response))

    const { fetchAllListings, BUILTIN_REGISTRIES } = await import('../marketplace.service')
    // 仅启用这两个 registry
    const registries = BUILTIN_REGISTRIES.filter(
      (r) => r.id === 'mcp-official' || r.id === 'smithery',
    )

    const results = await fetchAllListings(registries)

    expect(results).toHaveLength(2)
    const official = results.find((r) => r.registry.id === 'mcp-official')
    const smithery = results.find((r) => r.registry.id === 'smithery')
    expect(official?.listings).toHaveLength(1)
    expect(official?.error).toBeUndefined()
    expect(smithery?.listings).toEqual([])
    expect(smithery?.error).toMatch(/503/)
  })
})
