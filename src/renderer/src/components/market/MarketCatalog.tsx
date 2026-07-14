import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, Download, Loader2, Search } from 'lucide-react'
import { ipc } from '@/services/ipc'
import type { McpServerConfig } from '@shared/types/mcp'
import type { MarketFetchResult, MarketListing } from '@shared/types/marketplace'
import { Button } from '@/components/ui/Button'
import { toast } from '@/stores/toastStore'
import { cn } from '@/utils/cn'

/** 目录条目分类 */
type CatalogCategory =
  | 'filesystem'
  | 'database'
  | 'web'
  | 'devtools'
  | 'productivity'
  | 'ai'

/** 目录条目（内置精选 MCP 服务器） */
export interface CatalogEntry {
  id: string
  name: string
  description: string
  category: CatalogCategory
  type: 'local' | 'remote'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  author: string
  tags: string[]
  /** emoji 图标 */
  icon: string
}

/** 统一缓动 */
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

/** 分类标签配置 */
const CATEGORIES: { id: CatalogCategory | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'filesystem', label: '文件系统' },
  { id: 'database', label: '数据库' },
  { id: 'web', label: '网页' },
  { id: 'devtools', label: '开发工具' },
  { id: 'productivity', label: '生产力' },
  { id: 'ai', label: 'AI' },
]

/** 分类徽章颜色 */
const categoryBadgeColor: Record<CatalogCategory, string> = {
  filesystem: 'bg-accent-orange/10 text-accent-orange',
  database: 'bg-accent-blue/10 text-accent-blue',
  web: 'bg-accent-green/10 text-accent-green',
  devtools: 'bg-accent-purple/10 text-accent-purple',
  productivity: 'bg-accent-coffee/10 text-accent-coffee',
  ai: 'bg-accent-red/10 text-accent-red',
}

/** 分类中文标签 */
const categoryLabel: Record<CatalogCategory, string> = {
  filesystem: '文件系统',
  database: '数据库',
  web: '网页',
  devtools: '开发工具',
  productivity: '生产力',
  ai: 'AI',
}

/** 内置精选 MCP 服务器目录 */
const CATALOG: CatalogEntry[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: '为 Agent 提供本地文件系统读写能力，支持受限目录访问。',
    category: 'filesystem',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    author: 'Anthropic',
    tags: ['文件', '读写', '本地'],
    icon: '📁',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: '通过 GitHub API 管理仓库、Issue、PR，需要 GITHUB_TOKEN 环境变量。',
    category: 'devtools',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    author: 'Anthropic',
    tags: ['Git', 'Issue', 'PR', 'API'],
    icon: '🐙',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: '查询与操作本地 SQLite 数据库，支持 SQL 执行与 schema 查看。',
    category: 'database',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    author: 'Anthropic',
    tags: ['SQL', '数据库', '查询'],
    icon: '🗄️',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer Browser',
    description: '通过 Puppeteer 控制浏览器，支持页面截图、点击、表单填写等操作。',
    category: 'web',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    author: 'Anthropic',
    tags: ['浏览器', '自动化', '截图'],
    icon: '🎭',
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: '通过 Brave Search API 进行网络搜索，需要 BRAVE_API_KEY 环境变量。',
    category: 'web',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    author: 'Anthropic',
    tags: ['搜索', '网络', 'API'],
    icon: '🦁',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: '访问与管理 Google Drive 文件，支持搜索、读取与下载。',
    category: 'productivity',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-drive'],
    author: 'Anthropic',
    tags: ['Google', '云盘', '文件'],
    icon: '💾',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: '与 Slack 工作区交互，支持频道消息读取、发送与搜索。',
    category: 'productivity',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    author: 'Anthropic',
    tags: ['协作', '消息', '团队'],
    icon: '💬',
  },
  {
    id: 'memory',
    name: 'Memory / Knowledge Graph',
    description: '基于知识图谱的持久化记忆，跨会话存储实体与关系。',
    category: 'ai',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    author: 'Anthropic',
    tags: ['记忆', '知识图谱', '持久化'],
    icon: '🧠',
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: '抓取指定 URL 的网页内容并转为 Markdown，供 Agent 阅读理解。',
    category: 'web',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    author: 'Anthropic',
    tags: ['HTTP', '抓取', 'Markdown'],
    icon: '🌐',
  },
  {
    id: 'git',
    name: 'Git',
    description: '本地 Git 仓库操作：状态、diff、log、分支管理等。',
    category: 'devtools',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    author: 'Anthropic',
    tags: ['Git', '版本控制', '本地'],
    icon: '🔧',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: '连接 PostgreSQL 数据库，支持只读 SQL 查询与 schema 探索。',
    category: 'database',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    author: 'Anthropic',
    tags: ['SQL', 'PostgreSQL', '数据库'],
    icon: '🐘',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: '从 Sentry 拉取错误与性能数据，定位线上问题。',
    category: 'devtools',
    type: 'local',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sentry'],
    author: 'Anthropic',
    tags: ['监控', '错误', '线上'],
    icon: '🛡️',
  },
]

/** 将目录条目转换为 MCP 服务器配置（不含 id） */
function catalogToConfig(entry: CatalogEntry): Omit<McpServerConfig, 'id'> {
  const config: Omit<McpServerConfig, 'id'> = {
    name: entry.name,
    type: entry.type,
    enabled: true,
  }
  if (entry.command) config.command = entry.command
  if (entry.args && entry.args.length > 0) config.args = entry.args
  if (entry.url) config.url = entry.url
  if (entry.env) config.env = entry.env
  return config
}

/** 将内置 CatalogEntry 转换为统一 MarketListing（用于回退展示） */
function catalogToListing(entry: CatalogEntry): MarketListing {
  return {
    id: `builtin:${entry.id}`,
    type: 'mcp',
    name: entry.name,
    description: entry.description,
    author: entry.author,
    version: '',
    tags: entry.tags,
    icon: entry.icon,
    registryId: 'builtin',
    install: {
      mcp: {
        type: entry.type,
        command: entry.command,
        args: entry.args,
        url: entry.url,
        env: entry.env,
      },
    },
    raw: entry,
  }
}

/** 来源 registry 显示名称映射 */
const REGISTRY_LABEL: Record<string, string> = {
  'mcp-official': 'MCP 官方',
  smithery: 'Smithery',
  builtin: '内置精选',
}

/** 单个市场条目卡片（统一渲染 live listing 与内置回退条目） */
function ListingCard({
  listing,
  installed,
  onInstall,
}: {
  listing: MarketListing
  installed: boolean
  onInstall: (listing: MarketListing) => Promise<void>
}) {
  const [installing, setInstalling] = useState(false)

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await onInstall(listing)
    } finally {
      setInstalling(false)
    }
  }

  const registryLabel = REGISTRY_LABEL[listing.registryId] ?? listing.registryId

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.35, ease: EASE_OUT_EXPO },
        },
      }}
      className={cn(
        'surface-3d flex flex-col rounded-md p-4',
        installed && 'border-accent-green/30',
      )}
    >
      {/* 头部：图标 + 名称 + 来源徽章 */}
      <div className="mb-2 flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>
          {listing.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {listing.name}
            </h3>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                listing.registryId === 'builtin'
                  ? 'bg-bg-tertiary text-text-tertiary'
                  : 'bg-accent-blue/10 text-accent-blue',
              )}
            >
              {registryLabel}
            </span>
            {listing.verified && (
              <span className="rounded bg-accent-green/10 px-1.5 py-0.5 text-[10px] text-accent-green">
                已认证
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-text-tertiary">
            {listing.author ? `by ${listing.author}` : ''}
            {listing.version ? ` · v${listing.version}` : ''}
          </p>
        </div>
      </div>

      {/* 描述 */}
      <p className="mb-3 line-clamp-3 flex-1 text-xs leading-relaxed text-text-secondary">
        {listing.description}
      </p>

      {/* 标签 */}
      {listing.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {listing.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-text-tertiary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 安装按钮 / 已安装徽章 */}
      <div className="flex items-center justify-end">
        {installed ? (
          <span className="flex items-center gap-1 rounded-md bg-accent-green/10 px-2.5 py-1 text-xs font-medium text-accent-green">
            <Check className="h-3.5 w-3.5" />
            已安装
          </span>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            安装
          </Button>
        )}
      </div>
    </motion.div>
  )
}

/** 目录主组件 */
export function MarketCatalog({
  searchQuery,
  installedServers,
  onInstalledChange,
}: {
  searchQuery: string
  installedServers: McpServerConfig[]
  onInstalledChange: () => void
}) {
  const [activeCategory, setActiveCategory] = useState<CatalogCategory | 'all'>('all')
  const [fetchResults, setFetchResults] = useState<MarketFetchResult[]>([])
  const [loading, setLoading] = useState(true)

  /** 挂载时并发拉取所有真实社区注册表 */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const results = await ipc.marketplace.fetchAll()
        if (!cancelled) setFetchResults(results)
      } catch (err) {
        // 整体失败时不抛出，保留空数组（后续会回退到内置目录）
        if (!cancelled) {
          setFetchResults([
            {
              registry: {
                id: 'unknown',
                name: '社区市场',
                type: 'mcp',
                url: '',
                adapter: 'generic-json',
                enabled: true,
              },
              listings: [],
              error: (err as Error).message,
            },
          ])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** 已安装服务器的名称集合（用于匹配） */
  const installedNames = useMemo(() => {
    return new Set(installedServers.map((s) => s.name))
  }, [installedServers])

  /** 来自真实 registry 的 listing（合并所有成功的 registry） */
  const liveListings = useMemo(() => {
    return fetchResults.flatMap((r) => r.listings)
  }, [fetchResults])

  /** 是否有任意一个 registry 成功返回 listing（用于决定是否回退到内置目录） */
  const hasAnyLiveListing = liveListings.length > 0

  /** 失败的 registry 列表（用于显示错误提示） */
  const failedRegistries = useMemo(() => {
    return fetchResults.filter((r) => r.error)
  }, [fetchResults])

  /** 当无任何 live listing 时，回退到内置精选目录 */
  const fallbackListings = useMemo<MarketListing[]>(() => {
    if (hasAnyLiveListing) return []
    return CATALOG.map(catalogToListing)
  }, [hasAnyLiveListing])

  /** 当前展示的统一 listing 列表（live 优先，回退次之） */
  const displayListings = useMemo(() => {
    return hasAnyLiveListing ? liveListings : fallbackListings
  }, [hasAnyLiveListing, liveListings, fallbackListings])

  /** 按搜索词与分类过滤 */
  const filteredListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return displayListings.filter((l) => {
      if (!q) return true
      return (
        l.name.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [displayListings, searchQuery])

  /** 安装一个市场条目：live → marketplace.install；内置 → mcp.addServer */
  const handleInstall = async (listing: MarketListing) => {
    try {
      if (listing.registryId === 'builtin') {
        // 内置回退：直接走旧 MCP 添加路径
        const entry = listing.raw as CatalogEntry
        await ipc.mcp.addServer(catalogToConfig(entry))
      } else {
        // 来自真实 registry：走 marketplace.install 统一管线
        const result = await ipc.marketplace.install(listing)
        if (!result.ok) {
          toast.error('安装失败', result.message)
          return
        }
      }
      toast.success('安装成功', `「${listing.name}」已添加到已安装列表`)
      onInstalledChange()
    } catch (err) {
      toast.error('安装失败', (err as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 分类筛选（仅在回退到内置目录时展示） */}
      {!hasAnyLiveListing && (
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'rounded-md border px-3 py-1 text-xs transition-smooth-fast',
                  isActive
                    ? 'border-border-strong bg-white/10 text-text-primary'
                    : 'border-transparent text-text-secondary hover:bg-white/5 hover:text-text-primary',
                )}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      )}

      {/* 失败 registry 的错误提示 */}
      {failedRegistries.length > 0 && (
        <div className="flex flex-col gap-1">
          {failedRegistries.map((r) => (
            <div
              key={r.registry.id}
              className="flex items-center gap-2 rounded-md border border-accent-orange/20 bg-accent-orange/5 px-3 py-1.5 text-[11px] text-accent-orange"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>
                {r.registry.name} 拉取失败：{r.error}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 加载中 */}
      {loading ? (
        <div className="surface-3d rounded-md px-4 py-10 text-center text-sm text-text-tertiary">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin opacity-60" />
          正在拉取社区市场...
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="surface-3d rounded-md px-4 py-10 text-center text-sm text-text-tertiary">
          <Search className="mx-auto mb-2 h-6 w-6 opacity-40" />
          未找到匹配的扩展
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.05,
                delayChildren: 0.02,
              },
            },
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filteredListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              installed={installedNames.has(listing.name)}
              onInstall={handleInstall}
            />
          ))}
        </motion.div>
      )}
    </div>
  )
}

export default MarketCatalog
