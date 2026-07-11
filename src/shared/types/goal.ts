/** 看板任务状态 */
export type KanbanStatus = 'todo' | 'doing' | 'done'

/** 目标类型 */
export type GoalType = 'long_term' | 'session'

/** 目标 */
export interface Goal {
  id: string
  type: GoalType
  title: string
  description: string
  /** 关联对话 ID(session 类型时) */
  conversation_id: string | null
  /** 关联项目 ID */
  project_id: string | null
  status: 'active' | 'completed' | 'archived'
  created_at: number
  updated_at: number
}

/** 任务 */
export interface Task {
  id: string
  goal_id: string
  title: string
  description: string
  status: KanbanStatus
  /** 关联对话 ID */
  conversation_id: string | null
  /** 排序序号 */
  order_index: number
  created_at: number
  updated_at: number
}

/** 创建目标 DTO */
export interface CreateGoalDto {
  type: GoalType
  title: string
  description?: string
  conversation_id?: string | null
  project_id?: string | null
}

/** 创建任务 DTO */
export interface CreateTaskDto {
  goal_id: string
  title: string
  description?: string
  conversation_id?: string | null
}

/** Agent goal_manage 工具参数 */
export interface GoalManageToolParams {
  action: 'create_goal' | 'create_task' | 'update_task' | 'list_goals' | 'list_tasks' | 'complete_task'
  goal?: CreateGoalDto
  task?: CreateTaskDto
  task_id?: string
  /** 目标 ID(用于 list_tasks 列出该目标下的任务) */
  goal_id?: string
  updates?: Partial<Pick<Task, 'title' | 'description' | 'status'>>
  goal_type?: GoalType
}
