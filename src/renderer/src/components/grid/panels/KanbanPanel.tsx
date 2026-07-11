import { useEffect, useState } from 'react'
import { Plus, Trash2, Target } from 'lucide-react'
import { useGoalStore } from '@/stores/goalStore'
import type { Task, KanbanStatus } from '@shared/types/goal'
import { cn } from '@/utils/cn'

const COLUMNS: { status: KanbanStatus; label: string; dot: string }[] = [
  { status: 'todo', label: '待办', dot: 'bg-text-tertiary' },
  { status: 'doing', label: '进行中', dot: 'bg-accent-blue' },
  { status: 'done', label: '已完成', dot: 'bg-state-success' },
]

export function KanbanPanel() {
  const {
    goals,
    tasks,
    activeGoal,
    loadGoals,
    loadTasks,
    setActiveGoal,
    createTask,
    updateTaskStatus,
    deleteTask,
  } = useGoalStore()
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [dragStatus, setDragStatus] = useState<KanbanStatus | null>(null)

  useEffect(() => {
    void loadGoals()
  }, [loadGoals])

  const tasksByStatus = (status: KanbanStatus) => tasks.filter((t) => t.status === status)

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !activeGoal) return
    await createTask({ goal_id: activeGoal.id, title: newTaskTitle.trim() })
    setNewTaskTitle('')
  }

  const handleDrop = async (newStatus: KanbanStatus) => {
    setDragStatus(null)
    const taskId = dragTaskId
    dragTaskId = null
    if (!taskId) return
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === newStatus) return
    await updateTaskStatus(task.id, newStatus)
  }

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      {/* 顶部：目标选择器 */}
      <div className="flex h-7 flex-shrink-0 items-center gap-1.5 border-b border-border-default/30 px-2.5">
        <Target className="h-3 w-3 flex-shrink-0 text-text-tertiary" />
        <select
          value={activeGoal?.id || ''}
          onChange={(e) => {
            const goal = goals.find((g) => g.id === e.target.value)
            if (goal) {
              setActiveGoal(goal)
              void loadTasks(goal.id)
            }
          }}
          className="min-w-0 flex-1 cursor-pointer truncate bg-transparent text-[11px] font-medium text-text-secondary outline-none"
        >
          {goals.length === 0 && <option value="">暂无目标</option>}
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </div>

      {/* 看板列 */}
      <div className="grid flex-1 grid-cols-3 gap-px overflow-hidden bg-border-default/30">
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus(col.status)
          const isDropTarget = dragStatus === col.status
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault()
                setDragStatus(col.status)
              }}
              onDragLeave={(e) => {
                // 仅当离开整列时清除（避免子元素切换抖动）
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragStatus((s) => (s === col.status ? null : s))
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                void handleDrop(col.status)
              }}
              className={cn(
                'flex min-w-0 flex-col bg-bg-primary transition-colors',
                isDropTarget && 'bg-bg-tertiary',
              )}
            >
              <div className="flex items-center gap-1.5 px-2 py-1">
                <span className={cn('h-1.5 w-1.5 rounded-full', col.dot)} />
                <span className="text-[10px] font-medium text-text-tertiary">{col.label}</span>
                <span className="ml-auto text-[10px] text-text-tertiary/60">{colTasks.length}</span>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto px-1.5 pb-1.5">
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onDelete={() => void deleteTask(task.id)}
                  />
                ))}
                {colTasks.length === 0 && (
                  <div className="flex h-8 items-center justify-center text-[10px] text-text-tertiary/40">
                    —
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 底部：快速添加任务 */}
      {activeGoal && (
        <div className="flex flex-shrink-0 items-center gap-1.5 border-t border-border-default/30 px-2 py-1.5">
          <input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateTask()
            }}
            placeholder="添加任务..."
            className="min-w-0 flex-1 rounded border border-border-default bg-bg-secondary px-2 py-1 text-[11px] text-text-primary outline-none focus:border-accent-blue"
          />
          <button
            type="button"
            onClick={() => void handleCreateTask()}
            disabled={!newTaskTitle.trim()}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-bg-tertiary text-text-secondary transition-colors hover:bg-accent-blue hover:text-white disabled:opacity-40"
            aria-label="添加任务"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

// 模块级变量：当前正在拖拽的任务 ID（HTML5 drag API 传递）
let dragTaskId: string | null = null

function TaskCard({ task, onDelete }: { task: Task; onDelete: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        dragTaskId = task.id
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', task.id)
      }}
      onDragEnd={() => {
        dragTaskId = null
      }}
      className="group cursor-move rounded border border-border-default/40 bg-bg-secondary px-2 py-1.5 text-[11px] text-text-primary transition-colors hover:bg-bg-tertiary"
    >
      <div className="flex items-start gap-1">
        <span className={cn('flex-1 break-words', task.status === 'done' && 'text-text-tertiary line-through')}>
          {task.title}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="flex-shrink-0 text-text-tertiary opacity-0 transition-opacity hover:text-state-error group-hover:opacity-100"
          aria-label="删除任务"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  )
}
