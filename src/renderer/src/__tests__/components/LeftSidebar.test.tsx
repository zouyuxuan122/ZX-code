import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

afterEach(cleanup)

const mockProjects = [
  { id: 'proj-1', name: 'MyProject', workspace_path: '/home/proj', color: '#5ba6ff' },
  { id: 'proj-2', name: 'TestRepo', workspace_path: '/home/test', color: '#00d97e' },
]

const mockSwitchProject = vi.fn()

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      projects: mockProjects,
      currentProject: mockProjects[0],
      switchProject: mockSwitchProject,
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      leftSidebarCollapsed: false,
      rightSidebarCollapsed: false,
      workspacePanelCollapsed: false,
      toggleLeftSidebar: vi.fn(),
      toggleRightSidebar: vi.fn(),
      toggleWorkspacePanel: vi.fn(),
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      getSetting: () => 'dark',
      updateSetting: vi.fn(),
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/searchStore', () => ({
  useSearchStore: vi.fn(() => ({})),
}))

vi.mock('@/utils/theme', () => ({
  switchThemeWithTransition: vi.fn(),
}))

vi.mock('@/components/chat/WorkspaceList', () => ({
  WorkspacePanel: ({ project, onClose, onCollapse }: { project: { name: string }; onClose?: () => void; onCollapse?: () => void }) => (
    <div data-testid="workspace-panel">
      <span data-testid="project-name">{project.name}</span>
      {onCollapse && <button data-testid="collapse-panel" onClick={onCollapse}>Collapse</button>}
      {onClose && <button data-testid="close-panel" onClick={onClose}>Close</button>}
    </div>
  ),
}))

import { LeftSidebar } from '@/components/layout/LeftSidebar'

function renderLeftSidebar() {
  return render(
    <MemoryRouter>
      <LeftSidebar />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockSwitchProject.mockReset()
})

describe('LeftSidebar', () => {
  it('renders project initials in the activity bar', () => {
    renderLeftSidebar()
    expect(screen.getByText('M')).toBeInTheDocument()
    expect(screen.getByText('T')).toBeInTheDocument()
  })

  it('switches project on click', () => {
    renderLeftSidebar()
    fireEvent.click(screen.getByText('T'))
    expect(mockSwitchProject).toHaveBeenCalledWith('proj-2')
  })

  it('shows workspace panel for selected project', () => {
    renderLeftSidebar()
    const panel = screen.getByTestId('workspace-panel')
    expect(panel).toBeInTheDocument()
    expect(screen.getByTestId('project-name')).toHaveTextContent('MyProject')
  })

  it('has new project button', () => {
    renderLeftSidebar()
    // 当侧边栏展开时，按钮显示文字而不是 title
    expect(screen.getByText('新建')).toBeInTheDocument()
  })

  it('has settings button', () => {
    renderLeftSidebar()
    // 当侧边栏展开时，按钮显示文字而不是 title
    expect(screen.getByText('设置')).toBeInTheDocument()
  })

  it('project list area is scrollable', () => {
    renderLeftSidebar()
    // 检查项目列表区域是否有 overflow-y-auto 类
    const projectList = document.querySelector('.overflow-y-auto')
    expect(projectList).toBeInTheDocument()
  })
})
