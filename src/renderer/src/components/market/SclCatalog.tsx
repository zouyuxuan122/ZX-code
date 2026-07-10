import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check,
  Download,
  Loader2,
  Search,
  Trash2,
  Power,
  Globe,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { ipc } from '@/services/ipc'
import type { SclExtension, SclCategory, RemoteCatalogEntry } from '@shared/types/scl'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { cn } from '@/utils/cn'

/** 统一缓动 */
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

/** 分类标签配置 */
const CATEGORIES: { id: SclCategory | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'coding', label: '编码' },
  { id: 'debugging', label: '调试' },
  { id: 'testing', label: '测试' },
  { id: 'architecture', label: '架构' },
  { id: 'devops', label: 'DevOps' },
  { id: 'documentation', label: '文档' },
  { id: 'review', label: '审查' },
  { id: 'custom', label: '自定义' },
]

/** 分类徽章颜色 */
const categoryBadgeColor: Record<SclCategory, string> = {
  coding: 'bg-accent-blue/10 text-accent-blue',
  debugging: 'bg-accent-red/10 text-accent-red',
  testing: 'bg-accent-green/10 text-accent-green',
  architecture: 'bg-accent-purple/10 text-accent-purple',
  devops: 'bg-accent-orange/10 text-accent-orange',
  documentation: 'bg-accent-coffee/10 text-accent-coffee',
  review: 'bg-accent-blue/10 text-accent-blue',
  custom: 'bg-bg-tertiary text-text-tertiary',
}

/** 分类中文标签 */
const categoryLabel: Record<SclCategory, string> = {
  coding: '编码',
  debugging: '调试',
  testing: '测试',
  architecture: '架构',
  devops: 'DevOps',
  documentation: '文档',
  review: '审查',
  custom: '自定义',
}

/** 来源标签 */
const sourceLabel: Record<string, string> = {
  builtin: '内置',
  remote: '远程',
  local: '本地',
}

/** 单个技能卡片 */
function SkillCard({
  skill,
  onToggle,
  onUninstall,
}: {
  skill: SclExtension
  onToggle: (id: string, enabled: boolean) => Promise<void>
  onUninstall: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    try {
      await onToggle(skill.id, !skill.enabled)
    } finally {
      setToggling(false)
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
        skill.enabled && 'border-accent-green/30',
      )}
    >
      {/* 头部：图标 + 名称 + 分类徽章 + 来源 */}
      <div className="mb-2 flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>
          {skill.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {skill.name}
            </h3>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                categoryBadgeColor[skill.category],
              )}
            >
              {categoryLabel[skill.category]}
            </span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-text-tertiary">
              {sourceLabel[skill.source] ?? skill.source}
            </span>
            {skill.enabled && (
              <span className="flex items-center gap-0.5 rounded bg-accent-green/10 px-1.5 py-0.5 text-[10px] text-accent-green">
                <Check className="h-2.5 w-2.5" />
                已启用
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-text-tertiary">
            by {skill.author} · v{skill.version}
          </p>
        </div>
      </div>

      {/* 描述 */}
      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-text-secondary">
        {skill.description}
      </p>

      {/* 标签 */}
      <div className="mb-3 flex flex-wrap gap-1">
        {skill.tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-text-tertiary"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* 展开内容预览 */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            className="mb-3 overflow-hidden"
          >
            <pre className="surface-3d max-h-48 overflow-auto whitespace-pre-wrap rounded-md p-2.5 text-[11px] leading-relaxed text-text-secondary">
              {skill.content}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] text-text-tertiary transition-smooth-fast hover:text-text-primary"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {expanded ? '收起' : '预览'}
        </button>
        <div className="flex items-center gap-1.5">
          <Button
            variant={skill.enabled ? 'ghost' : 'primary'}
            size="sm"
            onClick={handleToggle}
            disabled={toggling}
          >
            {toggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
            {skill.enabled ? '禁用' : '启用'}
          </Button>
          {skill.source !== 'builtin' && (
            <button
              onClick={() => onUninstall(skill.id)}
              title="卸载"
              className="lift-button flex h-7 w-7 items-center justify-center rounded text-text-tertiary transition-smooth-fast hover:bg-accent-red/10 hover:text-accent-red"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/** 远程目录拉取器 */
function RemoteCatalogFetcher({ onInstalled }: { onInstalled: () => void }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<RemoteCatalogEntry[] | null>(null)
  const [catalogName, setCatalogName] = useState('')

  const handleFetch = async () => {
    if (!url.trim()) return
    setLoading(true)
    setEntries(null)
    try {
      const catalog = await ipc.scl.fetchRemoteCatalog(url.trim())
      setEntries(catalog.skills)
      setCatalogName(catalog.name)
      toast.success('拉取成功', `目录「${catalog.name}」包含 ${catalog.skills.length} 个技能`)
    } catch (err) {
      toast.error('拉取失败', (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleInstallAll = async () => {
    if (!entries || entries.length === 0) return
    setLoading(true)
    try {
      const installed = await ipc.scl.installFromRemote(url.trim(), entries)
      toast.success('安装完成', `成功安装 ${installed.length} 个技能`)
      setEntries(null)
      setUrl('')
      onInstalled()
    } catch (err) {
      toast.error('安装失败', (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      className="surface-3d mb-3 rounded-md p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <Globe className="h-4 w-4 text-accent-blue" />
        <span className="text-xs font-semibold text-text-secondary">远程目录拉取</span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/skills-catalog.json"
          className="flex-1"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleFetch}
          disabled={loading || !url.trim()}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          拉取
        </Button>
      </div>
      {/* 拉取结果预览 */}
      <AnimatePresence initial={false}>
        {entries && entries.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            className="mt-3 overflow-hidden"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-text-secondary">
                「{catalogName}」共 {entries.length} 个技能
              </span>
              <Button variant="primary" size="sm" onClick={handleInstallAll} disabled={loading}>
                <Download className="h-3.5 w-3.5" />
                全部安装
              </Button>
            </div>
            <div className="space-y-1">
              {entries.slice(0, 10).map((entry, idx) => (
                <div
                  key={`${entry.name}-${idx}`}
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-white/5"
                >
                  <span>{entry.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-text-primary">
                    {entry.name}
                  </span>
                  <span className="text-text-tertiary">{categoryLabel[entry.category] ?? entry.category}</span>
                </div>
              ))}
              {entries.length > 10 && (
                <div className="px-2 py-1 text-[11px] text-text-tertiary">
                  ...还有 {entries.length - 10} 个
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** SCL 技能目录主组件 */
export function SclCatalog({
  searchQuery,
  skills,
  onSkillsChange,
}: {
  searchQuery: string
  skills: SclExtension[]
  onSkillsChange: () => void
}) {
  const [activeCategory, setActiveCategory] = useState<SclCategory | 'all'>('all')

  /** 过滤后的技能列表 */
  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return skills.filter((skill) => {
      if (activeCategory !== 'all' && skill.category !== activeCategory) {
        return false
      }
      if (!q) return true
      return (
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [searchQuery, activeCategory, skills])

  /** 启用 / 禁用技能 */
  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await ipc.scl.toggle(id, enabled)
      toast.success(enabled ? '已启用' : '已禁用', `技能已${enabled ? '启用' : '禁用'}，新对话生效`)
      onSkillsChange()
    } catch (err) {
      toast.error('操作失败', (err as Error).message)
    }
  }

  /** 卸载技能 */
  const handleUninstall = async (id: string) => {
    try {
      await ipc.scl.uninstall(id)
      toast.success('已卸载', '技能已从列表移除')
      onSkillsChange()
    } catch (err) {
      toast.error('卸载失败', (err as Error).message)
    }
  }

  const enabledCount = skills.filter((s) => s.enabled).length

  return (
    <div className="flex flex-col gap-3">
      {/* 远程目录拉取器 */}
      <RemoteCatalogFetcher onInstalled={onSkillsChange} />

      {/* 统计信息 */}
      <div className="flex items-center gap-3 px-1 text-xs text-text-tertiary">
        <span>共 {skills.length} 个技能</span>
        <span>·</span>
        <span className="text-accent-green">{enabledCount} 个已启用</span>
      </div>

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

      {/* 技能卡片网格 */}
      {filteredSkills.length === 0 ? (
        <div className="surface-3d rounded-md px-4 py-10 text-center text-sm text-text-tertiary">
          <Search className="mx-auto mb-2 h-6 w-6 opacity-40" />
          未找到匹配的技能
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
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={handleToggle}
              onUninstall={handleUninstall}
            />
          ))}
        </motion.div>
      )}
    </div>
  )
}

export default SclCatalog
