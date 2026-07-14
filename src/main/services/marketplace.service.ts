import { logger } from './logger.service'
import * as mcpService from './mcp.service'
import * as sclService from './scl.service'
import type {
  MarketRegistry,
  MarketListing,
  MarketAdapter,
  MarketSearchFilters,
  MarketFetchResult,
  MarketInstallResult,
} from '@shared/types/marketplace'

/** 默认拉取超时（毫秒） */
const DEFAULT_TIMEOUT = 15000

// ============================================================================
// 内置真实社区注册表
// ============================================================================

/**
 * 内置注册表：全部指向真实可访问的社区 / 官方市场。
 * - MCP 官方 registry：https://registry.modelcontextprotocol.io （无需认证）
 * - Smithery registry：https://registry.smithery.ai （公开列表，无需认证）
 * - 技能 / 插件目录：标准 catalog JSON，用户可在设置中追加任意社区目录
 */
export const BUILTIN_REGISTRIES: MarketRegistry[] = [
  {
    id: 'mcp-official',
    name: 'MCP 官方注册表',
    type: 'mcp',
    url: 'https://registry.modelcontextprotocol.io/v0/servers',
    adapter: 'mcp-official',
    enabled: true,
    official: true,
    description: 'Anthropic 官方维护的 MCP 服务器注册表',
  },
  {
    id: 'smithery',
    name: 'Smithery',
    type: 'mcp',
    url: 'https://registry.smithery.ai/servers?pageSize=200',
    adapter: 'smithery',
    enabled: true,
    description: '社区维护的 MCP 服务器目录（7000+）',
  },
]

/** 获取所有内置注册表 */
export function listRegistries(): MarketRegistry[] {
  return BUILTIN_REGISTRIES.filter((r) => r.enabled)
}

// ============================================================================
// 适配器
// ============================================================================

/** 官方 MCP registry 响应中的单条服务器条目 */
interface OfficialServerEntry {
  server?: {
    name?: string
    title?: string
    description?: string
    version?: string
    remotes?: Array<{ type: string; url: string }>
    repository?: { url?: string; source?: string }
    package?: { name?: string; registry?: string }
  }
  _meta?: Record<string, { isLatest?: boolean; status?: string }>
}

/** 解析官方 MCP registry 响应 */
function adaptMcpOfficial(data: unknown, registryId: string): MarketListing[] {
  const resp = (data as { servers?: OfficialServerEntry[] }) ?? {}
  const entries = Array.isArray(resp.servers) ? resp.servers : []

  // 同名服务器去重：仅保留 isLatest=true 的版本
  const byName = new Map<string, OfficialServerEntry>()
  for (const entry of entries) {
    const name = entry?.server?.name
    if (!name) continue
    const meta = entry._meta?.['io.modelcontextprotocol.registry/official']
    const existing = byName.get(name)
    if (!existing) {
      byName.set(name, entry)
      continue
    }
    const existingLatest =
      existing._meta?.['io.modelcontextprotocol.registry/official']?.isLatest === true
    const entryLatest = meta?.isLatest === true
    // 当前是 latest 且已存在不是 latest，则替换
    if (entryLatest && !existingLatest) {
      byName.set(name, entry)
    }
  }

  const listings: MarketListing[] = []
  for (const entry of byName.values()) {
    const s = entry.server
    if (!s) continue
    // 优先 streamable-http / http，其次 sse
    const remote = (s.remotes || []).find(
      (r) => r.type === 'streamable-http' || r.type === 'http' || r.type === 'sse',
    )
    if (!remote) continue
    listings.push({
      id: `${registryId}:${s.name}`,
      type: 'mcp',
      name: s.title || s.name || '未命名',
      description: s.description || '',
      author: '',
      version: s.version || '',
      tags: [],
      icon: '🔌',
      registryId,
      repository: s.repository?.url,
      verified: true,
      install: { mcp: { type: 'remote', url: remote.url } },
      raw: entry,
    })
  }
  return listings
}

/** Smithery registry 列表响应中的单条服务器 */
interface SmitheryServerEntry {
  qualifiedName?: string
  displayName?: string
  description?: string
  iconUrl?: string | null
  verified?: boolean
  remote?: boolean
  isDeployed?: boolean
  useCount?: number
  owner?: string
  homepage?: string
  createdAt?: string
}

/** 解析 Smithery registry 响应（公开 list 接口） */
function adaptSmithery(data: unknown, registryId: string): MarketListing[] {
  const resp = (data as { servers?: SmitheryServerEntry[] }) ?? {}
  const entries = Array.isArray(resp.servers) ? resp.servers : []
  const listings: MarketListing[] = []
  for (const e of entries) {
    const qname = e?.qualifiedName
    if (!qname) continue
    const isRemote = e.remote === true || e.isDeployed === true
    listings.push({
      id: `${registryId}:${qname}`,
      type: 'mcp',
      name: e.displayName || qname,
      description: e.description || '',
      author: e.owner || '',
      version: '',
      tags: [],
      icon: '🔌',
      registryId,
      repository: e.homepage,
      verified: e.verified === true,
      // Smithery list 未直接给出连接 URL；标记为 remote，url 留空，
      // 安装时 UI 引导用户到 homepage 配置（或后续按需拉取 detail）。
      install: isRemote ? { mcp: { type: 'remote' } } : {},
      raw: e,
    })
  }
  return listings
}

/** SCL 技能目录条目（与 RemoteCatalogEntry 对齐） */
interface SclCatalogEntry {
  name?: string
  description?: string
  category?: string
  content?: string
  tags?: string[]
  icon?: string
  author?: string
  version?: string
}

/** 解析项目自有技能目录响应（RemoteCatalogResponse） */
function adaptSclCatalog(data: unknown, registryId: string): MarketListing[] {
  const resp = (data as { skills?: SclCatalogEntry[] }) ?? {}
  const entries = Array.isArray(resp.skills) ? resp.skills : []
  const listings: MarketListing[] = []
  for (const e of entries) {
    const name = e?.name
    if (!name || !e.content) continue
    listings.push({
      id: `${registryId}:${name}`,
      type: 'skill',
      name,
      description: e.description || '',
      author: e.author || '',
      version: e.version || '',
      tags: Array.isArray(e.tags) ? e.tags : [],
      icon: e.icon || '🧪',
      registryId,
      install: {
        skill: {
          content: e.content,
          category: e.category || 'custom',
          tags: Array.isArray(e.tags) ? e.tags : undefined,
          icon: e.icon,
        },
      },
      raw: e,
    })
  }
  return listings
}

/** 通用 JSON 插件目录条目 */
interface GenericPluginEntry {
  name?: string
  description?: string
  author?: string
  version?: string
  tags?: string[]
  icon?: string
  manifest?: Record<string, unknown>
}

/**
 * 解析通用 JSON 插件目录。
 * 兼容多种数组字段命名：plugins / mcp / servers / skills。
 */
function adaptGenericJson(data: unknown, registry: MarketRegistry): MarketListing[] {
  const obj = (data ?? {}) as Record<string, unknown>
  const arrayKey = ['plugins', 'mcp', 'servers', 'skills'].find((k) => Array.isArray(obj[k]))
  const entries = arrayKey ? (obj[arrayKey] as GenericPluginEntry[]) : []
  const listings: MarketListing[] = []
  for (const e of entries) {
    const name = e?.name
    if (!name) continue
    listings.push({
      id: `${registry.id}:${name}`,
      type: registry.type,
      name,
      description: e.description || '',
      author: e.author || '',
      version: e.version || '',
      tags: Array.isArray(e.tags) ? e.tags : [],
      icon: e.icon || '🧩',
      registryId: registry.id,
      install: {
        plugin: { manifest: e.manifest ?? {} },
      },
      raw: e,
    })
  }
  return listings
}

/** 根据 adapter 名称分发解析 */
function adapt(data: unknown, registry: MarketRegistry): MarketListing[] {
  switch (registry.adapter as MarketAdapter) {
    case 'mcp-official':
      return adaptMcpOfficial(data, registry.id)
    case 'smithery':
      return adaptSmithery(data, registry.id)
    case 'scl-catalog':
      return adaptSclCatalog(data, registry.id)
    case 'generic-json':
      return adaptGenericJson(data, registry)
    case 'cline':
      // Cline marketplace 适配器（保留扩展位，目前按 generic-json 兜底）
      return adaptGenericJson(data, registry)
    default:
      logger.warn(`[marketplace] 未知适配器: ${registry.adapter}`)
      return []
  }
}

// ============================================================================
// 拉取
// ============================================================================

/**
 * 从单个 registry 拉取并归一化条目
 * 使用 globalThis.fetch（在 Electron 主进程也支持，且便于测试 mock）
 */
export async function fetchListings(registry: MarketRegistry): Promise<MarketListing[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)
  try {
    logger.info(`[marketplace] 正在拉取市场目录: ${registry.name} (${registry.url})`)
    const res = await fetch(registry.url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ZX-Code/0.3.0 (https://github.com/zouyuxuan122/ZX-code)',
      },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`拉取市场目录失败: HTTP ${res.status} ${res.statusText}`)
    }
    const data = await res.json()
    const listings = adapt(data, registry)
    logger.info(`[marketplace] ${registry.name} 拉取成功，共 ${listings.length} 个条目`)
    return listings
  } catch (err) {
    const e = err as Error
    const isTimeout =
      e.name === 'AbortError' ||
      e.name === 'TimeoutError' ||
      (typeof e.message === 'string' && /abort|timed?\s*out/i.test(e.message))
    if (isTimeout) {
      throw new Error(`拉取市场目录超时（${DEFAULT_TIMEOUT}ms）: ${registry.url}`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** 单个 registry 的聚合结果（含错误隔离） */
export type RegistryFetchResult = MarketFetchResult

/**
 * 并发拉取所有（或指定）registry，单个失败不影响其它。
 * 返回每个 registry 的结果与可能的错误信息。
 */
export async function fetchAllListings(
  registries?: MarketRegistry[],
): Promise<MarketFetchResult[]> {
  const list = registries && registries.length > 0 ? registries : listRegistries()
  return Promise.all(
    list.map(async (registry) => {
      try {
        const listings = await fetchListings(registry)
        return { registry, listings, error: undefined }
      } catch (err) {
        const message = (err as Error).message || String(err)
        logger.warn(`[marketplace] ${registry.name} 拉取失败: ${message}`)
        return { registry, listings: [] as MarketListing[], error: message }
      }
    }),
  )
}

// ============================================================================
// 本地搜索
// ============================================================================

/**
 * 在已拉取的 listings 上做本地过滤。
 * query 匹配 name / description / tags（大小写不敏感）。
 */
export function searchListings(
  listings: MarketListing[],
  filters: MarketSearchFilters,
): MarketListing[] {
  const { query, type, registryId, category } = filters
  const q = query?.trim().toLowerCase()
  return listings.filter((l) => {
    if (type && type !== 'all' && l.type !== type) return false
    if (registryId && l.registryId !== registryId) return false
    if (category) {
      const cat = l.install.skill?.category
      if (cat !== category && !l.tags.includes(category)) return false
    }
    if (q) {
      const hay = [l.name, l.description, ...l.tags].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

// ============================================================================
// 安装
// ============================================================================

/**
 * 将市场条目安装到本地（路由到 mcp / scl 安装管线）。
 * - mcp (remote, 有 url) → 添加为远程 MCP 服务器
 * - mcp (local, 有 command) → 添加为本地进程 MCP 服务器
 * - skill → 安装为 SCL 技能（默认禁用，用户手动启用）
 * - plugin → 暂不支持直接安装（仅展示 manifest）
 */
export async function installListing(
  listing: MarketListing,
): Promise<MarketInstallResult> {
  try {
    if (listing.type === 'mcp') {
      const mcp = listing.install.mcp
      if (!mcp) {
        return { ok: false, message: '该条目缺少 MCP 安装信息' }
      }
      if (mcp.type === 'remote') {
        if (!mcp.url) {
          const hint = listing.repository
            ? `该远程服务器未直接暴露连接 URL，请前往主页配置：${listing.repository}`
            : '该远程服务器未直接暴露连接 URL，请手动添加'
          return { ok: false, message: hint }
        }
        const newServer = mcpService.addMcpServer({
          name: listing.name,
          type: 'remote',
          url: mcp.url,
          headers: mcp.env, // headers 复用 env 槽位（极少用）
          enabled: true,
        })
        // 安装后自动尝试连接，让用户安装即可用
        const connStatus = await mcpService.connectMcpServer(newServer.id)
        if (connStatus.connected) {
          return { ok: true, message: `已安装并连接 MCP 服务器：${listing.name}（${connStatus.toolCount} 个工具）` }
        }
        return {
          ok: true,
          message: `已安装 MCP 服务器：${listing.name}（未能连接：${connStatus.error || '未知错误'}，请稍后在已安装列表中手动连接）`,
        }
      }
      // local
      if (!mcp.command) {
        return { ok: false, message: '该本地 MCP 服务器缺少启动命令' }
      }
      const newLocalServer = mcpService.addMcpServer({
        name: listing.name,
        type: 'local',
        command: mcp.command,
        args: mcp.args,
        env: mcp.env,
        enabled: true,
      })
      // 本地服务器也自动尝试连接
      const localConnStatus = await mcpService.connectMcpServer(newLocalServer.id)
      if (localConnStatus.connected) {
        return { ok: true, message: `已安装并连接 MCP 服务器：${listing.name}（${localConnStatus.toolCount} 个工具）` }
      }
      return {
        ok: true,
        message: `已安装 MCP 服务器：${listing.name}（未能连接：${localConnStatus.error || '未知错误'}，请稍后在已安装列表中手动连接）`,
      }
    }

    if (listing.type === 'skill') {
      const skill = listing.install.skill
      if (!skill) {
        return { ok: false, message: '该条目缺少技能内容' }
      }
      sclService.installSclExtension({
        name: listing.name,
        description: listing.description,
        category: skill.category as never,
        author: listing.author,
        version: listing.version,
        content: skill.content,
        tags: listing.tags,
        enabled: false, // 默认禁用，用户手动启用
        source: 'remote',
        icon: skill.icon || listing.icon,
      })
      return { ok: true, message: `已安装技能：${listing.name}` }
    }

    // plugin
    return {
      ok: false,
      message: '暂不支持自动安装插件 manifest，请手动应用',
    }
  } catch (err) {
    const message = (err as Error).message || String(err)
    logger.error(`[marketplace] 安装失败 [${listing.id}]: ${message}`, err as Error)
    return { ok: false, message: `安装失败：${message}` }
  }
}
