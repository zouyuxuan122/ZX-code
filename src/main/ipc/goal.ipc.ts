import { ipcMain } from 'electron'
import { GoalService } from '../services/goal.service'
import { getDb } from '../database'
import type { CreateGoalDto, CreateTaskDto, Goal, KanbanStatus, Task } from '@shared/types/goal'

/**
 * 目标与看板任务 IPC handler
 *
 * 注册 10 个通道：
 * - goal:listGoals / goal:getGoal / goal:createGoal / goal:updateGoalStatus / goal:deleteGoal
 * - goal:listTasks / goal:createTask / goal:updateTaskStatus / goal:updateTask / goal:deleteTask
 *
 * @param goalService 可选注入，用于测试；默认从全局 DB 构造
 */
export function registerGoalIpc(goalService?: GoalService): void {
  const service = goalService ?? new GoalService(getDb())

  // --- Goal CRUD ---

  ipcMain.handle('goal:listGoals', (_event, type?: Goal['type']) => {
    return service.listGoals(type)
  })

  ipcMain.handle('goal:getGoal', (_event, id: string) => {
    return service.getGoal(id)
  })

  ipcMain.handle('goal:createGoal', (_event, dto: CreateGoalDto) => {
    return service.createGoal(dto)
  })

  ipcMain.handle('goal:updateGoalStatus', (_event, id: string, status: Goal['status']) => {
    return service.updateGoalStatus(id, status)
  })

  ipcMain.handle('goal:deleteGoal', (_event, id: string) => {
    service.deleteGoal(id)
  })

  // --- Task CRUD ---

  ipcMain.handle('goal:listTasks', (_event, goalId: string, status?: KanbanStatus) => {
    return service.listTasks(goalId, status)
  })

  ipcMain.handle('goal:createTask', (_event, dto: CreateTaskDto) => {
    return service.createTask(dto)
  })

  ipcMain.handle('goal:updateTaskStatus', (_event, taskId: string, status: KanbanStatus) => {
    return service.updateTaskStatus(taskId, status)
  })

  ipcMain.handle('goal:updateTask', (_event, taskId: string, updates: Partial<Pick<Task, 'title' | 'description' | 'status'>>) => {
    return service.updateTask(taskId, updates)
  })

  ipcMain.handle('goal:deleteTask', (_event, taskId: string) => {
    service.deleteTask(taskId)
  })
}
