import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { GoalService } from '../../services/goal.service'

// 用 vi.hoisted 创建捕获 map，使其在 mock 工厂中可用
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}))

// mock electron 的 ipcMain.handle，捕获注册的 handler
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
  },
}))

import { registerGoalIpc } from '../goal.ipc'

let db: DBType
let goalService: GoalService

beforeEach(() => {
  handlers.clear()
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE goals (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT DEFAULT '', conversation_id TEXT, project_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'todo',
      conversation_id TEXT, order_index INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `)
  goalService = new GoalService(db)
  registerGoalIpc(goalService)
})

describe('goal IPC', () => {
  it('goal:createGoal 创建目标', () => {
    const handler = handlers.get('goal:createGoal')
    expect(handler).toBeDefined()
    const goal = handler!(null, { type: 'long_term', title: '测试目标' }) as { title: string }
    expect(goal.title).toBe('测试目标')
  })

  it('goal:listGoals 列出目标', () => {
    goalService.createGoal({ type: 'long_term', title: '目标1' })
    const handler = handlers.get('goal:listGoals')
    expect(handler).toBeDefined()
    const goals = handler!(null) as Array<{ title: string }>
    expect(goals.length).toBe(1)
    expect(goals[0].title).toBe('目标1')
  })

  it('goal:getGoal 获取目标', () => {
    const created = goalService.createGoal({ type: 'long_term', title: '目标' })
    const handler = handlers.get('goal:getGoal')
    expect(handler).toBeDefined()
    const goal = handler!(null, created.id) as { title: string }
    expect(goal.title).toBe('目标')
  })

  it('goal:updateGoalStatus 更新目标状态', () => {
    const created = goalService.createGoal({ type: 'long_term', title: '目标' })
    const handler = handlers.get('goal:updateGoalStatus')
    expect(handler).toBeDefined()
    const goal = handler!(null, created.id, 'completed') as { status: string }
    expect(goal.status).toBe('completed')
  })

  it('goal:deleteGoal 删除目标', () => {
    const created = goalService.createGoal({ type: 'long_term', title: '目标' })
    const handler = handlers.get('goal:deleteGoal')
    expect(handler).toBeDefined()
    handler!(null, created.id)
    expect(goalService.getGoal(created.id)).toBeNull()
  })

  it('goal:createTask 创建任务', () => {
    const goal = goalService.createGoal({ type: 'long_term', title: '目标' })
    const handler = handlers.get('goal:createTask')
    expect(handler).toBeDefined()
    const task = handler!(null, { goal_id: goal.id, title: '任务' }) as { title: string }
    expect(task.title).toBe('任务')
  })

  it('goal:listTasks 列出任务', () => {
    const goal = goalService.createGoal({ type: 'long_term', title: '目标' })
    goalService.createTask({ goal_id: goal.id, title: '任务1' })
    const handler = handlers.get('goal:listTasks')
    expect(handler).toBeDefined()
    const tasks = handler!(null, goal.id) as Array<{ title: string }>
    expect(tasks.length).toBe(1)
    expect(tasks[0].title).toBe('任务1')
  })

  it('goal:updateTaskStatus 更新任务状态', () => {
    const goal = goalService.createGoal({ type: 'long_term', title: '目标' })
    const task = goalService.createTask({ goal_id: goal.id, title: '任务' })
    const handler = handlers.get('goal:updateTaskStatus')
    expect(handler).toBeDefined()
    const updated = handler!(null, task.id, 'doing') as { status: string }
    expect(updated.status).toBe('doing')
  })

  it('goal:updateTask 更新任务', () => {
    const goal = goalService.createGoal({ type: 'long_term', title: '目标' })
    const task = goalService.createTask({ goal_id: goal.id, title: '任务' })
    const handler = handlers.get('goal:updateTask')
    expect(handler).toBeDefined()
    const updated = handler!(null, task.id, { title: '新标题' }) as { title: string }
    expect(updated.title).toBe('新标题')
  })

  it('goal:deleteTask 删除任务', () => {
    const goal = goalService.createGoal({ type: 'long_term', title: '目标' })
    const task = goalService.createTask({ goal_id: goal.id, title: '任务' })
    const handler = handlers.get('goal:deleteTask')
    expect(handler).toBeDefined()
    handler!(null, task.id)
    expect(goalService.getTask(task.id)).toBeNull()
  })
})
