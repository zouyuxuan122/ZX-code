import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, Check, Cloud, HardDrive } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import type { ModelInfo, ProviderType } from '@shared/types/model'
import { cn } from '@/utils/cn'

/** 根据 Provider 类型映射图标与颜色 */
function getModelVisual(type: ProviderType): {
  Icon: typeof Cloud
  color: string
} {
  switch (type) {
    case 'anthropic':
      return { Icon: Cloud, color: 'text-accent-orange' }
    case 'gemini':
      return { Icon: Cloud, color: 'text-accent-green' }
    case 'ollama':
      return { Icon: HardDrive, color: 'text-accent-green' }
    case 'openai':
    case 'custom':
    default:
      return { Icon: Cloud, color: 'text-accent-blue' }
  }
}

/** 分组显示名称：网页模型显示为"网页大模型" */
function providerGroupName(provider: string) {
  if (provider === 'webchat') return '网页大模型'
  return provider
}

/** 生成模型复合标识 `provider:name`，用于唯一区分跨 Provider 同名模型 */
function getModelKey(model: ModelInfo): string {
  return `${model.provider}:${model.name}`
}

/**
 * 从复合标识中提取真实模型名（用于 API 调用）。
 * 兼容旧格式（纯 model.name，无冒号）。
 */
export function parseModelName(key: string): string {
  const idx = key.indexOf(':')
  return idx >= 0 ? key.slice(idx + 1) : key
}

export function ModelSelector() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selectedModel = useUIStore((s) => s.selectedModel)
  const setSelectedModel = useUIStore((s) => s.setSelectedModel)
  const availableModels = useChatStore((s) => s.availableModels)
  const loadAvailableModels = useChatStore((s) => s.loadAvailableModels)
  const ref = useRef<HTMLDivElement>(null)

  // 挂载时加载可用模型列表
  useEffect(() => {
    void loadAvailableModels()
  }, [loadAvailableModels])

  // 自动修正 selectedModel：
  // 1. 重启后 selectedModel 可能是默认值 'gpt-4'，但可用列表里没有它
  // 2. 旧版本可能存了 model.name 或 model.id（无 provider 前缀），需迁移为 provider:name 复合标识
  useEffect(() => {
    if (availableModels.length === 0) return
    // 新格式 provider:name 精确匹配
    const existsByKey = availableModels.some((m) => getModelKey(m) === selectedModel)
    if (existsByKey) return
    // 兼容旧格式：selectedModel 是纯 model.name 或 model.id
    const legacyMatch = availableModels.find(
      (m) => m.name === selectedModel || m.id === selectedModel,
    )
    if (legacyMatch) {
      // 迁移为复合标识
      setSelectedModel(getModelKey(legacyMatch))
      return
    }
    // 未匹配到任何模型，自动选择首选模型
    const preferred =
      availableModels.find((m) => m.name.toLowerCase().includes('deepseek')) ??
      availableModels[0]
    setSelectedModel(getModelKey(preferred))
  }, [availableModels, selectedModel, setSelectedModel])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 按 name / provider 过滤
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return availableModels
    return availableModels.filter(
      (m) =>
        m.name.toLowerCase().includes(keyword) ||
        m.provider.toLowerCase().includes(keyword),
    )
  }, [availableModels, search])

  // 按 provider 字段分组
  const grouped = useMemo(() => {
    return filtered.reduce((acc, model) => {
      if (!acc[model.provider]) acc[model.provider] = []
      acc[model.provider].push(model)
      return acc
    }, {} as Record<string, ModelInfo[]>)
  }, [filtered])

  const selected = useMemo(
    // 用 provider:name 复合标识匹配，避免跨 Provider 同名模型重复选中
    () => availableModels.find((m) => getModelKey(m) === selectedModel)
      ?? availableModels.find((m) => m.name === selectedModel || m.id === selectedModel)
      ?? availableModels[0],
    [availableModels, selectedModel],
  )

  const SelectedIcon = selected ? getModelVisual(selected.type).Icon : Cloud
  const selectedColor = selected ? getModelVisual(selected.type).color : 'text-text-tertiary'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border-default bg-white/5 px-2 text-xs text-text-primary transition-smooth-fast hover:bg-white/10 hover:border-border-strong"
      >
        <SelectedIcon className={cn('h-3.5 w-3.5', selectedColor)} />
        <span>{selected ? selected.name : '未选择模型'}</span>
        <ChevronDown className={cn('h-3 w-3 text-text-tertiary transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="animate-pop-in absolute bottom-full left-0 mb-1 w-64 rounded-md border border-border-strong bg-bg-elevated shadow-lg z-50"
          >
            <div className="border-b border-border-default p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索模型..."
                  className="h-7 w-full rounded-md border border-border-default bg-white/5 pl-7 pr-2 text-xs text-text-primary shadow-inset placeholder:text-text-tertiary transition-smooth-fast focus-visible:outline-none focus:border-border-strong focus:ring-1 focus:ring-accent-coffee/30"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-64 overflow-auto p-1">
              {availableModels.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-text-tertiary">
                  暂无可用模型，请到设置中配置 Provider
                </div>
              ) : Object.keys(grouped).length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-text-tertiary">
                  未找到匹配的模型
                </div>
              ) : (
                Object.entries(grouped).map(([provider, models]) => (
                  <div key={provider} className="mb-1">
                    <div className="px-2 py-1 text-xs font-semibold text-text-tertiary">
                      {providerGroupName(provider)}
                    </div>
                    {models.map((model) => {
                      const { Icon, color } = getModelVisual(model.type)
                      return (
                        <button
                          key={model.id}
                          data-provider={model.provider}
                          onClick={() => {
                            // 存 provider:name 复合标识，避免跨 Provider 同名模型重复选中
                            setSelectedModel(getModelKey(model))
                            setOpen(false)
                            setSearch('')
                          }}
                          className={cn(
                            'relative flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-smooth-fast',
                            getModelKey(model) === selectedModel
                              ? 'bg-white/5 text-text-primary'
                              : 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
                          )}
                        >
                          {/* 选中项左侧蓝色指示条 */}
                          {getModelKey(model) === selectedModel && (
                            <motion.span
                              layoutId="model-selector-indicator"
                              className="absolute left-0 top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-accent-blue shadow-glow"
                              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            />
                          )}
                          <Icon className={cn('h-3.5 w-3.5', color)} />
                          <span className="flex-1 truncate">
                            {model.name}
                            {model.provider === 'webchat' && (
                              <span className="ml-1 rounded bg-accent-blue/15 px-1 text-[9px] text-accent-blue">网页</span>
                            )}
                          </span>
                          {getModelKey(model) === selectedModel && (
                            <Check className="h-3 w-3 text-accent-blue" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
