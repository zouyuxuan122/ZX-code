import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Settings, Cpu, Key, Shield, Palette,
  FileText, FolderGit2, Plug, Globe, LayoutGrid, Volume2, Brain, RefreshCw
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { ProviderSettings } from '@/components/settings/ProviderSettings'
import { TokenJuiceSettings } from '@/components/settings/TokenJuiceSettings'
import { GeneralSettings } from '@/components/settings/GeneralSettings'
import { ApiSettings } from '@/components/settings/ApiSettings'
import { PermissionSettings } from '@/components/settings/PermissionSettings'
import { ThemeSettings } from '@/components/settings/ThemeSettings'
import { LogSettings } from '@/components/settings/LogSettings'
import { WorkspaceAppearanceSettings } from '@/components/settings/WorkspaceAppearanceSettings'
import { McpSettings } from '@/components/settings/McpSettings'
import { WebChatSettings } from '@/components/settings/WebChatSettings'
import { PetSettings } from '@/components/settings/PetSettings'
import { TtsSettings } from '@/components/settings/TtsSettings'
import { MemorySettings } from '@/components/settings/MemorySettings'
import { SyncSettings } from '@/components/settings/SyncSettings'
import { cn } from '@/utils/cn'

const settingTabs = [
  { id: 'general', label: '通用', icon: Settings, desc: '语言、主题、启动行为' },
  { id: 'model', label: '模型与供应商', icon: Cpu, desc: '模型配置、供应商管理' },
  { id: 'webchat', label: '网页大模型', icon: Globe, desc: '网页模型账户登录与模型同步' },
  { id: 'api', label: 'API 设置', icon: Key, desc: 'URL、密钥、参数' },
  { id: 'permission', label: '权限管理', icon: Shield, desc: '资源访问控制' },
  { id: 'mcp', label: 'MCP 服务器', icon: Plug, desc: '扩展工具与外部服务' },
  { id: 'theme', label: '外观', icon: Palette, desc: '主题、字体、快捷键' },
  { id: 'workspace', label: '工作区外观', icon: FolderGit2, desc: '头像、对话背景' },
  { id: 'pet', label: '宠物与九宫格', icon: LayoutGrid, desc: '角色卡、模型、背景、字幕、布局' },
  { id: 'tts', label: '语音合成', icon: Volume2, desc: 'TTS 引擎、音色、声音克隆' },
  { id: 'memory', label: '记忆', icon: Brain, desc: '记忆检索、编辑、导出' },
  { id: 'sync', label: '自动同步', icon: RefreshCw, desc: '外部数据源拉取、调度器' },
  { id: 'log', label: '日志', icon: FileText, desc: '日志级别、错误报告' },
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(tabFromUrl ?? 'general')

  // 同步 URL 中的 tab 参数（支持外部跳转到指定标签）
  useEffect(() => {
    if (tabFromUrl && settingTabs.some((t) => t.id === tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl)
    }
    // 消费后清掉 query，避免刷新后仍停留在该标签
    if (tabFromUrl) {
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl])

  return (
    <div className="animate-fade-in-up flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 items-center gap-3 px-4 backdrop-blur-sm transition-smooth border-b border-border-subtle">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold text-text-primary">设置</h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 p-2 border-r border-border-subtle">
          {settingTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative mb-0.5 flex w-full items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left transition-smooth',
                  isActive
                    ? 'border-border-default bg-hover-surface text-text-primary'
                    : 'text-text-secondary hover:bg-hover-surface hover:text-text-primary',
                )}
              >
                {/* 选中项左侧蓝色指示条 */}
                {isActive && (
                  <motion.span
                    layoutId="settings-tab-indicator"
                    className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-blue shadow-glow"
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
                <Icon className="h-4 w-4" />
                <span className="text-sm">{tab.label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'mx-auto',
                activeTab === 'model' || activeTab === 'webchat' || activeTab === 'pet'
                  ? 'max-w-3xl'
                  : 'max-w-2xl',
              )}
            >
              {activeTab === 'model' ? (
                <div className="space-y-6">
                  <ProviderSettings />
                  <div>
                    <h2 className="mb-1 text-lg font-semibold text-text-primary">工具输出压缩</h2>
                    <p className="mb-4 text-sm text-text-secondary">
                      压缩工具调用结果以节省上下文 token。
                    </p>
                    <TokenJuiceSettings />
                  </div>
                </div>
              ) : activeTab === 'webchat' ? (
                <WebChatSettings />
              ) : (
                <>
                  <h2 className="mb-1 text-lg font-semibold text-text-primary">
                    {settingTabs.find((t) => t.id === activeTab)?.label}
                  </h2>
                  <p className="mb-6 text-sm text-text-secondary">
                    {settingTabs.find((t) => t.id === activeTab)?.desc}
                  </p>

                  {activeTab === 'general' && <GeneralSettings />}
                  {activeTab === 'api' && <ApiSettings />}
                  {activeTab === 'permission' && <PermissionSettings />}
                  {activeTab === 'mcp' && <McpSettings />}
                  {activeTab === 'theme' && <ThemeSettings />}
                  {activeTab === 'workspace' && <WorkspaceAppearanceSettings />}
                  {activeTab === 'pet' && <PetSettings />}
                  {activeTab === 'tts' && <TtsSettings />}
                  {activeTab === 'memory' && <MemorySettings />}
                  {activeTab === 'sync' && <SyncSettings />}
                  {activeTab === 'log' && <LogSettings />}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
