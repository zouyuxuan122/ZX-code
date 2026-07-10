import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { Conversation } from '@shared/types/conversation'
import type { Project } from '@shared/types/project'

afterEach(cleanup)

const now = Date.now()

const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    project_id: 'proj-1',
    title: 'Hello World',
    model: 'gpt-4',
    thinking_level: 'standard',
    created_at: now - 3600000,
    updated_at: now - 3600000,
  },
  {
    id: 'conv-2',
    project_id: 'proj-1',
    title: 'Debug Session',
    model: 'gpt-4',
    thinking_level: 'standard',
    created_at: now - 86400000,
    updated_at: now - 86400000,
  },
]

const mockProject: Project = {
  id: 'proj-1',
  name: 'MyProject',
  workspace_path: 'D:\\projects\\myproject',
  description: null,
  created_at: now,
  updated_at: now,
  last_active_at: null,
  settings: '{}',
  ai_avatar: '',
  user_avatar: '',
  background: '',
  background_type: 'none',
}

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      conversationsByWorkspace: { 'proj-1': mockConversations },
      loadingByWorkspace: {},
      currentConversationId: 'conv-1',
      selectConversation: vi.fn(),
      deleteConversation: vi.fn(),
      renameConversation: vi.fn(),
      createConversation: vi.fn(),
      loadWorkspaceConversations: vi.fn(),
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { switchProject: vi.fn() }
    return selector(state)
  }),
}))

import { WorkspacePanel } from '@/components/chat/WorkspaceList'

function renderPanel(project: Project = mockProject) {
  return render(<WorkspacePanel project={project} />)
}

describe('WorkspacePanel', () => {
  it('renders project name with text-shimmer-gray', () => {
    renderPanel()
    const name = screen.getByText('MyProject')
    expect(name).toBeInTheDocument()
    expect(name.closest('.text-shimmer-gray')).toBeTruthy()
  })

  it('renders project path', () => {
    renderPanel()
    expect(screen.getByText('D:\\projects\\myproject')).toBeInTheDocument()
  })

  it('renders "新建会话" button', () => {
    renderPanel()
    expect(screen.getByText('新建会话')).toBeInTheDocument()
  })

  it('renders conversation items', () => {
    renderPanel()
    expect(screen.getByText('Hello World')).toBeInTheDocument()
    expect(screen.getByText('Debug Session')).toBeInTheDocument()
  })

  it('shows relative time for conversations', () => {
    renderPanel()
    expect(screen.getByText('1 小时前')).toBeInTheDocument()
    expect(screen.getByText('1 天前')).toBeInTheDocument()
  })

  it('applies border-glow-active to active conversation', () => {
    renderPanel()
    const activeItem = screen.getByText('Hello World').closest('.border-glow-active')
    expect(activeItem).toBeTruthy()
  })
})
