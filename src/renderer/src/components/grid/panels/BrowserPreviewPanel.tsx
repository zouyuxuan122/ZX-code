import { useState, useCallback } from 'react'
import { FolderOpen, RefreshCw } from 'lucide-react'
import { ipc } from '@/services/ipc'

export function BrowserPreviewPanel() {
  const [html, setHtml] = useState<string | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleOpen = useCallback(async () => {
    const selected = await ipc.file.selectFile({
      filters: [{ name: '网页', extensions: ['html', 'htm'] }],
    })
    if (!selected) return
    setLoading(true)
    try {
      const result = await ipc.file.readAbsoluteContent(selected)
      if (result.ok && result.content) {
        setHtml(result.content)
        setPath(selected)
      } else {
        setHtml(`<div style="padding:20px;color:red;">${result.error || '读取失败'}</div>`)
        setPath(selected)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    if (!path) return
    const result = await ipc.file.readAbsoluteContent(path)
    if (result.ok && result.content) {
      setHtml(result.content)
    }
  }, [path])

  if (!html) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-bg-primary">
        <button
          type="button"
          onClick={() => void handleOpen()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-secondary"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          选择 HTML 文件
        </button>
      </div>
    )
  }

  const fileName = path?.split(/[\\/]/).pop() ?? ''

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 flex-shrink-0 items-center gap-1.5 border-b border-border-default/30 px-2">
        <span data-testid="preview-path" className="flex-1 truncate text-[11px] text-text-tertiary">{fileName}</span>
        <button onClick={() => void handleRefresh()} className="text-text-tertiary hover:text-text-secondary" title="刷新">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      <iframe
        data-testid="preview-iframe"
        title="preview"
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
        className="flex-1 border-0 bg-white"
      />
    </div>
  )
}
