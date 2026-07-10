import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { Project } from '@shared/types/project'

afterEach(cleanup)

const now = Date.now()

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
      conversationsByWorkspace: {},
      loadingByWorkspace: {},
      currentConversationId: null,
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

describe('WorkspacePanel', () => {
  it('project name uses gray shimmer', () => {
    render(<WorkspacePanel project={mockProject} />)
    const title = screen.getByText(mockProject.name)
    expect(title).toHaveClass('text-shimmer-gray')
  })
})
