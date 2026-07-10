import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Zap, Brain, Sparkles, Check } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'
import type { ThinkingLevel } from '@shared/types/settings'
import { cn } from '@/utils/cn'

const levelConfig: Record<ThinkingLevel, { label: string; icon: typeof Zap; description: string; color: string }> = {
  fast: { label: '快速', icon: Zap, description: '最低推理深度，快速响应', color: 'text-accent-green' },
  standard: { label: '标准', icon: Sparkles, description: '默认平衡模式', color: 'text-accent-blue' },
  deep: { label: '深度', icon: Brain, description: '最大推理深度，适合复杂任务', color: 'text-accent-purple' },
}

export function ThinkingLevelSelector() {
  const [open, setOpen] = useState(false)
  const thinkingLevel = useUIStore((s) => s.thinkingLevel)
  const setThinkingLevel = useUIStore((s) => s.setThinkingLevel)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const config = levelConfig[thinkingLevel]
  const Icon = config.icon

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border-default bg-white/5 px-2 text-xs text-text-primary transition-smooth-fast hover:bg-white/10 hover:border-border-strong"
        title={config.description}
      >
        <Icon className={cn('h-3.5 w-3.5', config.color)} />
        <span>思考: {config.label}</span>
        <ChevronDown className={cn('h-3 w-3 text-text-tertiary transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="animate-pop-in absolute bottom-full left-0 mb-1 w-56 rounded-md border border-border-strong bg-bg-elevated shadow-lg z-50 p-1"
          >
            {(Object.keys(levelConfig) as ThinkingLevel[]).map((level) => {
              const cfg = levelConfig[level]
              const LevelIcon = cfg.icon
              return (
                <button
                  key={level}
                  onClick={() => {
                    setThinkingLevel(level)
                    setOpen(false)
                  }}
                  className={cn(
                    'relative flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-smooth-fast',
                    thinkingLevel === level
                      ? 'bg-white/5 text-text-primary'
                      : 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
                  )}
                >
                  {/* 选中项左侧蓝色指示条 */}
                  {thinkingLevel === level && (
                    <motion.span
                      layoutId="thinking-level-indicator"
                      className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-blue shadow-glow"
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                  <LevelIcon className={cn('mt-0.5 h-3.5 w-3.5', cfg.color)} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{cfg.label}</span>
                      {thinkingLevel === level && <Check className="h-3 w-3 text-accent-blue" />}
                    </div>
                    <div className="text-xs text-text-tertiary">{cfg.description}</div>
                  </div>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
