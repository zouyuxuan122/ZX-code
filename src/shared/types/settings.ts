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
  | 'tts'
  | 'memory'
  | 'sync'
  | 'evolution'
  | 'profile'

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
  // TTS 语音合成设置
  'tts.enabled': boolean
  'tts.provider': 'edge' | 'openai' | 'custom'
  'tts.mode': 'auto' | 'manual'
  'tts.voice': string
  'tts.rate': number
  'tts.volume': number
  'tts.apiKey': string
  'tts.baseUrl': string
  'tts.cloneVoiceId': string
  'tts.format': 'mp3' | 'wav'
  // 记忆系统设置
  'memory.enabled': boolean
  'memory.autoExtract': boolean
  'memory.autoRecall': boolean
  'memory.recallLimit': number
  // SuperContext 设置
  'superContext.enabled': boolean
  'superContext.timeoutMs': number
  // TokenJuice 压缩设置
  'tokenJuice.enabled': boolean
  'tokenJuice.maxToolOutputChars': number
  // 自动同步设置
  'sync.enabled': boolean
  'sync.intervalMinutes': number
  // 技能进化设置
  'evolution.enabled': boolean
  // 用户画像设置
  'profile.enabled': boolean
}
