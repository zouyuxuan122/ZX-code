import { useMemo, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot,
  Sparkles,
  Brain,
  Wrench,
  FileEdit,
  FolderSearch,
  Search,
  MessageSquare,
  Loader2,
  CheckCircle2,
  XCircle,
  Square,
  ChevronDown,
  ChevronRight,
  FileCode,
  Image,
  Code2,
  Check,
  Undo2,
  Eye,
} from 'lucide-react'
import { useChatStore, type ToolCallState } from '@/stores/chatStore'
import type { Message, MessageMetadata } from '@shared/types/conversation'
import { cn } from '@/utils/cn'

// ─── 工具名映射 ────────────────────────────────────────────
const toolNameMap: Record<string, string> = {
  write_file: '写入文件',
  edit: '编辑文件',
  read_file: '读取文件',
  list_files: '列出文件',
  run_command: '执行命令',
  search_files: '搜索文件',
  grep: '搜索内容',
  todo_write: '更新任务',
  question: '提问',
  task: '子智能体',
  webfetch: '获取网页',
  websearch: '网络搜索',
  terminal_read: '终端审阅',
}

// ─── 操作类型分类 ──────────────────────────────────────────
type ActionType = 'thinking' | 'tool' | 'code_edit' | 'file_op' | 'search' | 'reply'

function classifyTool(name: string): ActionType {
  if (['write_file', 'edit'].includes(name)) return 'code_edit'
  if (['read_file', 'list_files', 'terminal_read'].includes(name)) return 'file_op'
  if (['search_files', 'grep', 'websearch', 'webfetch'].includes(name)) return 'search'
  return 'tool'
}

const actionConfig: Record<ActionType, { icon: typeof Bot; color: string }> = {
  thinking: { icon: Brain, color: 'text-chart-5' },
  tool: { icon: Wrench, color: 'text-chart-3' },
  code_edit: { icon: FileEdit, color: 'text-brand-500' },
  file_op: { icon: FolderSearch, color: 'text-state-success' },
  search: { icon: Search, color: 'text-brand-500' },
  reply: { icon: MessageSquare, color: 'text-text-secondary' },
}

// ─── 工作流条目 ────────────────────────────────────────────
export interface WorkEntry {
  id: string
  type: ActionType
  toolName?: string
  title: string
  detail?: string
  body?: string
  timestamp: number
  status?: ToolCallState['status']
  expandable?: string
  result?: {
    content: string
    metadata?: MessageMetadata['result_metadata'] & { preview_image?: string; preview_html?: string }
    isError?: boolean
  }
  fileOp?: FileOpInfo
}

/**
 * 计算条目列表的滚动签名。
 * 当任何条目的 id / status / detail 变化时签名变化，
 * 用于驱动 AIViewPanel 的自动滚动 useEffect。
 *
 * 修复 bug：原先依赖 allEntries.length（数字），当条目原地更新
 * （如工具 running→completed、参数增量追加 detail）时 length 不变，
 * effect 不触发导致视图不滚动。列表满 MAX_ENTRIES 后 length 恒定，
 * 滚动完全失效。
 */
export function computeScrollSignature(entries: WorkEntry[]): string {
  return entries.map((e) => `${e.id}:${e.status ?? ''}:${e.detail ?? ''}`).join('|')
}

// ─── AI 状态推断 ───────────────────────────────────────────
type AIStatus = 'idle' | 'thinking' | 'executing' | 'replying'

function inferAIStatus(
  isStreaming: boolean,
  streamingThinking: string,
  streamingContent: string,
  toolCalls: Record<string, ToolCallState>,
): AIStatus {
  if (!isStreaming) return 'idle'
  const hasRunningTool = Object.values(toolCalls).some(
    (t) => t.status === 'running' || t.status === 'pending_approval',
  )
  if (hasRunningTool) return 'executing'
  if (streamingThinking && !streamingContent) return 'thinking'
  if (streamingContent) return 'replying'
  return 'thinking'
}

const statusDot: Record<AIStatus, string> = {
  idle: 'bg-state-success/60',
  thinking: 'bg-brand-500',
  executing: 'bg-chart-3',
  replying: 'bg-chart-5',
}

const statusLabel: Record<AIStatus, string> = {
  idle: '空闲',
  thinking: '思考中',
  executing: '执行中',
  replying: '回复中',
}

// ─── 从 args JSON 提取摘要 ─────────────────────────────────
function extractArgsSummary(name: string, args: string): { title: string; detail?: string } {
  try {
    const parsed = JSON.parse(args)
    const label = toolNameMap[name] ?? name
    if (name === 'write_file' || name === 'edit' || name === 'read_file')
      return { title: label, detail: parsed.path || '' }
    if (name === 'run_command')
      return { title: label, detail: parsed.command ? `$ ${parsed.command}` : '' }
    if (name === 'list_files')
      return { title: label, detail: parsed.path || '.' }
    if (name === 'grep' || name === 'search_files')
      return { title: label, detail: parsed.pattern || '' }
    if (name === 'webfetch')
      return { title: label, detail: parsed.url || '' }
    if (name === 'websearch')
      return { title: label, detail: parsed.query || '' }
    if (name === 'task')
      return { title: label, detail: parsed.description || '' }
    if (name === 'todo_write')
      return { title: '更新任务清单' }
    return { title: label }
  } catch {
    return { title: toolNameMap[name] ?? name }
  }
}

// ─── 从部分 JSON 中提取字段值（支持不完整 JSON） ──────────
/**
 * 从可能不完整的 JSON 字符串中提取指定字符串字段的值。
 * 处理转义序列，支持值尚未闭合的情况（流式 JSON）。
 */
function extractPartialJsonField(jsonStr: string, fieldName: string): string | null {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"`)
  const match = pattern.exec(jsonStr)
  if (!match) return null

  let pos = match.index + match[0].length
  let result = ''
  while (pos < jsonStr.length) {
    const char = jsonStr[pos]
    if (char === '\\') {
      const next = jsonStr[pos + 1]
      if (next === 'n') result += '\n'
      else if (next === 't') result += '\t'
      else if (next === 'r') result += '\r'
      else if (next === '"') result += '"'
      else if (next === '\\') result += '\\'
      else if (next === '/') result += '/'
      else if (next === 'u' && pos + 5 < jsonStr.length) {
        result += String.fromCharCode(parseInt(jsonStr.slice(pos + 2, pos + 6), 16))
        pos += 4
      } else result += next ?? ''
      pos += 2
    } else if (char === '"') {
      break
    } else {
      result += char
      pos++
    }
  }
  return result
}

// ─── 行级 Diff 类型与算法 ──────────────────────────────────
interface DiffLine {
  type: 'context' | 'added' | 'removed'
  text: string
  oldLine?: number
  newLine?: number
}

const MAX_DIFF_LINES = 500

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const m = Math.min(oldLines.length, MAX_DIFF_LINES)
  const n = Math.min(newLines.length, MAX_DIFF_LINES)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }
  const result: DiffLine[] = []
  let i = 0
  let j = 0
  let oldLine = 1
  let newLine = 1
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'context', text: oldLines[i], oldLine, newLine })
      i++; j++; oldLine++; newLine++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', text: oldLines[i], oldLine })
      i++; oldLine++
    } else {
      result.push({ type: 'added', text: newLines[j], newLine })
      j++; newLine++
    }
  }
  while (i < m) { result.push({ type: 'removed', text: oldLines[i], oldLine }); i++; oldLine++ }
  while (j < n) { result.push({ type: 'added', text: newLines[j], newLine }); j++; newLine++ }
  return result
}

function parseUnifiedDiff(patch: string): DiffLine[] {
  const lines = patch.split('\n')
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) { oldLine = parseInt(hunkMatch[1], 10); newLine = parseInt(hunkMatch[2], 10); continue }
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') ||
        line.startsWith('index ') || line.startsWith('Index:') || line.startsWith('===') ||
        line.startsWith('\\') || line.trim() === '') { continue }
    if (line.startsWith('+')) { result.push({ type: 'added', text: line.slice(1), newLine }); newLine++ }
    else if (line.startsWith('-')) { result.push({ type: 'removed', text: line.slice(1), oldLine }); oldLine++ }
    else {
      const text = line.startsWith(' ') ? line.slice(1) : line
      result.push({ type: 'context', text, oldLine, newLine }); oldLine++; newLine++
    }
  }
  return result
}

// ─── 文件操作信息 ──────────────────────────────────────────
interface FileOpInfo {
  filepath: string
  operation: string
  additions: number
  deletions: number
  diffLines: DiffLine[]
  hasDiff: boolean
}

function extractFileOpInfo(
  toolName: string,
  argsStr: string,
  result?: {
    content: string
    metadata?: MessageMetadata['result_metadata'] & { preview_image?: string; preview_html?: string }
    isError?: boolean
  },
): FileOpInfo | null {
  let args: Record<string, unknown> = {}
  try { args = JSON.parse(argsStr) } catch { /* ignore */ }
  const filepath = (args.path as string) || (args.file_path as string) || result?.metadata?.diff?.filepath || ''
  if (!filepath) return null
  if (toolName === 'read_file' || toolName === 'list_files') {
    return { filepath, operation: toolName === 'read_file' ? '读取' : '列出', additions: 0, deletions: 0, diffLines: [], hasDiff: false }
  }
  let diffLines: DiffLine[] = []
  let operation = '编辑'
  if (toolName === 'write_file') {
    operation = '创建'
    const newContent = (args.content as string) || ''
    if (result?.metadata?.diff?.patch) { diffLines = parseUnifiedDiff(result.metadata.diff.patch) }
    else if (newContent) {
      const lines = newContent.split('\n')
      diffLines = lines.map((text, idx) => ({ type: 'added' as const, text, newLine: idx + 1 }))
    }
  } else if (toolName === 'edit') {
    operation = '编辑'
    if (result?.metadata?.diff?.patch) { diffLines = parseUnifiedDiff(result.metadata.diff.patch) }
    else {
      const oldString = (args.oldString as string) ?? (args.old_string as string) ?? ''
      const newString = (args.newString as string) ?? (args.new_string as string) ?? ''
      if (oldString || newString) { diffLines = computeLineDiff(oldString, newString) }
    }
  } else { return null }
  let additions = diffLines.filter((d) => d.type === 'added').length
  let deletions = diffLines.filter((d) => d.type === 'removed').length
  if (result?.metadata?.diff) {
    if (typeof result.metadata.diff.additions === 'number') additions = result.metadata.diff.additions
    if (typeof result.metadata.diff.deletions === 'number') deletions = result.metadata.diff.deletions
  }
  return { filepath, operation, additions, deletions, diffLines, hasDiff: diffLines.length > 0 }
}

// ─── MiniDiff 组件 ─────────────────────────────────────────
function MiniDiff({
  diffLines,
  filepath,
  additions,
  deletions,
  operation,
  patch,
}: {
  diffLines?: DiffLine[]
  filepath?: string
  additions?: number
  deletions?: number
  operation?: string
  patch?: string
}) {
  const [collapsed, setCollapsed] = useState(false)
  const lines = useMemo<DiffLine[]>(() => {
    if (diffLines && diffLines.length > 0) return diffLines
    if (patch) return parseUnifiedDiff(patch)
    return []
  }, [diffLines, patch])

  return (
    <div data-testid="mini-diff" className="space-y-0.5">
      {filepath && (
        <div className="flex items-center gap-1.5 rounded-lg border border-border-default/20 bg-bg-tertiary/40 px-2 py-1 text-[10px]">
          <FileCode className="h-3 w-3 flex-shrink-0 text-brand-500" />
          <span className="min-w-0 flex-1 truncate font-mono text-text-secondary">
            {filepath}
          </span>
          {operation && <span className="flex-shrink-0 text-text-tertiary">{operation}</span>}
          {typeof additions === 'number' && additions > 0 && (
            <span className="flex-shrink-0 font-mono text-state-success">+{additions}</span>
          )}
          {typeof deletions === 'number' && deletions > 0 && (
            <span className="flex-shrink-0 font-mono text-state-error">-{deletions}</span>
          )}
          <button
            data-testid="mini-diff-toggle"
            onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c) }}
            className="flex-shrink-0 text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      )}
      {!collapsed && (
        <div
          className={cn(
            'max-h-48 overflow-y-auto border border-border-default/20 border-t-0 bg-bg-primary/40 font-mono text-[10px] leading-relaxed',
            !filepath && 'rounded-lg',
          )}
        >
          {lines.length === 0 ? (
            <span className="inline-block px-2 py-1 text-text-tertiary">无差异内容</span>
          ) : (
            lines.map((line, idx) => <DiffLineRow key={idx} line={line} />)
          )}
        </div>
      )}
    </div>
  )
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const isAdded = line.type === 'added'
  const isRemoved = line.type === 'removed'
  const bgClass = isAdded ? 'bg-state-success/10' : isRemoved ? 'bg-state-error/10' : ''
  const borderClass = isAdded ? 'border-l-2 border-state-success' : isRemoved ? 'border-l-2 border-state-error' : 'border-l-2 border-transparent'
  const textClass = isAdded ? 'text-state-success' : isRemoved ? 'text-state-error' : 'text-text-secondary'
  const lineNum = isAdded ? line.newLine : isRemoved ? line.oldLine : line.newLine
  const sign = isAdded ? '+' : isRemoved ? '-' : ' '

  return (
    <div className={cn('flex items-start', bgClass, borderClass)}>
      <span className="inline-block w-7 flex-shrink-0 select-none pr-1 text-right text-text-tertiary/40">{lineNum ?? ''}</span>
      <span className={cn('inline-block w-3 flex-shrink-0 select-none text-center', textClass)}>{sign}</span>
      <span className={cn('min-w-0 flex-1 whitespace-pre-wrap break-all pr-1', textClass)}>{line.text || ' '}</span>
    </div>
  )
}

// ─── ResultPreview 组件 ────────────────────────────────────
function ResultPreview({
  content,
  metadata,
  isError,
}: {
  content?: string
  metadata?: MessageMetadata['result_metadata'] & { preview_image?: string; preview_html?: string }
  isError?: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const imageSrc = metadata?.preview_image || (content?.startsWith('data:image') ? content : undefined)
  if (imageSrc) {
    return (
      <div className="flex items-start gap-1.5">
        <Image className="mt-0.5 h-3 w-3 flex-shrink-0 text-text-tertiary" />
        <img data-testid="result-preview-image" src={imageSrc} alt="工具结果预览" className="max-h-32 max-w-full rounded-lg border border-border-default/20 object-contain" />
      </div>
    )
  }
  if (metadata?.preview_html || (content && /^\s*<[a-zA-Z][\s\S]*>\s*$/.test(content))) {
    const html = metadata?.preview_html ?? content ?? ''
    return (
      <div data-testid="result-preview-html" className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-tertiary">HTML 预览</span>
          <button onClick={() => setExpanded((v) => !v)} className="text-[10px] text-text-tertiary hover:text-text-secondary">{expanded ? '折叠' : '展开'}</button>
        </div>
        {expanded && <div className="max-h-32 overflow-y-auto rounded-lg border border-border-default/20 bg-bg-primary/40 p-1.5 text-[10px]" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    )
  }
  if (metadata?.diff) {
    return <MiniDiff patch={metadata.diff.patch} filepath={metadata.diff.filepath} additions={metadata.diff.additions} deletions={metadata.diff.deletions} />
  }
  return (
    <div data-testid="result-preview-code" className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-tertiary">{isError ? '错误输出' : '输出'}</span>
        <button onClick={() => setExpanded((v) => !v)} className="text-[10px] text-text-tertiary hover:text-text-secondary">{expanded ? '折叠' : '展开'}</button>
      </div>
      {expanded && (
        <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-border-default/20 bg-bg-primary/40 p-1.5 font-mono text-[10px] leading-relaxed text-text-secondary">
          {content || '-'}
        </pre>
      )}
    </div>
  )
}

// ─── 从历史消息构建工作流 ──────────────────────────────────
function buildWorkEntries(messages: Message[]): WorkEntry[] {
  const resultsByToolCallId: Record<string, NonNullable<WorkEntry['result']>> = {}
  for (const msg of messages) {
    if (msg.role !== 'tool' || !msg.tool_call_id) continue
    let meta: MessageMetadata | null = null
    try { meta = msg.metadata ? (JSON.parse(msg.metadata) as MessageMetadata) : null } catch { /* ignore */ }
    resultsByToolCallId[msg.tool_call_id] = {
      content: msg.content,
      metadata: meta?.result_metadata as NonNullable<WorkEntry['result']>['metadata'],
      isError: meta?.is_error,
    }
  }
  const entries: WorkEntry[] = []
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    let meta: MessageMetadata | null = null
    try { meta = msg.metadata ? (JSON.parse(msg.metadata) as MessageMetadata) : null } catch { /* ignore */ }
    if (meta?.thinking) {
      entries.push({
        id: `think-${msg.id}`, type: 'thinking', title: '思考分析',
        body: meta.thinking.length > 200 ? meta.thinking.slice(0, 200) + '...' : meta.thinking,
        timestamp: msg.created_at, status: 'completed',
      })
    }
    if (meta?.tool_calls) {
      for (const tc of meta.tool_calls) {
        const { title, detail } = extractArgsSummary(tc.function.name, tc.function.arguments)
        const result = resultsByToolCallId[tc.id]
        entries.push({
          id: `tc-${tc.id}`, type: classifyTool(tc.function.name), toolName: tc.function.name,
          title, detail, timestamp: msg.created_at, status: 'completed',
          expandable: tc.function.arguments, result,
          fileOp: extractFileOpInfo(tc.function.name, tc.function.arguments, result) ?? undefined,
        })
      }
    }
    if (msg.content) {
      const preview = msg.content.length > 300 ? msg.content.slice(0, 300) + '...' : msg.content
      entries.push({ id: `reply-${msg.id}`, type: 'reply', title: '回复', body: preview, timestamp: msg.created_at })
    }
  }
  return entries
}

// ─── 文件操作卡片 ────────────────────────────────────────
function FileOperationCard({ entry }: { entry: WorkEntry }) {
  const fileOp = entry.fileOp!
  const isRunning = entry.status === 'running' || entry.status === 'pending_approval'
  if (entry.type === 'code_edit') {
    return <MiniDiff diffLines={fileOp.diffLines} filepath={fileOp.filepath} additions={fileOp.additions} deletions={fileOp.deletions} operation={fileOp.operation} />
  }
  return (
    <div data-testid="mini-diff" className="space-y-0.5">
      <div className="flex items-center gap-1.5 rounded-lg border border-border-default/20 bg-bg-tertiary/40 px-2 py-1 text-[10px]">
        <FileCode className="h-3 w-3 flex-shrink-0 text-brand-500" />
        <span className="min-w-0 flex-1 truncate font-mono text-text-secondary">{fileOp.filepath}</span>
        <span className="flex-shrink-0 text-text-tertiary">{fileOp.operation}</span>
      </div>
      {isRunning ? (
        <div className="rounded-b-lg border border-border-default/20 border-t-0 bg-bg-primary/40 px-2 py-0.5 text-[10px] text-text-tertiary">执行中...</div>
      ) : entry.result?.content ? (
        <FileOpResultPreview content={entry.result.content} isError={entry.result.isError} />
      ) : null}
    </div>
  )
}

function FileOpResultPreview({ content, isError }: { content: string; isError?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const preview = content.length > 200 ? content.slice(0, 200) + '...' : content
  return (
    <div>
      <button onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }} className="w-full rounded-b-lg border border-border-default/20 border-t-0 bg-bg-primary/40 px-2 py-0.5 text-left text-[10px] text-text-tertiary hover:text-text-secondary">
        {expanded ? '▼ 收起结果' : '▶ 查看结果'} {isError ? '(错误)' : ''}
      </button>
      {expanded && (
        <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded-b-lg border border-border-default/20 border-t-0 bg-bg-primary/40 p-1.5 font-mono text-[10px] leading-relaxed text-text-secondary">
          {preview}
        </pre>
      )}
    </div>
  )
}

// ─── 可展开的工作流条目 ────────────────────────────────────
function WorkItem({ entry }: { entry: WorkEntry }) {
  const [expanded, setExpanded] = useState(false)
  const config = actionConfig[entry.type]
  const Icon = config.icon
  const isRunning = entry.status === 'running'
  const isPending = entry.status === 'pending_approval'
  const isError = entry.status === 'error'
  const hasExpand = !!entry.result || entry.expandable || entry.body

  return (
    <motion.div
      layout
      data-testid={`work-item-${entry.id}`}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn('group px-2 py-0.5', hasExpand && 'cursor-pointer hover:bg-white/[0.02]')}
      onClick={hasExpand ? () => setExpanded((v) => !v) : undefined}
    >
      <div className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 -mx-1.5">
        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
          {isRunning || isPending ? (
            <span data-testid="running-pulse" className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
            </span>
          ) : isError ? (
            <XCircle className="h-3 w-3 text-state-error" />
          ) : entry.status === 'completed' ? (
            <CheckCircle2 data-testid="completed-check" className="h-3 w-3 text-state-success/60" />
          ) : (
            <Icon className={cn('h-3 w-3', config.color)} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-0">
          <span className={cn('text-[11px] font-medium leading-tight', isError ? 'text-state-error' : 'text-text-primary')}>
            {entry.title}
          </span>
          {entry.detail && (
            <span className="ml-1 min-w-0 flex-1 truncate text-[10px] font-mono text-text-tertiary align-middle">
              {entry.detail}
            </span>
          )}
        </div>
        {entry.fileOp && entry.fileOp.additions > 0 && (
          <span className="flex-shrink-0 text-[10px] font-mono text-state-success">+{entry.fileOp.additions}</span>
        )}
        {entry.fileOp && entry.fileOp.deletions > 0 && (
          <span className="flex-shrink-0 text-[10px] font-mono text-state-error">-{entry.fileOp.deletions}</span>
        )}
        {hasExpand && (
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-50"
          >
            <ChevronRight className="h-3 w-3 text-text-tertiary" />
          </motion.span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {expanded && hasExpand && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-5 mt-0.5 rounded-lg border border-border-default/20 bg-bg-primary/30 p-1.5" onClick={(e) => e.stopPropagation()}>
              {entry.result?.metadata?.preview_image ? (
                <ResultPreview content={entry.result.content} metadata={entry.result.metadata} isError={entry.result.isError} />
              ) : entry.fileOp ? (
                <FileOperationCard entry={entry} />
              ) : entry.result ? (
                <ResultPreview content={entry.result.content} metadata={entry.result.metadata} isError={entry.result.isError} />
              ) : entry.body ? (
                <p className="text-[10px] leading-relaxed text-text-secondary whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{entry.body}</p>
              ) : entry.expandable ? (
                <pre className="text-[10px] leading-relaxed text-text-secondary whitespace-pre-wrap break-all max-h-32 overflow-y-auto font-mono">
                  {(() => { try { return JSON.stringify(JSON.parse(entry.expandable), null, 2) } catch { return entry.expandable } })()}
                </pre>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!expanded && entry.body && (
        <div className="ml-5 mt-0.5">
          <p className="text-[10px] leading-relaxed text-text-tertiary line-clamp-2">{entry.body}</p>
        </div>
      )}
    </motion.div>
  )
}

// ─── 实时流式条目（VS Code 风格逐行渲染） ─────────────────
function LiveStreamEntry() {
  const streamingContent = useChatStore((s) => s.streamingContent)
  const streamingThinking = useChatStore((s) => s.streamingThinking)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 实时跟随：内容每多一段就多显示一段，自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [streamingContent, streamingThinking])

  if (!isStreaming) return null
  const isThinking = !streamingContent && !!streamingThinking
  const text = streamingContent || streamingThinking
  if (!text) return null

  // 不再截断：显示全部流式内容，逐行渲染（类 VS Code）
  const lines = text.split('\n')

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="px-2 py-0.5"
      data-testid="live-stream-entry"
    >
      {/* 标题栏 */}
      <div className="flex items-center gap-1.5 rounded-t-lg border border-border-default/20 border-b-0 bg-bg-secondary/40 px-2 py-1">
        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
          {isThinking ? (
            <Brain className="h-3 w-3 animate-pulse text-accent-purple" />
          ) : (
            <Code2 className="h-3 w-3 animate-pulse text-accent-green" />
          )}
        </div>
        <span className="text-[11px] font-medium text-text-primary">
          {isThinking ? '思考中' : 'AI 输出中'}
        </span>
        <span className="inline-flex items-center gap-0.5 ml-0.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
              className="h-0.5 w-0.5 rounded-full bg-text-tertiary"
            />
          ))}
        </span>
        <span className="ml-auto text-[10px] font-mono text-text-tertiary">
          {lines.length} 行
        </span>
      </div>
      {/* 逐行代码区（VS Code 风格：行号 + 内容） */}
      <div
        ref={scrollRef}
        className="max-h-44 overflow-y-auto rounded-b-lg border border-border-default/20 bg-bg-primary/40 font-mono text-[11px] leading-relaxed"
      >
        {lines.map((line, idx) => (
          <div
            key={idx}
            data-testid="live-code-line"
            className={cn(
              'flex items-start',
              isThinking
                ? 'bg-accent-purple/5 border-l-2 border-accent-purple/40'
                : 'bg-accent-green/5 border-l-2 border-accent-green/60',
            )}
          >
            <span className="inline-block w-8 flex-shrink-0 select-none pr-1 text-right text-text-tertiary/40">
              {idx + 1}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 whitespace-pre-wrap break-all pr-2',
                isThinking ? 'text-text-secondary' : 'text-accent-green',
              )}
            >
              {line || ' '}
            </span>
          </div>
        ))}
        {/* 末尾闪烁光标 */}
        <div
          className={cn(
            'flex items-start',
            isThinking
              ? 'bg-accent-purple/5 border-l-2 border-accent-purple/40'
              : 'bg-accent-green/5 border-l-2 border-accent-green/60',
          )}
        >
          <span className="inline-block w-8 flex-shrink-0 select-none pr-1 text-right text-text-tertiary/40">
            {lines.length + 1}
          </span>
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.7, repeat: Infinity }}
            className={cn('inline-block h-3 w-[2px]', isThinking ? 'bg-accent-purple' : 'bg-accent-green')}
          />
        </div>
      </div>
    </motion.div>
  )
}

// ─── 空闲状态 ──────────────────────────────────────────────
function IdleState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-1 flex-col items-center justify-center gap-2"
    >
      <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
        <Sparkles className="h-8 w-8 text-text-tertiary opacity-20" />
      </motion.div>
      <span className="text-[11px] font-medium text-text-secondary">AI 待命中</span>
      <span className="text-[10px] text-text-tertiary text-center px-4">
        开始对话后将在此显示实时操作
      </span>
    </motion.div>
  )
}

// ─── 变更通知横幅（类截图中的"变更已完成"提示） ────────────
function ChangeNotification() {
  const [visible, setVisible] = useState(false)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const messages = useChatStore((s) => s.messages)

  // 检测最近一次工具执行完成 → 显示通知
  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg?.role === 'tool') {
        setVisible(true)
        const timer = setTimeout(() => setVisible(false), 5000)
        return () => clearTimeout(timer)
      }
    }
    setVisible(false)
  }, [isStreaming, messages.length])

  if (!visible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-2 px-3 py-1.5 bg-state-success/10 border border-state-success/20 rounded-lg"
      >
        <Check size={12} className="text-state-success flex-shrink-0" />
        <span className="text-[10px] font-medium text-state-success">变更已完成</span>
        <div className="flex-1" />
        <button onClick={() => setVisible(false)} className="flex items-center gap-1 text-[10px] text-state-success/70 hover:text-state-success transition-colors">
          <Undo2 size={10} /> 撤销
        </button>
        <span className="text-[10px] text-text-tertiary">Ctrl+Backspace</span>
        <button onClick={() => setVisible(false)} className="flex h-5 w-5 items-center justify-center rounded bg-state-success/15 hover:bg-state-success/25 transition-colors">
          <Check size={10} className="text-state-success" />
        </button>
        <span className="text-[10px] text-text-tertiary">Ctrl+Enter</span>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── 顶部 Tab 栏（类截图中的"实时跟随"/"编辑器"标签） ──────
function TabBar({ activeTab, onTabChange }: { activeTab: 'live' | 'editor'; onTabChange: (tab: 'live' | 'editor') => void }) {
  return (
    <div className="flex items-center gap-0 border-b border-border-default/20 bg-bg-secondary/30">
      <button
        type="button"
        onClick={() => onTabChange('live')}
        className={cn(
          'flex items-center gap-1.5 h-7 px-3 text-[11px] font-medium transition-colors duration-150 relative',
          activeTab === 'live' ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary',
        )}
      >
        <Eye size={11} className={activeTab === 'live' ? 'text-brand-500' : ''} />
        实时跟随
        {activeTab === 'live' && (
          <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-px bg-brand-500" />
        )}
      </button>
      <button
        type="button"
        onClick={() => onTabChange('editor')}
        className={cn(
          'flex items-center gap-1.5 h-7 px-3 text-[11px] font-medium transition-colors duration-150 relative',
          activeTab === 'editor' ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary',
        )}
      >
        <Code2 size={11} className={activeTab === 'editor' ? 'text-brand-500' : ''} />
        编辑器
        {activeTab === 'editor' && (
          <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-px bg-brand-500" />
        )}
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-1 pr-1">
        <span className="text-[10px] text-text-tertiary">1/1</span>
      </div>
    </div>
  )
}

// ─── 实时文件编辑器（VS Code 风格实时渲染） ──────────────
function LiveFileEditor() {
  const toolCalls = useChatStore((s) => s.toolCalls)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 找到当前正在运行或最近完成的文件操作工具
  const fileTool = useMemo(() => {
    const entries = Object.values(toolCalls)
    // 优先找正在运行的 write_file/edit
    const running = entries.find(
      (tc) =>
        (tc.name === 'write_file' || tc.name === 'edit') &&
        (tc.status === 'running' || tc.status === 'pending_approval'),
    )
    if (running) return running
    // 找最近完成的文件操作
    const completed = entries
      .filter((tc) => (tc.name === 'write_file' || tc.name === 'edit') && tc.status === 'completed')
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    return completed[0]
  }, [toolCalls])

  // 从 streamingArgs 或 args 中提取文件路径和内容
  const { filepath, liveContent, oldContent, isStreaming } = useMemo(() => {
    if (!fileTool) return { filepath: '', liveContent: '', oldContent: '', isStreaming: false }
    const argsStr = fileTool.streamingArgs ?? fileTool.args
    const isRunning = fileTool.status === 'running' || fileTool.status === 'pending_approval'
    const path =
      extractPartialJsonField(argsStr, 'path') ||
      extractPartialJsonField(argsStr, 'file_path') ||
      ''

    if (fileTool.name === 'write_file') {
      const content = extractPartialJsonField(argsStr, 'content') ?? ''
      return { filepath: path, liveContent: content, oldContent: '', isStreaming: isRunning }
    }
    if (fileTool.name === 'edit') {
      const newStr =
        extractPartialJsonField(argsStr, 'newString') ||
        extractPartialJsonField(argsStr, 'new_string') ||
        ''
      const oldStr =
        extractPartialJsonField(argsStr, 'oldString') ||
        extractPartialJsonField(argsStr, 'old_string') ||
        ''
      return { filepath: path, liveContent: newStr, oldContent: oldStr, isStreaming: isRunning }
    }
    return { filepath: '', liveContent: '', oldContent: '', isStreaming: false }
  }, [fileTool])

  // 完成后的最终 diff
  const finalDiff = useMemo(() => {
    if (!fileTool || fileTool.status !== 'completed' || !fileTool.result?.metadata?.diff) return null
    return fileTool.result.metadata.diff
  }, [fileTool])

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [liveContent])

  if (!fileTool) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <FileCode className="h-8 w-8 text-text-tertiary opacity-20" />
        <span className="ml-2 text-[11px] text-text-tertiary">暂无文件操作</span>
      </div>
    )
  }

  // 完成后显示最终 diff
  if (finalDiff && !isStreaming) {
    const diffLines = parseUnifiedDiff(finalDiff.patch)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 文件标签栏 */}
        <div className="flex h-7 flex-shrink-0 items-center gap-1.5 border-b border-border-default/20 bg-bg-secondary/40 px-2.5">
          <FileCode className="h-3 w-3 flex-shrink-0 text-brand-500" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-mono text-text-secondary">
            {finalDiff.filepath || filepath}
          </span>
          <span className="flex-shrink-0 text-[10px] font-mono text-state-success">+{finalDiff.additions}</span>
          <span className="flex-shrink-0 text-[10px] font-mono text-state-error">-{finalDiff.deletions}</span>
          {/* 审查按钮 — 可选，AI 自动继续 */}
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-text-tertiary transition-colors hover:bg-bg-tertiary/40 hover:text-text-secondary"
            title="审查变更（可选，AI 已自动继续）"
          >
            <Eye size={10} />
            审查
          </button>
        </div>
        {/* Diff 内容 */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-bg-primary/40 font-mono text-[11px] leading-relaxed">
          {diffLines.map((line, idx) => (
            <DiffLineRow key={idx} line={line} />
          ))}
        </div>
      </div>
    )
  }

  // 流式渲染中：实时显示文件内容
  const contentLines = liveContent.split('\n')
  const isWriteFile = fileTool.name === 'write_file'
  // 对 edit 工具，用 LCS 计算 diff
  const editDiffLines = !isWriteFile && oldContent
    ? computeLineDiff(oldContent, liveContent)
    : []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 文件标签栏 */}
      <div className="flex h-7 flex-shrink-0 items-center gap-1.5 border-b border-border-default/20 bg-bg-secondary/40 px-2.5">
        <FileCode className="h-3 w-3 flex-shrink-0 text-brand-500" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-mono text-text-secondary">
          {filepath || '未指定文件'}
        </span>
        {isWriteFile ? (
          <span className="flex-shrink-0 text-[10px] text-state-success">创建中</span>
        ) : (
          <>
            <span className="flex-shrink-0 text-[10px] font-mono text-state-success">
              +{editDiffLines.filter((d) => d.type === 'added').length}
            </span>
            <span className="flex-shrink-0 text-[10px] font-mono text-state-error">
              -{editDiffLines.filter((d) => d.type === 'removed').length}
            </span>
          </>
        )}
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="flex-shrink-0 text-[10px] text-brand-500"
        >
          ●
        </motion.span>
      </div>

      {/* 实时内容区 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-bg-primary/40 font-mono text-[11px] leading-relaxed">
        {isWriteFile ? (
          // write_file：所有行都是新增（绿色）
          contentLines.map((line, idx) => (
            <div key={idx} className="flex items-start bg-state-success/5 border-l-2 border-state-success">
              <span className="inline-block w-7 flex-shrink-0 select-none pr-1 text-right text-text-tertiary/40">
                {idx + 1}
              </span>
              <span className="inline-block w-3 flex-shrink-0 select-none text-center text-state-success">+</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-1 text-state-success">
                {line || ' '}
              </span>
            </div>
          ))
        ) : (
          // edit：显示 diff（绿色新增、红色删除）
          editDiffLines.map((line, idx) => (
            <DiffLineRow key={idx} line={line} />
          ))
        )}
        {/* 光标动画 */}
        {isStreaming && (
          <div className="flex items-start bg-state-success/5 border-l-2 border-state-success">
            <span className="inline-block w-7 flex-shrink-0 select-none pr-1 text-right text-text-tertiary/40">
              {contentLines.length}
            </span>
            <span className="inline-block w-3 flex-shrink-0 select-none text-center text-state-success">+</span>
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.7, repeat: Infinity }}
              className="inline-block h-3 w-[2px] bg-state-success"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────────
const MAX_ENTRIES = 30

export function AIViewPanel() {
  const isStreaming = useChatStore((s) => s.isStreaming)
  const streamingThinking = useChatStore((s) => s.streamingThinking)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const toolCalls = useChatStore((s) => s.toolCalls)
  const messages = useChatStore((s) => s.messages)

  const scrollRef = useRef<HTMLDivElement>(null)
  const prevSigRef = useRef('')
  const [activeTab, setActiveTab] = useState<'live' | 'editor'>('live')

  const aiStatus = inferAIStatus(isStreaming, streamingThinking, streamingContent, toolCalls)

  const runningTools = useMemo(
    () => Object.values(toolCalls).filter((t) => t.status === 'running' || t.status === 'pending_approval'),
    [toolCalls],
  )

  // 实时跟随模式：不再自动切换到编辑器标签。
  // 用户期望"只要不退出，就会一直跟随 AI 的动向"，
  // 因此文件操作也应在实时跟随视图中以内联方式呈现，而非切走。
  const historicalEntries = useMemo(() => buildWorkEntries(messages), [messages])

  const allEntries = useMemo(() => {
    const historicalIds = new Set(historicalEntries.map((e) => e.id))
    const liveAsEntries: WorkEntry[] = runningTools
      .filter((tc) => !historicalIds.has(`tc-${tc.toolCallId}`))
      .map((tc) => {
        const { title, detail } = extractArgsSummary(tc.name, tc.args)
        return {
          id: `live-${tc.toolCallId}`, type: classifyTool(tc.name), toolName: tc.name,
          title, detail, timestamp: tc.startedAt ?? Date.now(), status: tc.status,
          expandable: tc.args,
          fileOp: extractFileOpInfo(tc.name, tc.args, undefined) ?? undefined,
        }
      })
    const combined = [...historicalEntries, ...liveAsEntries]
    combined.sort((a, b) => a.timestamp - b.timestamp)
    return combined.slice(-MAX_ENTRIES)
  }, [historicalEntries, runningTools])

  const hasActivity = isStreaming || allEntries.length > 0

  const { completed, total } = useMemo(() => {
    const toolEntries = allEntries.filter((e) => e.type !== 'thinking' && e.type !== 'reply')
    const completedCount = toolEntries.filter((e) => e.status === 'completed').length
    return { completed: completedCount, total: toolEntries.length }
  }, [allEntries])

  // 滚动签名：条目 id/status/detail 任一变化时改变，驱动自动滚动
  const scrollSig = useMemo(() => computeScrollSignature(allEntries), [allEntries])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // 签名变化意味着条目有更新（新增 / 状态变更 / detail 追加）
    if (scrollSig !== prevSigRef.current) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (nearBottom) {
        el.scrollTop = el.scrollHeight
      }
    }
    prevSigRef.current = scrollSig
  }, [scrollSig, streamingContent, streamingThinking])

  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setShowScrollBtn(!nearBottom)
  }
  const scrollToBottom = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }

  const handleStop = () => {
    void useChatStore.getState().stopStreaming()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Tab 栏：实时跟随 / 编辑器 */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* 变更通知横幅 */}
      <div className="px-2 pt-1.5">
        <ChangeNotification />
      </div>

      {/* 内容区：编辑器视图 or 实时跟随视图 */}
      {activeTab === 'editor' ? (
        <LiveFileEditor />
      ) : !hasActivity ? (
        <IdleState />
      ) : (
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto overflow-x-hidden py-0.5">
            <AnimatePresence initial={false}>
              {allEntries.map((entry) => (
                <WorkItem key={entry.id} entry={entry} />
              ))}
            </AnimatePresence>
            <AnimatePresence>
              <LiveStreamEntry />
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {showScrollBtn && (
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                onClick={scrollToBottom}
                className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full border border-border-default/30 bg-bg-tertiary/80 shadow-sm hover:bg-bg-secondary transition-colors"
              >
                <ChevronDown className="h-3 w-3 text-text-tertiary" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 底部状态栏 */}
      <div
        data-testid="ai-stage-summary"
        className="flex h-6 flex-shrink-0 items-center justify-between border-t border-border-default/20 px-2.5 bg-bg-secondary/20"
      >
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={isStreaming ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 1.5, repeat: isStreaming ? Infinity : 0 }}
            className={cn('h-1.5 w-1.5 rounded-full', statusDot[aiStatus])}
          />
          <span className="text-[10px] text-text-tertiary">{statusLabel[aiStatus]}</span>
          {total > 0 && (
            <span className="ml-1 text-[10px] font-mono text-text-tertiary">
              {completed}/{total}
            </span>
          )}
        </div>
        {isStreaming && (
          <button
            onClick={handleStop}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-state-error/70 hover:bg-state-error/8 transition-colors"
          >
            <Square className="h-2 w-2 fill-current" />
            <span>停止</span>
          </button>
        )}
      </div>
    </div>
  )
}
