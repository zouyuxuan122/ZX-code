import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { GoalService } from '../../../services/goal.service'
import { createGoalTool } from '../goal.tool'
import type { Database as DBType } from 'better-sqlite3'

let db: DBType
let goalService: GoalService

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE conversations (id TEXT PRIMARY KEY);
    CREATE TABLE projects (id TEXT PRIMARY KEY);
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
})

describe('goal_manage tool', () => {
  it('create_goal 创建目标', async () => {
    const tool = createGoalTool(goalService)
    const result = await tool.execute({
      action: 'create_goal',
      goal: { type: 'long_term', title: '测试目标' }
    }, { workspacePath: '', projectId: null, conversationId: '', autoAccept: true })
    expect(result.is_error).toBe(false)
    expect(result.content).toContain('测试目标')
  })

  it('create_task 创建任务', async () => {
    const goal = goalService.createGoal({ type: 'long_term', title: '目标' })
    const tool = createGoalTool(goalService)
    const result = await tool.execute({
      action: 'create_task',
      task: { goal_id: goal.id, title: '测试任务' }
    }, { workspacePath: '', projectId: null, conversationId: '', autoAccept: true })
    expect(result.is_error).toBe(false)
    expect(result.content).toContain('测试任务')
  })

  it('list_goals 列出目标', async () => {
    goalService.createGoal({ type: 'long_term', title: '目标1' })
    const tool = createGoalTool(goalService)
    const result = await tool.execute({ action: 'list_goals' }, { workspacePath: '', projectId: null, conversationId: '', autoAccept: true })
    expect(result.is_error).toBe(false)
    expect(result.content).toContain('目标1')
  })

  it('complete_task 完成任务', async () => {
    const goal = goalService.createGoal({ type: 'long_term', title: '目标' })
    const task = goalService.createTask({ goal_id: goal.id, title: '任务' })
    const tool = createGoalTool(goalService)
    const result = await tool.execute({
      action: 'complete_task',
      task_id: task.id
    }, { workspacePath: '', projectId: null, conversationId: '', autoAccept: true })
    expect(result.is_error).toBe(false)
    const updated = goalService.getTask(task.id)
    expect(updated!.status).toBe('done')
  })
})
