import { motion } from 'framer-motion'
import { MessageSquare, ListChecks, Hammer } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import type { AgentMode } from '@shared/types/ipc'
import { cn } from '@/utils/cn'

/** 模式定义 */
const MODES: Array<{
  value: AgentMode
  label: string
  Icon: typeof MessageSquare
  desc: string
}> = [
  { value: 'chat', label: 'Chat', Icon: MessageSquare, desc: '自由对话' },
  { value: 'plan', label: 'Plan', Icon: ListChecks, desc: '先规划再执行' },
  { value: 'build', label: 'Build', Icon: Hammer, desc: '直接构建' },
]

/**
 * Agent 工作模式切换器
 *
 * 三档：
 * - chat：普通对话，AI 不主动改文件
 * - plan：规划模式，AI 先输出步骤计划，确认后再执行
 * - build：构建模式，AI 直接动手写代码
 */
export function ModeSwitcher() {
  const mode = useUIStore((s) => s.agentMode)
  const setMode = useUIStore((s) => s.setAgentMode)

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border-default bg-bg-tertiary p-0.5">
      {MODES.map(({ value, label, Icon, desc }) => {
        const active = mode === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            title={desc}
            className={cn(
              'relative flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-smooth-fast',
              active
                ? 'text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            {active && (
              <motion.span
                layoutId="mode-switcher-active"
                className="absolute inset-0 rounded border border-border-strong bg-white/10"
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
            <Icon className="relative h-3 w-3" />
            <span className="relative">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
