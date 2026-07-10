import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Download, Loader2, Search } from 'lucide-react'
import { ipc } from '@/services/ipc'
import type { McpServerConfig } from '@shared/types/mcp'
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

/** 单个目录卡片 */
function CatalogCard({
  entry,
  installed,
  onInstall,
}: {
  entry: CatalogEntry
  installed: boolean
  onInstall: (entry: CatalogEntry) => Promise<void>
}) {
  const [installing, setInstalling] = useState(false)

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await onInstall(entry)
    } finally {
      setInstalling(false)
    }
  }

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
      {/* 头部：图标 + 名称 + 分类徽章 */}
      <div className="mb-2 flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>
          {entry.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {entry.name}
            </h3>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                categoryBadgeColor[entry.category],
              )}
            >
              {categoryLabel[entry.category]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-text-tertiary">
            by {entry.author}
          </p>
        </div>
      </div>

      {/* 描述 */}
      <p className="mb-3 line-clamp-3 flex-1 text-xs leading-relaxed text-text-secondary">
        {entry.description}
      </p>

      {/* 标签 */}
      <div className="mb-3 flex flex-wrap gap-1">
        {entry.tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-text-tertiary"
          >
            {tag}
          </span>
        ))}
      </div>

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

  /** 已安装服务器的名称集合（用于匹配） */
  const installedNames = useMemo(() => {
    return new Set(installedServers.map((s) => s.name))
  }, [installedServers])

  /** 过滤后的条目列表 */
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return CATALOG.filter((entry) => {
      if (activeCategory !== 'all' && entry.category !== activeCategory) {
        return false
      }
      if (!q) return true
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [searchQuery, activeCategory])

  /** 安装一个目录条目 */
  const handleInstall = async (entry: CatalogEntry) => {
    try {
      await ipc.mcp.addServer(catalogToConfig(entry))
      toast.success('安装成功', `「${entry.name}」已添加到已安装列表`)
      onInstalledChange()
    } catch (err) {
      toast.error('安装失败', (err as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 分类筛选 */}
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

      {/* 卡片网格 */}
      {filteredEntries.length === 0 ? (
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
          {filteredEntries.map((entry) => (
            <CatalogCard
              key={entry.id}
              entry={entry}
              installed={installedNames.has(entry.name)}
              onInstall={handleInstall}
            />
          ))}
        </motion.div>
      )}
    </div>
  )
}

export default MarketCatalog
