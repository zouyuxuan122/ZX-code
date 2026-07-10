import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { readAbsoluteContentMock, selectFileMock } = vi.hoisted(() => ({
  readAbsoluteContentMock: vi.fn(),
  selectFileMock: vi.fn(),
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    file: {
      selectFile: selectFileMock,
      readAbsoluteContent: readAbsoluteContentMock,
    },
  },
}))

import { BrowserPreviewPanel } from '@/components/grid/panels/BrowserPreviewPanel'

describe('BrowserPreviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectFileMock.mockResolvedValue(null)
    readAbsoluteContentMock.mockResolvedValue({ ok: false, error: '空' })
  })

  it('初始显示打开文件按钮', () => {
    render(<BrowserPreviewPanel />)
    expect(screen.getByText('选择 HTML 文件')).toBeInTheDocument()
  })

  it('选择文件后加载内容到 iframe srcDoc', async () => {
    selectFileMock.mockResolvedValue('C:/test/index.html')
    readAbsoluteContentMock.mockResolvedValue({ ok: true, content: '<h1>Hello</h1>' })
    render(<BrowserPreviewPanel />)
    fireEvent.click(screen.getByText('选择 HTML 文件'))
    await waitFor(() => {
      const iframe = screen.getByTestId('preview-iframe') as HTMLIFrameElement
      expect(iframe.srcdoc).toContain('<h1>Hello</h1>')
    })
  })

  it('显示当前文件路径', async () => {
    selectFileMock.mockResolvedValue('C:/test/index.html')
    readAbsoluteContentMock.mockResolvedValue({ ok: true, content: '<h1>Hi</h1>' })
    render(<BrowserPreviewPanel />)
    fireEvent.click(screen.getByText('选择 HTML 文件'))
    await waitFor(() => {
      expect(screen.getByTestId('preview-path')).toHaveTextContent('index.html')
    })
  })
})
