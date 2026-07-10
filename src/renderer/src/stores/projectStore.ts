import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { Project, CreateProjectDto, UpdateProjectDto } from '@shared/types/project'
import { useEffect } from 'react'

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  error: string | null

  loadProjects: () => Promise<void>
  createProject: (data: CreateProjectDto) => Promise<Project>
  updateProject: (id: string, data: UpdateProjectDto) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  switchProject: (id: string) => Promise<void>
  /** 刷新当前工作区（头像/背景更新后） */
  refreshCurrentProject: () => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await ipc.project.list()
      set({ projects, loading: false })

      const activeProjects = projects.filter((p) => p.last_active_at !== null)
      if (activeProjects.length > 0) {
        const sorted = activeProjects.sort((a, b) => (b.last_active_at! - a.last_active_at!))
        set({ currentProject: sorted[0] })
      } else if (projects.length > 0 && !get().currentProject) {
        set({ currentProject: projects[0] })
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  createProject: async (data) => {
    const project = await ipc.project.create(data)
    set((state) => ({ projects: [project, ...state.projects] }))
    return project
  },

  updateProject: async (id, data) => {
    const updated = await ipc.project.update(id, data)
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? updated : p)),
      currentProject: state.currentProject?.id === id ? updated : state.currentProject,
    }))
    return updated
  },

  deleteProject: async (id: string) => {
    await ipc.project.delete(id)
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }))
  },

  switchProject: async (id: string) => {
    await ipc.project.setActive(id)
    const project = get().projects.find((p) => p.id === id)
    if (project) {
      set({ currentProject: project })
    }
  },

  refreshCurrentProject: async () => {
    const current = get().currentProject
    if (!current) return
    const updated = await ipc.project.get(current.id)
    if (updated) {
      set((state) => ({
        currentProject: updated,
        projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
      }))
    }
  },
}))

export function useProjectInit() {
  const loadProjects = useProjectStore((s) => s.loadProjects)
  useEffect(() => {
    loadProjects()
  }, [loadProjects])
}
