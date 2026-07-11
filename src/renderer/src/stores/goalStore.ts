import { create } from 'zustand'
import type { Goal, Task, KanbanStatus, CreateGoalDto, CreateTaskDto } from '../../../shared/types/goal'
import { ipc } from '@/services/ipc'

interface GoalState {
  goals: Goal[]
  tasks: Task[]
  activeGoal: Goal | null
  loading: boolean

  loadGoals: (type?: 'long_term' | 'session') => Promise<void>
  loadTasks: (goalId: string) => Promise<void>
  setActiveGoal: (goal: Goal | null) => void
  createGoal: (dto: CreateGoalDto) => Promise<Goal>
  createTask: (dto: CreateTaskDto) => Promise<Task>
  updateTaskStatus: (id: string, status: KanbanStatus) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
}

export const useGoalStore = create<GoalState>((set, get) => ({
  goals: [],
  tasks: [],
  activeGoal: null,
  loading: false,

  loadGoals: async (type) => {
    set({ loading: true })
    const goals: Goal[] = await ipc.goal.listGoals(type)
    set({ goals, loading: false })
    // 自动选中第一个 active 目标
    if (goals.length > 0 && !get().activeGoal) {
      const active = goals.find(g => g.status === 'active') || goals[0]
      set({ activeGoal: active })
      await get().loadTasks(active.id)
    }
  },

  loadTasks: async (goalId) => {
    const tasks: Task[] = await ipc.goal.listTasks(goalId)
    set({ tasks })
  },

  setActiveGoal: (goal) => set({ activeGoal: goal }),

  createGoal: async (dto) => {
    const goal: Goal = await ipc.goal.createGoal(dto)
    set(state => ({ goals: [...state.goals, goal] }))
    return goal
  },

  createTask: async (dto) => {
    const task: Task = await ipc.goal.createTask(dto)
    set(state => ({ tasks: [...state.tasks, task] }))
    return task
  },

  updateTaskStatus: async (id, status) => {
    const updated: Task = await ipc.goal.updateTaskStatus(id, status)
    set(state => ({
      tasks: state.tasks.map(t => t.id === id ? updated : t)
    }))
  },

  deleteTask: async (id) => {
    await ipc.goal.deleteTask(id)
    set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }))
  },

  deleteGoal: async (id) => {
    await ipc.goal.deleteGoal(id)
    set(state => ({
      goals: state.goals.filter(g => g.id !== id),
      tasks: state.activeGoal?.id === id ? [] : state.tasks,
      activeGoal: state.activeGoal?.id === id ? null : state.activeGoal
    }))
  }
}))
