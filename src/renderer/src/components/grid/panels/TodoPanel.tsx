import { useChatStore } from '@/stores/chatStore'
import { Check, Circle, Clock, Loader } from 'lucide-react'
import { cn } from '@/utils/cn'

const STATUS_CONFIG = {
  completed: { icon: Check, color: 'text-state-success', bg: '' },
  in_progress: { icon: Loader, color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
  pending: { icon: Circle, color: 'text-text-tertiary', bg: '' },
  cancelled: { icon: Clock, color: 'text-text-tertiary', bg: 'opacity-50' },
} as const

export function TodoPanel() {
  const todos = useChatStore((s) => s.todos)

  const completed = todos.filter((t) => t.status === 'completed').length

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 flex-shrink-0 items-center justify-between border-b border-border-default/30 px-2.5">
        <span className="text-[11px] font-medium text-text-tertiary">AI 待办</span>
        {todos.length > 0 && (
          <span data-testid="todo-progress" className="text-[10px] text-text-tertiary">
            {completed}/{todos.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
        {todos.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-text-tertiary/60">
            暂无待办
          </div>
        ) : (
          todos.map((todo) => {
            const cfg = STATUS_CONFIG[todo.status]
            const Icon = cfg.icon
            return (
              <div
                key={todo.id}
                data-todo-item
                className={cn(
                  'flex items-center gap-2 rounded px-2 py-1.5 text-[12px]',
                  cfg.bg,
                )}
              >
                <Icon className={cn('h-3 w-3 flex-shrink-0', cfg.color)} />
                <span className={cn('flex-1 truncate', todo.status === 'completed' && 'line-through text-text-tertiary')}>
                  {todo.content}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
