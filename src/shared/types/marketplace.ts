/**
 * 社区市场（Marketplace）统一类型定义
 *
 * 将多个真实社区注册表（官方 MCP registry、Smithery、Cline marketplace、技能目录等）
 * 的响应归一化为统一的 MarketListing，供 UI 展示与安装。
 */

/** 市场类型 */
export type MarketType = 'mcp' | 'skill' | 'plugin'

/** 注册表适配器：决定如何解析某个 registry 的响应 */
export type MarketAdapter =
  | 'mcp-official' // https://registry.modelcontextprotocol.io
  | 'smithery' // https://smithery.ai
  | 'cline' // https://github.com/cline/mcp-marketplace
  | 'scl-catalog' // 项目自有技能目录格式（RemoteCatalogResponse）
  | 'generic-json' // 通用 JSON 兜底

/** 注册表来源配置 */
export interface MarketRegistry {
  id: string
  /** 显示名称 */
  name: string
  type: MarketType
  /** 远程地址 */
  url: string
  /** 适配器类型 */
  adapter: MarketAdapter
  enabled: boolean
  /** 是否官方维护 */
  official?: boolean
  /** 描述 */
  description?: string
}

/** MCP 安装信息（与 McpServerConfig 对齐，但不含 id） */
export interface MarketMcpInstall {
  type: 'local' | 'remote'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

/** 技能安装信息 */
export interface MarketSkillInstall {
  content: string
  category: string
  tags?: string[]
  icon?: string
}

/** 插件安装信息 */
export interface MarketPluginInstall {
  manifest: Record<string, unknown>
}

/** 统一安装信息（按类型只填一项） */
export interface MarketInstallInfo {
  mcp?: MarketMcpInstall
  skill?: MarketSkillInstall
  plugin?: MarketPluginInstall
}

/** 统一市场条目 */
export interface MarketListing {
  /** 唯一 ID：`registryId:serverName` */
  id: string
  type: MarketType
  /** 显示名称 */
  name: string
  description: string
  author: string
  version: string
  tags: string[]
  /** emoji 图标 */
  icon: string
  /** 来源 registry id */
  registryId: string
  /** 远程仓库 / 主页 */
  repository?: string
  /** 官方认证 */
  verified?: boolean
  /** 安装信息 */
  install: MarketInstallInfo
  /** 原始条目数据（调试 / 扩展用） */
  raw: unknown
}

/** 搜索过滤条件 */
export interface MarketSearchFilters {
  query?: string
  type?: MarketType | 'all'
  /** 限定 registry id */
  registryId?: string
  /** 分类标签 */
  category?: string
}

/** 单个 registry 拉取结果（含错误隔离） */
export interface MarketFetchResult {
  registry: MarketRegistry
  listings: MarketListing[]
  error?: string
}

/** 安装结果 */
export interface MarketInstallResult {
  ok: boolean
  message: string
}
