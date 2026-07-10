import { PanelRightClose, PanelRight, ListTodo, Package, Wrench, FileText } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { useProjectStore } from '@/stores/projectStore'
import { ipc } from '@/services/ipc'
import { ContextUsagePanel } from '@/components/chat/ContextUsagePanel'
import { TodoListPanel } from '@/components/chat/TodoListPanel'
import { cn } from '@/utils/cn'

/** 工具图标映射（简化版） */
const toolIconMap: Record<string, string> = {
  write_file: '✎',
  edit: '✎',
  read_file: '📄',
  list_files: '📁',
  run_command: '⌘',
  search_files: '🔍',
  grep: '🔎',
  todo_write: '📋',
  question: '❓',
  task: '🤖',
  webfetch: '🌐',
  websearch: '🌐',
  terminal_read: '⌘',
}

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

/** 判断产物是否为可打开的文件类型 */
function isFileArtifact(tool: string): boolean {
  return tool === 'write_file' || tool === 'edit'
}

/** 任务产物面板 */
function ArtifactsPanel() {
  const artifacts = useChatStore((s) => s.artifacts)
  const todos = useChatStore((s) => s.todos)
  const currentProject = useProjectStore((s) => s.currentProject)

  /** 将工作区相对路径解析为绝对路径（renderer 端无 path 模块，用字符串拼接） */
  function resolveAbsolutePath(relativePath: string): string | null {
    if (!currentProject?.workspace_path) return null
    const base = currentProject.workspace_path.replace(/[/\\]+$/, '')
    const rel = relativePath.replace(/^[/\\]+/, '')
    return `${base}/${rel}`
  }

  /** 打开文件：将相对路径解析为绝对路径后调用系统默认程序 */
  const handleOpenFile = async (filepath: string) => {
    const absolutePath = resolveAbsolutePath(filepath)
    if (!absolutePath) return
    const result = await ipc.file.openInEditor(absolutePath)
    if (!result.ok) {
      console.warn('[ArtifactsPanel] 打开文件失败:', result.error)
    }
  }

  /** 在资源管理器中显示 */
  const handleShowInFolder = async (filepath: string) => {
    const absolutePath = resolveAbsolutePath(filepath)
    if (!absolutePath) return
    await ipc.file.showInFolder(absolutePath)
  }

  /** 根据 todoId 查找关联的 todo */
  const getTodoById = (todoId?: string) => {
    if (!todoId) return null
    return todos.find((t) => t.id === todoId) ?? null
  }

  return (
    <div className="border-b border-border-subtle">
      <div className="flex items-center gap-2 px-3 py-2">
        <Package className="h-4 w-4 text-text-secondary" />
        <span className="text-xs font-semibold text-text-secondary">任务产物</span>
        {artifacts.length > 0 && (
          <span className="ml-auto text-xs text-text-tertiary tabular-nums">{artifacts.length}</span>
        )}
      </div>
      <div className="px-3 pb-2">
        {artifacts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="surface-3d rounded-md p-3"
          >
            <Package className="mx-auto mb-2 h-6 w-6 text-text-tertiary opacity-50" />
            <p className="text-center text-xs text-text-tertiary">
              Agent 生成的文件将出现在此
            </p>
          </motion.div>
        ) : (
          <div className="space-y-1">
            <AnimatePresence initial={false}>
              {artifacts.map((artifact, idx) => {
                const isFile = isFileArtifact(artifact.tool)
                const linkedTodo = getTodoById(artifact.todoId)
                return (
                  <motion.div
                    key={`${artifact.filepath}-${artifact.timestamp}`}
                    layout
                    initial={{ opacity: 0, x: -12, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    exit={{ opacity: 0, x: -12, height: 0 }}
                    transition={{
                      duration: 0.3,
                      ease: [0.16, 1, 0.3, 1],
                      delay: idx * 0.03,
                    }}
                    className={cn(
                      'surface-3d rounded-md px-2.5 py-2',
                      isFile && 'cursor-pointer hover:border-border-strong hover:bg-white/5',
                    )}
                    onClick={isFile ? () => void handleOpenFile(artifact.filepath) : undefined}
                    onContextMenu={
                      isFile
                        ? (e) => {
                            e.preventDefault()
                            void handleShowInFolder(artifact.filepath)
                          }
                        : undefined
                    }
                    title={isFile ? '点击打开文件 · 右键在资源管理器中显示' : undefined}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{toolIconMap[artifact.tool] ?? '📄'}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-primary">
                        {artifact.filepath}
                      </span>
                      {isFile && (
                        <FileText className="h-3 w-3 flex-shrink-0 text-text-tertiary opacity-60" />
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-5 text-[10px] text-text-tertiary">
                      {isFile && (
                        <>
                          <span className="text-accent-green tabular-nums">+{artifact.additions}</span>
                          <span className="text-accent-red tabular-nums">-{artifact.deletions}</span>
                        </>
                      )}
                      {artifact.summary && !isFile && (
                        <span className="min-w-0 flex-1 truncate text-text-tertiary">
                          {artifact.summary}
                        </span>
                      )}
                      <span className="ml-auto">{toolNameMap[artifact.tool] ?? artifact.tool}</span>
                    </div>
                    {/* 关联的 TODO 标签 */}
                    {linkedTodo && (
                      <div className="mt-1 flex items-center gap-1 pl-5 text-[10px] text-text-tertiary">
                        <span className="opacity-60">↳</span>
                        <span
                          className={cn(
                            'truncate',
                            linkedTodo.status === 'completed' && 'text-accent-green',
                            linkedTodo.status === 'in_progress' && 'text-accent-blue',
                          )}
                        >
                          {linkedTodo.content}
                        </span>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}

/** 工具使用统计面板 */
function ToolUsagePanel() {
  const toolUsageStats = useChatStore((s) => s.toolUsageStats)
  const toolCalls = useChatStore((s) => s.toolCalls)
  const isStreaming = useChatStore((s) => s.isStreaming)

  const entries = Object.entries(toolUsageStats).sort((a, b) => b[1].count - a[1].count)
  const totalCalls = entries.reduce((sum, [, s]) => sum + s.count, 0)
  const runningCount = Object.values(toolCalls).filter((t) => t.status === 'running' || t.status === 'pending_approval').length

  if (totalCalls === 0 && !isStreaming) return null

  return (
    <div className="border-b border-border-subtle">
      <div className="flex items-center gap-2 px-3 py-2">
        <Wrench className="h-4 w-4 text-text-secondary" />
        <span className="text-xs font-semibold text-text-secondary">工具使用</span>
        <span className="ml-auto text-xs text-text-tertiary tabular-nums">
          {totalCalls} 次{runningCount > 0 && ` · ${runningCount} 进行中`}
        </span>
      </div>
      <div className="px-3 pb-2">
        <div className="space-y-0.5">
          <AnimatePresence initial={false}>
            {entries.map(([toolName, stats], idx) => {
              const avgMs = stats.count > 0 ? Math.round(stats.totalMs / stats.count) : 0
              const isRunning = Object.values(toolCalls).some(
                (t) => t.name === toolName && (t.status === 'running' || t.status === 'pending_approval'),
              )
              return (
                <motion.div
                  key={toolName}
                  layout
                  initial={{ opacity: 0, x: -8, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: -8, height: 0 }}
                  transition={{
                    duration: 0.25,
                    ease: [0.16, 1, 0.3, 1],
                    delay: idx * 0.02,
                  }}
                  className="flex items-center gap-2 px-1.5 py-1 text-xs"
                >
                  <span className="text-xs">{toolIconMap[toolName] ?? '🔧'}</span>
                  <span className="min-w-0 flex-1 truncate text-text-secondary">
                    {toolNameMap[toolName] ?? toolName}
                  </span>
                  {isRunning && (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="h-1.5 w-1.5 rounded-full bg-accent-blue"
                    />
                  )}
                  <span className="tabular-nums text-text-tertiary">{stats.count}</span>
                  {stats.error > 0 && (
                    <span className="tabular-nums text-accent-red">{stats.error}</span>
                  )}
                  {avgMs > 0 && (
                    <span className="tabular-nums text-text-tertiary opacity-60">
                      {avgMs < 1000 ? `${avgMs}ms` : `${(avgMs / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/** 空状态待办事项占位 */
function EmptyTodoPlaceholder() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="surface-3d rounded-md p-3"
    >
      <ListTodo className="mx-auto mb-2 h-6 w-6 text-text-tertiary opacity-50" />
      <p className="text-center text-xs text-text-tertiary">
        Agent 工作时将自动记录任务进度
      </p>
    </motion.div>
  )
}

/**
 * 右侧侧边栏：展示待办事项、任务产物、工具使用、上下文使用情况。
 * 折叠态仅显示展开按钮；展开态四个区块纵向排列。
 */
export function RightSidebar() {
  const collapsed = useUIStore((s) => s.rightSidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleRightSidebar)
  const todos = useChatStore((s) => s.todos)
  const artifacts = useChatStore((s) => s.artifacts)
  const toolUsageStats = useChatStore((s) => s.toolUsageStats)

  // 折叠态统计：待办完成数、产物总数、+/- 合计、工具调用次数
  const todoCompleted = todos.filter((t) => t.status === 'completed').length
  const todoTotal = todos.length
  const artifactCount = artifacts.length
  const additionsTotal = artifacts.reduce((sum, a) => sum + a.additions, 0)
  const deletionsTotal = artifacts.reduce((sum, a) => sum + a.deletions, 0)
  const toolCallTotal = Object.values(toolUsageStats).reduce((sum, s) => sum + s.count, 0)

  return (
    <motion.div
      initial={false}
      animate={{ width: collapsed ? 40 : 288 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex flex-col overflow-hidden rounded-xl border border-border-default/60 bg-bg-secondary shadow-sm"
    >
      {/* 折叠态：常驻展开按钮 + 紧凑统计 */}
      <div
        className={cn(
          'absolute inset-y-0 right-0 flex w-10 flex-col items-center gap-2 py-2 transition-opacity duration-200',
          collapsed ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <button
          title="展开详情"
          onClick={toggle}
          className="lift-button flex h-9 w-9 items-center justify-center rounded-md border border-border-default bg-bg-tertiary text-text-secondary transition-smooth-fast hover:border-border-strong hover:bg-white/10 hover:text-text-primary"
        >
          <PanelRight className="h-4 w-4" />
        </button>
        {/* 待办完成数 */}
        {todoTotal > 0 && (
          <div className="flex flex-col items-center gap-0.5" title={`待办: ${todoCompleted}/${todoTotal}`}>
            <ListTodo className="h-3 w-3 text-text-tertiary" />
            <span className="text-[10px] tabular-nums text-text-tertiary">
              {todoCompleted}/{todoTotal}
            </span>
          </div>
        )}
        {/* 产物 +/- 统计 */}
        {artifactCount > 0 && (
          <div
            className="flex flex-col items-center gap-0.5"
            title={`任务产物 ${artifactCount} 项 · +${additionsTotal} -${deletionsTotal}`}
          >
            <Package className="h-3 w-3 text-text-tertiary" />
            <span className="text-[10px] tabular-nums text-accent-green">+{additionsTotal}</span>
            <span className="text-[10px] tabular-nums text-accent-red">-{deletionsTotal}</span>
          </div>
        )}
        {/* 工具调用次数 */}
        {toolCallTotal > 0 && (
          <div className="flex flex-col items-center gap-0.5" title={`工具调用 ${toolCallTotal} 次`}>
            <Wrench className="h-3 w-3 text-text-tertiary" />
            <span className="text-[10px] tabular-nums text-text-tertiary">{toolCallTotal}</span>
          </div>
        )}
      </div>

      {/* 展开态：完整内容 */}
      <div
        className={cn(
          'flex h-full w-72 flex-col transition-opacity duration-200',
          collapsed ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100',
        )}
      >
        {/* 顶部标题栏 */}
        <div className="flex h-9 flex-shrink-0 items-center justify-between px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            详情
          </span>
          <button
            onClick={toggle}
            className="lift-button flex h-6 w-6 items-center justify-center rounded text-text-secondary transition-smooth-fast hover:bg-white/10 hover:text-text-primary"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>

        {/* 四个区块 - 整体滚动 */}
        <div className="flex-1 overflow-y-auto border-t border-border-subtle">
          {/* 待办事项 */}
          <div className="border-b border-border-subtle">
            <div className="flex items-center gap-2 px-3 py-2">
              <ListTodo className="h-4 w-4 text-text-secondary" />
              <span className="text-xs font-semibold text-text-secondary">待办事项</span>
              {todos.length > 0 && (
                <span className="ml-auto text-xs text-text-tertiary tabular-nums">
                  {todos.filter((t) => t.status === 'completed').length}/{todos.length}
                </span>
              )}
            </div>
            <div className="px-3 pb-2">
              {todos.length > 0 ? <TodoListPanel todos={todos} /> : <EmptyTodoPlaceholder />}
            </div>
          </div>

          {/* 任务产物 */}
          <ArtifactsPanel />

          {/* 工具使用统计 */}
          <ToolUsagePanel />

          {/* 上下文使用情况 */}
          <ContextUsagePanel />
        </div>
      </div>
    </motion.div>
  )
}
