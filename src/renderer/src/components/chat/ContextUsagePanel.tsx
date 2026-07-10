import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Gauge, ChevronDown, ChevronRight, RefreshCw, Scissors,
  Cpu, User, Bot, Wrench, FileText, Layers,
} from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { useContextStore } from '@/stores/contextStore'
import { toast } from '@/stores/toastStore'
import { cn } from '@/utils/cn'
import type { ContextBreakdown } from '@shared/types/context'

/**
 * 上下文使用情况面板
 *
 * 展示：
 * - 顶部进度条：当前 token / 上限 + 使用率百分比
 * - 5 项明细：系统提示 / 用户消息 / 助手回复 / 工具调用 / 历史摘要
 * - 可折叠的消息级 token 列表（点击展开查看每条消息占用）
 * - 手动压缩按钮 + 压缩历史信息
 */
export function ContextUsagePanel() {
  const conversationId = useChatStore((s) => s.currentConversationId)
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const usage = useContextStore((s) => s.usage)
  const messageTokens = useContextStore((s) => s.messageTokens)
  const compressing = useContextStore((s) => s.compressing)
  const loadUsage = useContextStore((s) => s.loadUsage)
  const loadMessageTokens = useContextStore((s) => s.loadMessageTokens)
  const compress = useContextStore((s) => s.compress)

  const [expanded, setExpanded] = useState(false)
  const [showMessages, setShowMessages] = useState(false)

  // 跟随对话切换 + 消息变化刷新
  useEffect(() => {
    if (!conversationId) return
    void loadUsage(conversationId)
    void loadMessageTokens(conversationId)
  }, [conversationId, messages.length, isStreaming, loadUsage, loadMessageTokens])

  // 没有活动对话
  if (!conversationId) {
    return (
      <div className="px-3 py-3 text-center text-xs text-text-tertiary">
        选择对话后查看上下文使用情况
      </div>
    )
  }

  // 数据未就绪
  if (!usage) {
    return (
      <div className="px-3 py-3 text-center text-xs text-text-tertiary">
        加载中...
      </div>
    )
  }

  const percent = usage.usagePercent
  const isOverThreshold = percent >= usage.compressThreshold
  const isDangerous = percent >= 90

  // 进度条颜色：绿 → 黄 → 红
  const barColor = isDangerous
    ? 'bg-accent-red shadow-[0_0_8px_rgba(239,68,68,0.6)]'
    : isOverThreshold
      ? 'bg-accent-orange shadow-[0_0_6px_rgba(249,115,22,0.5)]'
      : 'bg-accent-green shadow-[0_0_6px_rgba(34,197,94,0.4)]'

  const handleManualCompress = async () => {
    if (!conversationId || compressing) return
    const result = await compress(conversationId)
    if (result.ok) {
      toast.success('对话已压缩')
      await loadUsage(conversationId)
      await loadMessageTokens(conversationId)
    } else {
      toast.error('压缩失败', result.error)
    }
  }

  const handleRefresh = async () => {
    if (!conversationId) return
    await loadUsage(conversationId)
    await loadMessageTokens(conversationId)
  }

  return (
    <div className="flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="lift-button flex items-center gap-1.5 text-text-secondary transition-smooth-fast hover:text-text-primary"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Gauge className="h-4 w-4" />
          <span className="text-xs font-semibold">上下文使用</span>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            title="刷新"
            onClick={handleRefresh}
            className="lift-button flex h-6 w-6 items-center justify-center rounded text-text-tertiary transition-smooth-fast hover:bg-white/10 hover:text-text-primary"
          >
            <RefreshCw className={cn('h-3 w-3', false && 'animate-spin')} />
          </button>
          <button
            title="手动压缩"
            onClick={handleManualCompress}
            disabled={compressing || isStreaming}
            className={cn(
              'lift-button flex h-6 w-6 items-center justify-center rounded transition-smooth-fast',
              compressing || isStreaming
                ? 'cursor-not-allowed text-text-tertiary opacity-50'
                : 'text-text-tertiary hover:bg-white/10 hover:text-accent-orange',
            )}
          >
            <Scissors className={cn('h-3 w-3', compressing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* 进度条 + 概览 */}
      <div className="px-3 pb-2">
        <div className="surface-3d rounded-md p-3">
          {/* 百分比大字 */}
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums text-text-primary">
              {percent}
              <span className="ml-0.5 text-xs font-normal text-text-tertiary">%</span>
            </span>
            <div className="text-right">
              <div className="font-mono text-xs tabular-nums text-text-secondary">
                {formatNumber(usage.totalTokens)} / {formatNumber(usage.maxContextLength)}
              </div>
              <div className="text-xs text-text-tertiary">tokens</div>
            </div>
          </div>

          {/* 进度条 */}
          <div className="relative h-2 overflow-hidden rounded-full border border-border-default bg-bg-tertiary">
            <motion.div
              className={cn('absolute inset-y-0 left-0 rounded-full', barColor)}
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* 阈值标记 */}
            <div
              className="absolute inset-y-0 w-px bg-text-tertiary/60"
              style={{ left: `${usage.compressThreshold}%` }}
              title={`压缩阈值 ${usage.compressThreshold}%`}
            />
          </div>

          {/* 状态行 */}
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className={cn(
              'flex items-center gap-1',
              isDangerous ? 'text-accent-red' : isOverThreshold ? 'text-accent-orange' : 'text-accent-green',
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', barColor)} />
              {isDangerous
                ? '接近上限'
                : isOverThreshold
                  ? '已达压缩阈值'
                  : '使用正常'}
            </span>
            <span className="text-text-tertiary">
              阈值 {usage.compressThreshold}%
            </span>
          </div>

          {/* 压缩历史 */}
          {usage.compressCount > 0 && (
            <div className="mt-2 flex items-center gap-1 border-t border-border-default pt-2 text-xs text-text-tertiary">
              <Layers className="h-3 w-3" />
              <span>已压缩 {usage.compressCount} 次</span>
              {usage.lastCompressedAt > 0 && (
                <span className="ml-auto">
                  {formatTime(usage.lastCompressedAt)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 明细列表（可折叠） */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2">
              <div className="surface-3d rounded-md p-3">
                <div className="mb-2 text-xs font-semibold text-text-secondary">
                  分类占用
                </div>
                <div className="space-y-1.5">
                  <BreakdownRow
                    icon={<Cpu className="h-3 w-3" />}
                    label="系统提示"
                    tokens={usage.breakdown.system}
                    total={usage.totalTokens}
                    barColor="bg-accent-blue"
                    iconColor="text-accent-blue"
                  />
                  <BreakdownRow
                    icon={<User className="h-3 w-3" />}
                    label="用户消息"
                    tokens={usage.breakdown.user}
                    total={usage.totalTokens}
                    barColor="bg-accent-green"
                    iconColor="text-accent-green"
                  />
                  <BreakdownRow
                    icon={<Bot className="h-3 w-3" />}
                    label="助手回复"
                    tokens={usage.breakdown.assistant}
                    total={usage.totalTokens}
                    barColor="bg-accent-orange"
                    iconColor="text-accent-orange"
                  />
                  <BreakdownRow
                    icon={<Wrench className="h-3 w-3" />}
                    label="工具调用"
                    tokens={usage.breakdown.tool}
                    total={usage.totalTokens}
                    barColor="bg-accent-purple"
                    iconColor="text-accent-purple"
                  />
                  {usage.breakdown.summary > 0 && (
                    <BreakdownRow
                      icon={<FileText className="h-3 w-3" />}
                      label="历史摘要"
                      tokens={usage.breakdown.summary}
                      total={usage.totalTokens}
                      barColor="bg-text-tertiary"
                      iconColor="text-text-tertiary"
                    />
                  )}
                </div>

                {/* 消息级明细（可折叠） */}
                <div className="mt-3 border-t border-border-default pt-2">
                  <button
                    onClick={() => setShowMessages(!showMessages)}
                    className="lift-button flex w-full items-center gap-1 text-xs text-text-secondary transition-smooth-fast hover:text-text-primary"
                  >
                    {showMessages ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span>按消息查看（{messageTokens.length} 条）</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {showMessages && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 max-h-48 space-y-1 overflow-auto pr-1">
                          {messageTokens.map((m) => (
                            <div
                              key={m.messageId}
                              className="flex items-center gap-2 rounded border border-border-default bg-bg-tertiary px-2 py-1.5 text-xs"
                            >
                              <RoleBadge role={m.role} />
                              <span className="flex-1 truncate text-text-secondary">
                                {m.description}
                              </span>
                              <span className="font-mono tabular-nums text-text-tertiary">
                                {m.tokens}
                              </span>
                            </div>
                          ))}
                          {messageTokens.length === 0 && (
                            <div className="py-2 text-center text-xs text-text-tertiary">
                              暂无消息
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** 明细行：图标 + 标签 + 微进度条 + token 数 */
function BreakdownRow({
  icon, label, tokens, total, barColor, iconColor,
}: {
  icon: React.ReactNode
  label: string
  tokens: number
  total: number
  barColor: string
  iconColor: string
}) {
  const percent = total > 0 ? (tokens / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn('flex-shrink-0', iconColor)}>{icon}</span>
      <span className="w-16 flex-shrink-0 text-text-secondary">{label}</span>
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', barColor)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-12 flex-shrink-0 text-right font-mono tabular-nums text-text-tertiary">
        {formatNumber(tokens)}
      </span>
    </div>
  )
}

/** 角色徽章 */
function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    system: 'bg-accent-blue/20 text-accent-blue',
    user: 'bg-accent-green/20 text-accent-green',
    assistant: 'bg-accent-orange/20 text-accent-orange',
    tool: 'bg-accent-purple/20 text-accent-purple',
  }
  const labels: Record<string, string> = {
    system: 'SYS',
    user: 'USR',
    assistant: 'AIS',
    tool: 'TOOL',
  }
  return (
    <span className={cn(
      'flex-shrink-0 rounded px-1 py-0.5 text-[10px] font-bold',
      styles[role] ?? 'bg-bg-tertiary text-text-tertiary',
    )}>
      {labels[role] ?? role.slice(0, 4).toUpperCase()}
    </span>
  )
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatTime(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
