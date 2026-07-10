import { create } from 'zustand'
import type { ThinkingLevel } from '@shared/types/settings'
import type { AgentMode } from '@shared/types/ipc'

export interface PermissionRequest {
  requestId: string
  sessionId: string
  toolName: string
  toolInput: string
  riskLevel: 'low' | 'medium' | 'high'
}

interface UIState {
  leftSidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  workspacePanelCollapsed: boolean
  selectedModel: string
  thinkingLevel: ThinkingLevel
  agentMode: AgentMode
  isMaximized: boolean
  quotedText: string
  pendingInput: string
  pendingPermissionRequest: PermissionRequest | null

  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  toggleWorkspacePanel: () => void
  setLeftSidebarCollapsed: (collapsed: boolean) => void
  setRightSidebarCollapsed: (collapsed: boolean) => void
  setWorkspacePanelCollapsed: (collapsed: boolean) => void
  setSelectedModel: (model: string) => void
  setThinkingLevel: (level: ThinkingLevel) => void
  setAgentMode: (mode: AgentMode) => void
  setMaximized: (maximized: boolean) => void
  setQuotedText: (text: string) => void
  setPendingInput: (text: string) => void
  setPendingPermissionRequest: (req: PermissionRequest | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  leftSidebarCollapsed: false,
  rightSidebarCollapsed: false,
  workspacePanelCollapsed: false,
  selectedModel: 'gpt-4',
  thinkingLevel: 'standard',
  agentMode: 'chat',
  isMaximized: false,
  quotedText: '',
  pendingInput: '',
  pendingPermissionRequest: null,

  toggleLeftSidebar: () => set((state) => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed })),
  toggleRightSidebar: () => set((state) => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed })),
  toggleWorkspacePanel: () => set((state) => ({ workspacePanelCollapsed: !state.workspacePanelCollapsed })),
  setLeftSidebarCollapsed: (collapsed) => set({ leftSidebarCollapsed: collapsed }),
  setRightSidebarCollapsed: (collapsed) => set({ rightSidebarCollapsed: collapsed }),
  setWorkspacePanelCollapsed: (collapsed) => set({ workspacePanelCollapsed: collapsed }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setThinkingLevel: (level) => set({ thinkingLevel: level }),
  setAgentMode: (mode) => set({ agentMode: mode }),
  setMaximized: (maximized) => set({ isMaximized: maximized }),
  setQuotedText: (text) => set({ quotedText: text }),
  setPendingInput: (text) => set({ pendingInput: text }),
  setPendingPermissionRequest: (req) => set({ pendingPermissionRequest: req }),
}))
