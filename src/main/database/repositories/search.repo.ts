import type Database from 'better-sqlite3'

/** 消息级搜索结果 */
export interface SearchResult {
  messageId: string
  conversationId: string
  content: string
  snippet: string
  rank: number
}

/** 对话级搜索结果（去重后） */
export interface ConversationSearchResult {
  conversationId: string
  matchCount: number
  bestSnippet: string
  lastMatchAt: number
}

/**
 * 清理 FTS5 查询关键词，防止注入并支持前缀匹配。
 * - 移除 FTS5 特殊字符: " * ( ) : ^
 * - 按空格分词，每个词追加 * 实现前缀匹配（CJK 友好）
 */
function sanitizeFtsQuery(keyword: string): string {
  const sanitized = keyword.replace(/["*():^]/g, ' ')
  const terms = sanitized.split(/\s+/).filter((t) => t.length > 0)
  if (terms.length === 0) return ''
  return terms.map((t) => `${t}*`).join(' ')
}

/**
 * FTS5 全文搜索消息，返回带高亮片段的结果列表。
 * @param db    better-sqlite3 数据库实例
 * @param keyword 搜索关键词（自动转义并追加前缀通配符）
 * @param limit  最大返回数量
 */
export function searchMessages(
  db: Database.Database,
  keyword: string,
  limit?: number,
): SearchResult[] {
  const query = sanitizeFtsQuery(keyword)
  if (!query) return []

  const sql = limit
    ? `SELECT
         message_id AS messageId,
         conversation_id AS conversationId,
         content,
         snippet(messages_fts, 0, '<<', '>>', '...', 10) AS snippet,
         rank
       FROM messages_fts
       WHERE messages_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    : `SELECT
         message_id AS messageId,
         conversation_id AS conversationId,
         content,
         snippet(messages_fts, 0, '<<', '>>', '...', 10) AS snippet,
         rank
       FROM messages_fts
       WHERE messages_fts MATCH ?
       ORDER BY rank`

  const rows = limit
    ? (db.prepare(sql).all(query, limit) as SearchResult[])
    : (db.prepare(sql).all(query) as SearchResult[])

  return rows
}

/**
 * FTS5 全文搜索，返回按对话去重的结果列表。
 * 每个对话包含匹配数、最佳片段和最后匹配时间。
 *
 * 注意：snippet() 不能直接用于 GROUP BY 查询（SQLite 限制），
 * 因此分两步：先聚合对话，再逐个取最佳排名的片段。
 *
 * @param db     better-sqlite3 数据库实例
 * @param keyword 搜索关键词
 * @param limit   最大返回对话数
 */
export function getConversationsByFts(
  db: Database.Database,
  keyword: string,
  limit?: number,
): ConversationSearchResult[] {
  const query = sanitizeFtsQuery(keyword)
  if (!query) return []

  // Step 1: 聚合对话级数据（匹配数 + 最后匹配时间）
  const convSql = limit
    ? `SELECT
         messages_fts.conversation_id AS conversationId,
         COUNT(*) AS matchCount,
         MAX(m.created_at) AS lastMatchAt
       FROM messages_fts
       JOIN messages m ON m.id = messages_fts.message_id
       WHERE messages_fts MATCH ?
       GROUP BY messages_fts.conversation_id
       ORDER BY lastMatchAt DESC
       LIMIT ?`
    : `SELECT
         messages_fts.conversation_id AS conversationId,
         COUNT(*) AS matchCount,
         MAX(m.created_at) AS lastMatchAt
       FROM messages_fts
       JOIN messages m ON m.id = messages_fts.message_id
       WHERE messages_fts MATCH ?
       GROUP BY messages_fts.conversation_id
       ORDER BY lastMatchAt DESC`

  const convs = limit
    ? (db.prepare(convSql).all(query, limit) as Omit<ConversationSearchResult, 'bestSnippet'>[])
    : (db.prepare(convSql).all(query) as Omit<ConversationSearchResult, 'bestSnippet'>[])

  if (convs.length === 0) return []

  // Step 2: 逐个对话取最佳排名匹配的片段
  const snippetStmt = db.prepare(
    `SELECT snippet(messages_fts, 0, '<<', '>>', '...', 10) AS bestSnippet
     FROM messages_fts
     WHERE messages_fts MATCH ? AND conversation_id = ?
     ORDER BY rank
     LIMIT 1`,
  )

  return convs.map((conv) => {
    const row = snippetStmt.get(query, conv.conversationId) as
      | { bestSnippet: string }
      | undefined
    return {
      conversationId: conv.conversationId,
      matchCount: conv.matchCount,
      bestSnippet: row?.bestSnippet ?? '',
      lastMatchAt: conv.lastMatchAt,
    }
  })
}
