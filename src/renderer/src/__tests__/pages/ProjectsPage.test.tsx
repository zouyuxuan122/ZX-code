import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const { mockShowInFolder, mockNavigate, mockToast, mockProjectStoreState } = vi.hoisted(() => ({
  mockShowInFolder: vi.fn(),
  mockNavigate: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  mockProjectStoreState: {
    projects: [] as Array<{
      id: string
      name: string
      workspace_path: string
      description: string | null
      created_at: number
    }>,
    currentProject: null as null | { id: string },
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    switchProject: vi.fn(),
  },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn((selector: (s: unknown) => unknown) => selector(mockProjectStoreState)),
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    file: { showInFolder: mockShowInFolder },
    system: { selectDirectory: vi.fn() },
  },
}))

vi.mock('@/stores/toastStore', () => ({
  toast: mockToast,
}))

import ProjectsPage from '@/pages/ProjectsPage'

const sampleProject = {
  id: 'proj-1',
  name: 'MyProject',
  workspace_path: 'D:/projects/my-project',
  description: '测试项目',
  created_at: Date.now(),
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockProjectStoreState.projects = [sampleProject]
  mockProjectStoreState.currentProject = { id: 'proj-1' }
  mockShowInFolder.mockResolvedValue({ ok: true })
})

describe('ProjectsPage 打开工作区功能', () => {
  it('项目列表中显示打开工作区按钮', () => {
    render(<ProjectsPage />)
    expect(screen.getByTitle('在文件管理器中打开')).toBeInTheDocument()
  })

  it('点击打开按钮调用 ipc.file.showInFolder', async () => {
    render(<ProjectsPage />)
    fireEvent.click(screen.getByTitle('在文件管理器中打开'))
    await waitFor(() => {
      expect(mockShowInFolder).toHaveBeenCalledWith('D:/projects/my-project')
    })
  })

  it('showInFolder 返回失败时显示错误提示', async () => {
    mockShowInFolder.mockResolvedValue({ ok: false, error: '路径不存在' })
    render(<ProjectsPage />)
    fireEvent.click(screen.getByTitle('在文件管理器中打开'))
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('打开失败', '路径不存在')
    })
  })

  it('工作区路径为空时显示警告', async () => {
    mockProjectStoreState.projects = [{ ...sampleProject, workspace_path: '' }]
    render(<ProjectsPage />)
    fireEvent.click(screen.getByTitle('在文件管理器中打开'))
    await waitFor(() => {
      expect(mockToast.warning).toHaveBeenCalledWith('无法打开', '该项目未设置工作区路径')
    })
    expect(mockShowInFolder).not.toHaveBeenCalled()
  })

  it('showInFolder 抛出异常时显示错误', async () => {
    mockShowInFolder.mockRejectedValue(new Error('IPC 调用失败'))
    render(<ProjectsPage />)
    fireEvent.click(screen.getByTitle('在文件管理器中打开'))
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('打开失败', 'IPC 调用失败')
    })
  })
})
