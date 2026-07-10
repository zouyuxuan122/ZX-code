import type { ReactNode } from 'react'

/** Slash 命令定义 */
export interface SlashCommand {
  /** 命令名（不含 /） */
  name: string
  /** 命令描述 */
  description: string
  /** 参数提示 */
  argsHint?: string
  /** 用法示例 */
  usage: string
  /** 图标（lucide 图标名） */
  icon: string
}

/** 所有可用的 Slash 命令 */
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'help',
    description: '显示所有可用命令',
    usage: '/help',
    icon: 'HelpCircle',
  },
  {
    name: 'clear',
    description: '清空当前对话的所有消息',
    usage: '/clear',
    icon: 'Eraser',
  },
  {
    name: 'compact',
    description: '压缩对话历史，保留最近消息并生成摘要',
    usage: '/compact',
    icon: 'Archive',
  },
  {
    name: 'new',
    description: '创建一个新对话',
    usage: '/new [标题]',
    icon: 'Plus',
  },
  {
    name: 'export',
    description: '导出当前对话为 Markdown 文件',
    usage: '/export',
    icon: 'Download',
  },
  {
    name: 'mode',
    description: '切换 Agent 工作模式',
    argsHint: 'chat | plan | build',
    usage: '/mode plan',
    icon: 'ToggleLeft',
  },
  {
    name: 'todo',
    description: '显示当前任务清单',
    usage: '/todo',
    icon: 'ListTodo',
  },
  {
    name: 'stop',
    description: '停止正在生成的回复',
    usage: '/stop',
    icon: 'Square',
  },
  {
    name: 'sessions',
    description: '列出并切换历史会话',
    usage: '/sessions',
    icon: 'History',
  },
  {
    name: 'models',
    description: '列出所有可用模型',
    usage: '/models',
    icon: 'Cpu',
  },
  {
    name: 'init',
    description: '分析项目并生成 AGENTS.md 规则文件',
    usage: '/init',
    icon: 'FileCode',
  },
  {
    name: 'undo',
    description: '撤销最后一条消息（含文件更改）',
    usage: '/undo',
    icon: 'Undo2',
  },
  {
    name: 'redo',
    description: '重做撤销的消息',
    usage: '/redo',
    icon: 'Redo2',
  },
  {
    name: 'share',
    description: '分享当前会话',
    usage: '/share',
    icon: 'Share2',
  },
  {
    name: 'details',
    description: '切换工具执行详情显示',
    usage: '/details',
    icon: 'Eye',
  },
  {
    name: 'thinking',
    description: '切换思考过程可见性',
    usage: '/thinking',
    icon: 'Brain',
  },
]

/** 解析输入文本为命令名和参数 */
export function parseSlashCommand(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const parts = trimmed.slice(1).split(/\s+/)
  const command = parts[0].toLowerCase()
  const args = parts.slice(1)
  return { command, args }
}

/** 根据当前输入过滤命令列表（用于提示面板） */
export function filterCommands(input: string): SlashCommand[] {
  const parsed = parseSlashCommand(input)
  if (!parsed) return []
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(parsed.command))
}
