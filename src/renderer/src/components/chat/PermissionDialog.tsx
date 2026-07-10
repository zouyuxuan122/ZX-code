import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { getRiskLevelForTool } from '../../../../main/utils/permission-risk'
import { cn } from '@/utils/cn'

const riskConfig = {
  low: { label: '[i] 低风险', color: 'text-accent-blue' },
  medium: { label: '[i] 中风险', color: 'text-accent-orange' },
  high: { label: '[!] 高风险操作', color: 'text-accent-red' },
}

export const PermissionDialog = memo(function PermissionDialog() {
  const request = useUIStore((s) => s.pendingPermissionRequest)
  const setRequest = useUIStore((s) => s.setPendingPermissionRequest)
  const approveToolCall = useChatStore((s) => s.approveToolCall)
  const pendingApprovals = useChatStore((s) => s.pendingApprovals)

  if (!request) return null

  const risk = riskConfig[request.riskLevel]

  /** 解决当前请求后，如果有更多待审批项则显示下一个 */
  const resolveAndShowNext = () => {
    setRequest(null)
    // 从 pendingApprovals 中找到下一个（排除当前已解决的）
    const next = useChatStore.getState().pendingApprovals.find(
      (p) => p.toolCallId !== request.requestId,
    )
    if (next) {
      setRequest({
        requestId: next.toolCallId,
        sessionId: next.conversationId,
        toolName: next.name,
        toolInput: next.args,
        riskLevel: getRiskLevelForTool(next.name),
      })
    }
  }

  const handleAllow = () => {
    void approveToolCall(request.requestId, true, 'once')
    resolveAndShowNext()
  }

  const handleDeny = () => {
    void approveToolCall(request.requestId, false)
    resolveAndShowNext()
  }

  const handleAlwaysAllow = () => {
    void approveToolCall(request.requestId, true, 'always')
    resolveAndShowNext()
  }

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          className="permission-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setRequest(null)
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="surface-3d w-full max-w-md rounded-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cn('mb-3 text-sm font-semibold', risk.color)}>
              {risk.label}
            </div>

            <h3 className="mb-1 text-base font-semibold text-text-primary">权限请求</h3>
            <p className="mb-4 text-xs text-text-secondary">AI 请求执行以下操作</p>

            <div className="mb-3 rounded-md border border-border-default bg-bg-primary px-3 py-2">
              <div className="text-xs font-medium text-text-secondary">工具</div>
              <div className="text-sm font-mono text-text-primary">{request.toolName}</div>
            </div>

            <div className="mb-4 rounded-md border border-border-default bg-bg-primary p-2.5">
              <div className="mb-1 text-xs font-medium text-text-secondary">参数</div>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-xs text-text-primary font-mono">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(request.toolInput), null, 2)
                  } catch {
                    return request.toolInput
                  }
                })()}
              </pre>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAlwaysAllow}
                className="flex-1 rounded-md bg-accent-blue px-3 py-2 text-xs font-medium text-white hover:bg-accent-blue-hover transition-smooth-fast"
              >
                总是允许
              </button>
              <button
                type="button"
                onClick={handleDeny}
                className="flex-1 rounded-md border border-accent-red/50 px-3 py-2 text-xs font-medium text-accent-red hover:bg-accent-red/10 transition-smooth-fast"
              >
                拒绝
              </button>
              <button
                type="button"
                onClick={handleAllow}
                className="flex-1 rounded-md border border-border-default px-3 py-2 text-xs font-medium text-text-primary hover:bg-white/5 transition-smooth-fast"
              >
                仅本次允许
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
