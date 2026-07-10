import { memo, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Circle,
  CircleDot,
  CheckCircle2,
  CircleSlash,
  Loader2,
  ListTodo,
} from 'lucide-react'
import { cn } from '@/utils/cn'

/** 单个 todo 项 */
export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
}

interface TodoListPanelProps {
  todos: TodoItem[]
}

/** 状态配置 */
const statusConfig = {
  pending: {
    icon: Circle,
    color: 'text-text-tertiary',
    bg: 'bg-bg-tertiary/30',
    label: '待开始',
  },
  in_progress: {
    icon: Loader2,
    color: 'text-accent-blue',
    bg: 'bg-accent-blue/10',
    label: '进行中',
    spin: true,
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-accent-green',
    bg: 'bg-accent-green/10',
    label: '已完成',
  },
  cancelled: {
    icon: CircleSlash,
    color: 'text-text-tertiary',
    bg: 'bg-bg-tertiary/20',
    label: '已取消',
  },
}

/** 优先级配置 */
const priorityConfig = {
  high: { color: 'text-accent-red', dot: 'bg-accent-red' },
  medium: { color: 'text-accent-orange', dot: 'bg-accent-orange' },
  low: { color: 'text-text-tertiary', dot: 'bg-text-tertiary' },
}

/** 排序权重：in_progress > pending > completed > cancelled */
const statusOrder: Record<string, number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
  cancelled: 3,
}

export const TodoListPanel = memo(function TodoListPanel({ todos }: TodoListPanelProps) {
  // 按状态排序
  const sortedTodos = useMemo(() => {
    return [...todos].sort((a, b) => {
      const orderDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
      if (orderDiff !== 0) return orderDiff
      // 同状态内按优先级排序
      const prioOrder = { high: 0, medium: 1, low: 2 }
      return (prioOrder[a.priority] ?? 1) - (prioOrder[b.priority] ?? 1)
    })
  }, [todos])

  // 进度统计
  const stats = useMemo(() => {
    const total = todos.length
    const completed = todos.filter((t) => t.status === 'completed').length
    const inProgress = todos.filter((t) => t.status === 'in_progress').length
    const cancelled = todos.filter((t) => t.status === 'cancelled').length
    const active = total - cancelled
    const percent = active > 0 ? Math.round((completed / active) * 100) : 0
    return { total, completed, inProgress, cancelled, active, percent }
  }, [todos])

  if (todos.length === 0) return null

  return (
    <div className="surface-3d my-2 rounded-md border border-border-default overflow-hidden">
      {/* 头部：标题 + 进度条 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary/50">
        <motion.div
          animate={stats.inProgress > 0 ? { rotate: [0, -8, 8, 0] } : {}}
          transition={{ duration: 0.6, repeat: stats.inProgress > 0 ? Infinity : 0, repeatDelay: 2 }}
        >
          <ListTodo className="h-3.5 w-3.5 text-accent-blue" />
        </motion.div>
        <span className="text-xs font-semibold text-text-primary">任务清单</span>
        <span className="text-xs text-text-tertiary tabular-nums">
          {stats.completed}/{stats.active} 完成
        </span>
        {/* 进度条 */}
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-tertiary">
            <motion.div
              className={cn(
                'h-full rounded-full',
                stats.percent === 100 ? 'bg-accent-green' : 'bg-accent-blue',
              )}
              initial={{ width: 0 }}
              animate={{ width: `${stats.percent}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <AnimatePresence mode="wait">
            <motion.span
              key={stats.percent}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'text-xs font-mono tabular-nums',
                stats.percent === 100 ? 'text-accent-green' : 'text-text-secondary',
              )}
            >
              {stats.percent}%
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* todo 列表 */}
      <div className="divide-y divide-border-default/50">
        <AnimatePresence initial={false}>
          {sortedTodos.map((todo, idx) => {
            const config = statusConfig[todo.status]
            const prioConfig = priorityConfig[todo.priority]
            const Icon = config.icon
            return (
              <motion.div
                key={todo.id}
                layout
                initial={{ opacity: 0, x: -12, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, x: -12, height: 0 }}
                transition={{
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                  delay: idx * 0.04,
                }}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                  config.bg,
                )}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={todo.status}
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 90 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="flex-shrink-0"
                  >
                    <Icon
                      className={cn(
                        'h-3.5 w-3.5',
                        config.color,
                        'spin' in config && config.spin && 'animate-spin',
                      )}
                    />
                  </motion.span>
                </AnimatePresence>
                {/* 优先级圆点 */}
                <span
                  className={cn(
                    'h-1.5 w-1.5 flex-shrink-0 rounded-full',
                    prioConfig.dot,
                  )}
                  title={`优先级: ${todo.priority}`}
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate transition-all duration-300',
                    todo.status === 'completed' && 'text-text-tertiary line-through',
                    todo.status === 'cancelled' && 'text-text-tertiary line-through opacity-60',
                    todo.status === 'pending' && 'text-text-secondary',
                    todo.status === 'in_progress' && 'text-text-primary font-medium',
                  )}
                >
                  {todo.content}
                </span>
                <AnimatePresence>
                  {todo.status === 'in_progress' && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                      className="flex-shrink-0 text-accent-blue"
                    >
                      {config.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* 全部完成庆祝动画 */}
      <AnimatePresence>
        {stats.percent === 100 && stats.total > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-accent-green/30 bg-accent-green/5"
          >
            <div className="flex items-center justify-center gap-1.5 py-1.5 text-xs text-accent-green">
              <motion.span
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1 }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </motion.span>
              <span>全部任务已完成</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
