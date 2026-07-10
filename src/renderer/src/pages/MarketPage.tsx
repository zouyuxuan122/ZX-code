import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Package, Search, Store, Sparkles } from 'lucide-react'
import { ipc } from '@/services/ipc'
import type { McpServerConfig } from '@shared/types/mcp'
import type { SclExtension } from '@shared/types/scl'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MarketCatalog } from '@/components/market/MarketCatalog'
import { InstalledExtensions } from '@/components/market/InstalledExtensions'
import { SclCatalog } from '@/components/market/SclCatalog'
import { cn } from '@/utils/cn'

/** 统一缓动 */
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

/** 顶部标签配置 */
type MarketTab = 'mcp_catalog' | 'mcp_installed' | 'scl'
const TABS: Array<{ id: MarketTab; label: string; icon: typeof Store }> = [
  { id: 'mcp_catalog', label: 'MCP 市场', icon: Store },
  { id: 'mcp_installed', label: '已安装 MCP', icon: Package },
  { id: 'scl', label: '技能 (SCL)', icon: Sparkles },
]

export default function MarketPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<MarketTab>('mcp_catalog')
  const [searchQuery, setSearchQuery] = useState('')
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [skills, setSkills] = useState<SclExtension[]>([])

  /** 拉取已安装 MCP 服务器列表 */
  const loadServers = useCallback(async () => {
    try {
      const list = await ipc.mcp.listServers()
      setServers(list)
    } catch {
      // 静默失败
    }
  }, [])

  /** 拉取已安装 SCL 技能列表 */
  const loadSkills = useCallback(async () => {
    try {
      const list = await ipc.scl.list()
      setSkills(list)
    } catch {
      // 静默失败
    }
  }, [])

  useEffect(() => {
    void loadServers()
    void loadSkills()
  }, [loadServers, loadSkills])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 头部：返回按钮 + 标题 */}
      <div className="flex h-12 items-center gap-3 border-b border-border-default px-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Store className="h-4 w-4 text-text-secondary" />
        <h1 className="text-base font-semibold text-text-primary">扩展市场</h1>
      </div>

      {/* 搜索栏 */}
      <div className="border-b border-border-default p-3">
        <div className="relative mx-auto max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索扩展（名称 / 描述 / 标签）..."
            className="pl-9"
          />
        </div>
      </div>

      {/* 标签切换 */}
      <div className="flex items-center gap-1 border-b border-border-default px-4 py-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const badge =
            tab.id === 'mcp_installed' && servers.length > 0
              ? servers.length
              : tab.id === 'scl' && skills.length > 0
                ? skills.length
                : 0
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-smooth-fast',
                isActive
                  ? 'text-text-primary'
                  : 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {badge > 0 && (
                <span className="ml-1 rounded bg-white/10 px-1.5 text-[10px] text-text-secondary">
                  {badge}
                </span>
              )}
              {isActive && (
                <motion.span
                  layoutId="market-tab-indicator"
                  className="absolute inset-x-0 -bottom-2 h-0.5 rounded-full bg-accent-blue shadow-glow"
                  transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* 内容区：仅入场动画，无退出动画（避免白屏） */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-4xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            >
              {activeTab === 'mcp_catalog' ? (
                <MarketCatalog
                  searchQuery={searchQuery}
                  installedServers={servers}
                  onInstalledChange={loadServers}
                />
              ) : activeTab === 'mcp_installed' ? (
                <InstalledExtensions
                  servers={servers}
                  onServersChange={loadServers}
                />
              ) : (
                <SclCatalog
                  searchQuery={searchQuery}
                  skills={skills}
                  onSkillsChange={loadSkills}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
