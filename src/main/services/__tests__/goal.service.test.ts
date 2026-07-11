import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { GoalService } from '../goal.service'
import type { Database as DBType } from 'better-sqlite3'

let db: DBType
let service: GoalService

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE goals (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      conversation_id TEXT,
      project_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      conversation_id TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
    );
  `)
  service = new GoalService(db)
})

describe('GoalService', () => {
  describe('Goal CRUD', () => {
    it('创建长期目标', () => {
      const goal = service.createGoal({ type: 'long_term', title: '完成 v1.0 发布', description: '本季度目标' })
      expect(goal.id).toBeDefined()
      expect(goal.type).toBe('long_term')
      expect(goal.title).toBe('完成 v1.0 发布')
      expect(goal.status).toBe('active')
    })

    it('创建会话目标并关联对话', () => {
      const goal = service.createGoal({ type: 'session', title: '实现登录功能', conversation_id: 'conv1' })
      expect(goal.conversation_id).toBe('conv1')
    })

    it('获取目标', () => {
      const created = service.createGoal({ type: 'long_term', title: '测试目标' })
      const found = service.getGoal(created.id)
      expect(found).not.toBeNull()
      expect(found!.title).toBe('测试目标')
    })

    it('更新目标状态', () => {
      const goal = service.createGoal({ type: 'long_term', title: '目标' })
      const updated = service.updateGoalStatus(goal.id, 'completed')
      expect(updated.status).toBe('completed')
    })

    it('列出目标(按类型过滤)', () => {
      service.createGoal({ type: 'long_term', title: '长期1' })
      service.createGoal({ type: 'session', title: '会话1' })
      const longTerm = service.listGoals('long_term')
      expect(longTerm.length).toBe(1)
      expect(longTerm[0].title).toBe('长期1')
    })

    it('删除目标(级联删除任务)', () => {
      const goal = service.createGoal({ type: 'long_term', title: '目标' })
      service.createTask({ goal_id: goal.id, title: '任务1' })
      service.deleteGoal(goal.id)
      expect(service.getGoal(goal.id)).toBeNull()
      expect(service.listTasks(goal.id).length).toBe(0)
    })
  })

  describe('Task CRUD', () => {
    let goalId: string

    beforeEach(() => {
      const goal = service.createGoal({ type: 'long_term', title: '测试目标' })
      goalId = goal.id
    })

    it('创建任务(默认 todo 状态)', () => {
      const task = service.createTask({ goal_id: goalId, title: '写单元测试' })
      expect(task.id).toBeDefined()
      expect(task.status).toBe('todo')
      expect(task.goal_id).toBe(goalId)
    })

    it('更新任务状态(看板流转)', () => {
      const task = service.createTask({ goal_id: goalId, title: '任务' })
      const updated = service.updateTaskStatus(task.id, 'doing')
      expect(updated.status).toBe('doing')
    })

    it('流转到 done', () => {
      const task = service.createTask({ goal_id: goalId, title: '任务' })
      const updated = service.updateTaskStatus(task.id, 'done')
      expect(updated.status).toBe('done')
    })

    it('列出目标下所有任务', () => {
      service.createTask({ goal_id: goalId, title: '任务1' })
      service.createTask({ goal_id: goalId, title: '任务2' })
      const tasks = service.listTasks(goalId)
      expect(tasks.length).toBe(2)
    })

    it('按状态过滤任务(看板列)', () => {
      const t1 = service.createTask({ goal_id: goalId, title: '任务1' })
      service.createTask({ goal_id: goalId, title: '任务2' })
      service.updateTaskStatus(t1.id, 'doing')
      const doingTasks = service.listTasks(goalId, 'doing')
      expect(doingTasks.length).toBe(1)
      expect(doingTasks[0].title).toBe('任务1')
    })

    it('更新任务标题和描述', () => {
      const task = service.createTask({ goal_id: goalId, title: '原标题' })
      const updated = service.updateTask(task.id, { title: '新标题', description: '新描述' })
      expect(updated.title).toBe('新标题')
      expect(updated.description).toBe('新描述')
    })

    it('删除任务', () => {
      const task = service.createTask({ goal_id: goalId, title: '任务' })
      service.deleteTask(task.id)
      expect(service.listTasks(goalId).length).toBe(0)
    })

    it('任务 order_index 自动递增', () => {
      const t1 = service.createTask({ goal_id: goalId, title: '任务1' })
      const t2 = service.createTask({ goal_id: goalId, title: '任务2' })
      expect(t2.order_index).toBeGreaterThan(t1.order_index)
    })
  })
})
