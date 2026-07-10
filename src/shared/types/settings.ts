export type SettingCategory =
  | 'general'
  | 'model'
  | 'api'
  | 'permission'
  | 'theme'
  | 'log'
  | 'ui'
  | 'workspace'
  | 'mcp'
  | 'scl'
  | 'pet'
  | 'usage'
  | 'weather'

export interface Setting {
  key: string
  value: string
  category: SettingCategory
  updated_at: number
}

export type ThinkingLevel = 'fast' | 'standard' | 'deep'

export interface DefaultSettings {
  'general.language': string
  'general.theme': 'dark' | 'light'
  'general.fontSize': number
  'general.startup': 'last-project' | 'none'
  'theme.visualStyle': 'apple' | 'claude' | 'base'
  'theme.fontFamily': string
  'model.default': string
  'model.thinkingLevel': ThinkingLevel
  'permission.autoAccept': boolean
  'permission.fileSystem': 'ask' | 'allow' | 'deny'
  'permission.execute': 'ask' | 'allow' | 'deny'
  'permission.network': 'ask' | 'allow' | 'deny'
  'log.level': 'debug' | 'info' | 'warn' | 'error'
  'log.fileEnabled': boolean
  'ui.sidebarCollapsed': boolean
  'ui.rightSidebarCollapsed': boolean
  'ui.terminalType': 'powershell' | 'cmd' | 'wsl' | 'gitbash'
  // 上下文与压缩设置
  'api.maxContextLength': number
  'api.compressThreshold': number
  'api.autoCompress': boolean
  'api.compressKeepRecent': number
  // 工作区外观共享设置
  'workspace.shareAppearance': boolean
  'workspace.sharedAiAvatar': string
  'workspace.sharedUserAvatar': string
  'workspace.sharedBackground': string
  'workspace.sharedBackgroundType': 'none' | 'color' | 'image'
}
