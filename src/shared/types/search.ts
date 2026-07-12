/** 文件搜索结果项 */
export interface FileSearchResult {
  /** 相对于工作区的路径 */
  filepath: string
  /** 绝对路径 */
  absolutePath: string
  /** 文件名 */
  filename: string
  /** 内容匹配时所在的行号（1-based） */
  line?: number
  /** 内容匹配时所在的列号（1-based） */
  column?: number
  /** 内容匹配时匹配行的文本预览 */
  preview?: string
  /** 匹配类型：文件名匹配 / 内容匹配 */
  matchType: 'filename' | 'content'
  /** 相关度分数 */
  score: number
}

/** 文件搜索选项 */
export interface SearchOptions {
  /** 工作区根路径 */
  workspacePath: string
  /** 搜索关键词 */
  query: string
  /** 搜索模式：文件名 / 内容 / 全部 */
  mode: 'filename' | 'content' | 'all'
  /** 最大返回结果数，默认 100 */
  maxResults?: number
  /** 文件名 glob 过滤，如 "*.ts" */
  filePattern?: string
  /** 是否使用正则匹配（仅内容搜索生效） */
  useRegex?: boolean
  /** 是否区分大小写 */
  caseSensitive?: boolean
  /** 是否全词匹配（仅内容搜索生效） */
  wholeWord?: boolean
}

/** 消息级搜索结果（FTS5） */
export interface MessageSearchResult {
  messageId: string
  conversationId: string
  content: string
  snippet: string
  rank: number
}

/** 对话级搜索结果（FTS5 去重后） */
export interface ConversationSearchResult {
  conversationId: string
  matchCount: number
  bestSnippet: string
  lastMatchAt: number
}
