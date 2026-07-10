/**
 * SCL (Skill Code Library) 技能扩展类型定义
 *
 * SCL 扩展与 MCP 服务器的区别：
 *  - MCP 服务器提供外部工具（通过 JSON-RPC 调用）
 *  - SCL 扩展提供技能提示词 / 指令模板（注入到系统提示词中，增强 Agent 的领域能力）
 *
 * SCL 扩展的来源：
 *  - builtin: 内置精选技能
 *  - remote: 从远程目录拉取
 *  - local: 用户自定义
 */

/** SCL 扩展配置 */
export interface SclExtension {
  id: string
  /** 技能名称（显示用） */
  name: string
  /** 技能描述 */
  description: string
  /** 分类 */
  category: SclCategory
  /** 作者 */
  author: string
  /** 版本号 */
  version: string
  /** 技能内容（注入到系统提示词的指令文本） */
  content: string
  /** 搜索标签 */
  tags: string[]
  /** 是否启用 */
  enabled: boolean
  /** 来源：内置 / 远程 / 本地 */
  source: 'builtin' | 'remote' | 'local'
  /** 远程来源 URL（source=remote 时有值） */
  sourceUrl?: string
  /** emoji 图标 */
  icon: string
  /** 创建时间 */
  created_at: number
  /** 更新时间 */
  updated_at: number
}

/** SCL 分类 */
export type SclCategory =
  | 'coding'
  | 'debugging'
  | 'testing'
  | 'architecture'
  | 'devops'
  | 'documentation'
  | 'review'
  | 'custom'

/** 远程目录条目（远程拉取的技能定义） */
export interface RemoteCatalogEntry {
  name: string
  description: string
  category: SclCategory
  content: string
  tags: string[]
  icon: string
  author: string
  version: string
}

/** 远程目录响应格式 */
export interface RemoteCatalogResponse {
  /** 目录名称 */
  name: string
  /** 目录描述 */
  description?: string
  /** 技能列表 */
  skills: RemoteCatalogEntry[]
}

/** SCL API 接口 */
export interface SclApi {
  /** 列出所有已安装技能 */
  list: () => Promise<SclExtension[]>
  /** 安装一个技能 */
  install: (config: Omit<SclExtension, 'id' | 'created_at' | 'updated_at'>) => Promise<SclExtension>
  /** 卸载一个技能 */
  uninstall: (id: string) => Promise<void>
  /** 更新技能配置 */
  update: (id: string, config: Partial<SclExtension>) => Promise<SclExtension>
  /** 启用 / 禁用技能 */
  toggle: (id: string, enabled: boolean) => Promise<SclExtension>
  /** 获取所有已启用技能的内容（用于注入系统提示词） */
  getEnabledSkills: () => Promise<string>
  /** 从远程 URL 拉取技能目录 */
  fetchRemoteCatalog: (url: string) => Promise<RemoteCatalogResponse>
  /** 批量安装远程目录中的技能 */
  installFromRemote: (url: string, entries: RemoteCatalogEntry[]) => Promise<SclExtension[]>
}
