import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { ProviderConfig, ModelInfo } from '@shared/types/model'

const { mockUpdateModelContextLength, mockListModels, mockTestConnection, mockUpdate } = vi.hoisted(() => ({
  mockUpdateModelContextLength: vi.fn(),
  mockListModels: vi.fn(),
  mockTestConnection: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    provider: {
      listModels: mockListModels,
      testConnection: mockTestConnection,
      update: mockUpdate,
      updateModelContextLength: mockUpdateModelContextLength,
    },
  },
}))

vi.mock('@/stores/toastStore', () => ({
  toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

import { ProviderCard } from '@/components/settings/ProviderSettings'

const baseProvider: ProviderConfig = {
  id: 'prov-1',
  name: 'TestProvider',
  type: 'openai',
  base_url: 'https://api.test.com/v1',
  api_key: 'sk-test',
  enabled: true,
  created_at: Date.now(),
  updated_at: Date.now(),
}

const mockModels: ModelInfo[] = [
  { id: 'model-1', name: 'deepseek-v4-flash', provider: 'TestProvider', provider_id: 'prov-1', type: 'openai', context_length: 200000, supports_tools: true, supports_vision: false },
  { id: 'model-2', name: 'glm-5.2', provider: 'TestProvider', provider_id: 'prov-1', type: 'openai', context_length: 1000000, supports_tools: true, supports_vision: true },
]

/** 展开卡片并加载模型 */
async function expandAndLoadModels() {
  render(<ProviderCard provider={baseProvider} onChange={vi.fn()} onDelete={vi.fn()} />)
  // 先点击 provider 名称展开卡片
  fireEvent.click(screen.getByText('TestProvider'))
  // 点击"拉取模型列表"按钮加载模型
  fireEvent.click(screen.getByText('拉取模型列表'))
  await waitFor(() => {
    expect(screen.getByText('200K')).toBeInTheDocument()
  })
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockListModels.mockResolvedValue({ ok: true, models: mockModels })
  mockTestConnection.mockResolvedValue({ ok: true, modelCount: 2 })
  mockUpdate.mockResolvedValue(undefined)
  mockUpdateModelContextLength.mockResolvedValue(undefined)
})

describe('ProviderSettings 按模型上下文长度编辑', () => {
  it('模型列表中显示 context_length 按钮', async () => {
    await expandAndLoadModels()
    expect(screen.getByText('200K')).toBeInTheDocument()
    expect(screen.getByText('1000K')).toBeInTheDocument()
  })

  it('点击 context_length 按钮进入编辑模式', async () => {
    await expandAndLoadModels()
    fireEvent.click(screen.getByText('200K'))
    expect(screen.getByDisplayValue('200000')).toBeInTheDocument()
  })

  it('输入有效值并 blur 时调用 updateModelContextLength', async () => {
    await expandAndLoadModels()
    fireEvent.click(screen.getByText('200K'))
    const input = screen.getByDisplayValue('200000')
    fireEvent.change(input, { target: { value: '500000' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(mockUpdateModelContextLength).toHaveBeenCalledWith('prov-1', 'model-1', 500000)
    })
  })

  it('输入小于 1000 的值时显示错误', async () => {
    await expandAndLoadModels()
    fireEvent.click(screen.getByText('200K'))
    const input = screen.getByDisplayValue('200000')
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(screen.getByText('上下文长度需在 1,000 ~ 1,000,000 之间')).toBeInTheDocument()
    })
    expect(mockUpdateModelContextLength).not.toHaveBeenCalled()
  })

  it('输入大于 1000000 的值时显示错误', async () => {
    await expandAndLoadModels()
    fireEvent.click(screen.getByText('200K'))
    const input = screen.getByDisplayValue('200000')
    fireEvent.change(input, { target: { value: '2000000' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(screen.getByText('上下文长度需在 1,000 ~ 1,000,000 之间')).toBeInTheDocument()
    })
    expect(mockUpdateModelContextLength).not.toHaveBeenCalled()
  })

  it('按 Escape 取消编辑', async () => {
    await expandAndLoadModels()
    fireEvent.click(screen.getByText('200K'))
    const input = screen.getByDisplayValue('200000')
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.getByText('200K')).toBeInTheDocument()
    })
    expect(screen.queryByDisplayValue('200000')).not.toBeInTheDocument()
  })
})
