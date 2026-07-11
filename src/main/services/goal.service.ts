import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { Goal, Task, CreateGoalDto, CreateTaskDto, KanbanStatus } from '@shared/types/goal'

type DB = Database.Database

/**
 * 目标与看板任务持久化服务
 * 负责 Goal/Task 的 CRUD 及看板状态流转
 */
export class GoalService {
  constructor(private db: DB) {}

  // ---------------------------------------------------------------------------
  // Goal CRUD
  // ---------------------------------------------------------------------------

  createGoal(dto: CreateGoalDto): Goal {
    const now = Date.now()
    const id = randomUUID()
    return this.db.prepare(
      `INSERT INTO goals (id, type, title, description, conversation_id, project_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?) RETURNING *`,
    ).get(
      id,
      dto.type,
      dto.title,
      dto.description ?? '',
      dto.conversation_id ?? null,
      dto.project_id ?? null,
      now,
      now,
    ) as Goal
  }

  getGoal(id: string): Goal | null {
    return (this.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as Goal) ?? null
  }

  updateGoalStatus(id: string, status: Goal['status']): Goal {
    return this.db.prepare(
      'UPDATE goals SET status = ?, updated_at = ? WHERE id = ? RETURNING *',
    ).get(status, Date.now(), id) as Goal
  }

  listGoals(type?: Goal['type']): Goal[] {
    if (type) {
      return this.db.prepare('SELECT * FROM goals WHERE type = ? ORDER BY updated_at DESC').all(type) as Goal[]
    }
    return this.db.prepare('SELECT * FROM goals ORDER BY updated_at DESC').all() as Goal[]
  }

  deleteGoal(id: string): void {
    // 手动级联删除任务：测试库未必开启 foreign_keys pragma，显式删除保证一致
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM tasks WHERE goal_id = ?').run(id)
      this.db.prepare('DELETE FROM goals WHERE id = ?').run(id)
    })
    tx()
  }

  // ---------------------------------------------------------------------------
  // Task CRUD
  // ---------------------------------------------------------------------------

  createTask(dto: CreateTaskDto): Task {
    const now = Date.now()
    const id = randomUUID()
    const row = this.db.prepare(
      'SELECT COALESCE(MAX(order_index), -1) AS max_order FROM tasks WHERE goal_id = ?',
    ).get(dto.goal_id) as { max_order: number }
    const orderIndex = row.max_order + 1
    return this.db.prepare(
      `INSERT INTO tasks (id, goal_id, title, description, status, conversation_id, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?) RETURNING *`,
    ).get(
      id,
      dto.goal_id,
      dto.title,
      dto.description ?? '',
      dto.conversation_id ?? null,
      orderIndex,
      now,
      now,
    ) as Task
  }

  getTask(id: string): Task | null {
    return (this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task) ?? null
  }

  updateTaskStatus(id: string, status: KanbanStatus): Task {
    return this.db.prepare(
      'UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? RETURNING *',
    ).get(status, Date.now(), id) as Task
  }

  updateTask(id: string, updates: Partial<Pick<Task, 'title' | 'description' | 'status'>>): Task {
    const sets: string[] = []
    const values: unknown[] = []
    if (updates.title !== undefined) {
      sets.push('title = ?')
      values.push(updates.title)
    }
    if (updates.description !== undefined) {
      sets.push('description = ?')
      values.push(updates.description)
    }
    if (updates.status !== undefined) {
      sets.push('status = ?')
      values.push(updates.status)
    }
    sets.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)
    return this.db.prepare(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    ).get(...values) as Task
  }

  listTasks(goalId: string, status?: KanbanStatus): Task[] {
    if (status) {
      return this.db.prepare(
        'SELECT * FROM tasks WHERE goal_id = ? AND status = ? ORDER BY order_index ASC',
      ).all(goalId, status) as Task[]
    }
    return this.db.prepare('SELECT * FROM tasks WHERE goal_id = ? ORDER BY order_index ASC').all(goalId) as Task[]
  }

  deleteTask(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }
}
