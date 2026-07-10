/** Chat2API Provider 类型（网页大模型供应商） */
export type Chat2ApiProviderType =
  | 'deepseek'
  | 'glm'
  | 'kimi'
  | 'mimo'
  | 'minimax'
  | 'perplexity'
  | 'qwen'
  | 'qwen-ai'
  | 'zai'

/** Chat2API 账户状态 */
export interface Chat2ApiAccount {
  id: string
  providerId: string
  name: string
  status: 'active' | 'inactive' | 'expired' | 'error'
  requestCount?: number
  dailyLimit?: number
  todayUsed?: number
  lastUsed?: number
  createdAt: number
  updatedAt: number
}

/** Chat2API Provider（内置供应商配置） */
export interface Chat2ApiProvider {
  id: string
  name: string
  type: 'builtin' | 'custom'
  enabled: boolean
  supportedModels?: string[]
  status?: {
    online: boolean
    latency?: number
    lastCheck?: number
  }
}

/** OAuth 登录选项 */
export interface OAuthLoginOptions {
  providerId: string
  providerType: Chat2ApiProviderType
  timeout?: number
  proxyMode?: 'system' | 'none'
}

/** OAuth 登录结果 */
export interface OAuthLoginResult {
  success: boolean
  providerId: string
  providerType: Chat2ApiProviderType
  account?: Chat2ApiAccount
  error?: string
}

/** Token 登录参数 */
export interface TokenLoginParams {
  providerId: string
  providerType: Chat2ApiProviderType
  token: string
  realUserID?: string
  mimoUserId?: string
  mimoPhToken?: string
}

/** 代理服务器状态 */
export interface ProxyStatus {
  running: boolean
  port: number
  host: string
  uptime?: number
  totalRequests?: number
  successRequests?: number
  failedRequests?: number
}

/** 拉取网页模型结果 */
export interface FetchWebModelsResult {
  ok: boolean
  models: Array<{
    id: string
    name: string
    providerId: string
    providerName: string
  }>
  error?: string
}
