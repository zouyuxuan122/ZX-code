import { getDb } from '../index'
import type { Conversation, Message, CreateConversationDto, UpdateConversationDto } from '@shared/types/conversation'

export function findAll(projectId?: string): Conversation[] {
  const db = getDb()
  if (projectId) {
    return db.prepare('SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as Conversation[]
  }
  return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as Conversation[]
}

export function findById(id: string): Conversation | null {
  const db = getDb()
  return (db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation) || null
}

export function create(data: CreateConversationDto): Conversation {
  const db = getDb()
  return db.prepare(
    'INSERT INTO conversations (project_id, title, model, thinking_level) VALUES (?, ?, ?, ?) RETURNING *'
  ).get(
    data.project_id || null,
    data.title || '新对话',
    data.model || null,
    data.thinking_level || 'standard'
  ) as Conversation
}

export function update(id: string, data: UpdateConversationDto): Conversation {
  const db = getDb()
  const current = findById(id)
  if (!current) throw new Error(`Conversation ${id} not found`)

  const merged = {
    title: data.title ?? current.title,
    model: data.model ?? current.model,
    thinking_level: data.thinking_level ?? current.thinking_level,
  }

  return db.prepare(
    'UPDATE conversations SET title = ?, model = ?, thinking_level = ?, updated_at = ? WHERE id = ? RETURNING *'
  ).get(merged.title, merged.model, merged.thinking_level, Date.now(), id) as Conversation
}

export function remove(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

export function touch(id: string): void {
  const db = getDb()
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

export function findMessages(conversationId: string): Message[] {
  const db = getDb()
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as Message[]
}

export function addMessage(data: {
  conversation_id: string
  role: string
  content: string
  metadata?: string | null
  tool_call_id?: string | null
  tool_name?: string | null
}): Message {
  const db = getDb()
  const result = db.prepare(
    'INSERT INTO messages (conversation_id, role, content, metadata, tool_call_id, tool_name) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
  ).get(
    data.conversation_id,
    data.role,
    data.content,
    data.metadata || null,
    data.tool_call_id || null,
    data.tool_name || null
  ) as Message

  // 更新会话的 updated_at
  touch(data.conversation_id)

  return result
}

export function deleteMessages(conversationId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId)
}

export function deleteOldMessages(conversationId: string, keepCount: number): void {
  const db = getDb()
  db.prepare(
    `DELETE FROM messages WHERE conversation_id = ? AND id NOT IN (
      SELECT id FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?
    )`
  ).run(conversationId, conversationId, keepCount)
}

/**
 * 删除指定消息及其之后的所有消息（按 created_at + id 排序保证确定性）
 * 用于"回退到此处"功能：用户选择某条消息，删除它及之后的所有消息
 *
 * 注意：仅用 created_at >= ? 在同一毫秒内创建的多条消息（工具调用很常见）
 * 会导致误删。这里用行号方式：先给对话内所有消息按 (created_at, id) 编号，
 * 再删除编号 >= 目标消息编号的所有消息。
 *
 * 安全保护：若 messageId 在数据库中不存在（例如前端临时 id temp-user-xxx），
 * 直接返回 0，不执行任何删除，避免误删全部消息。
 *
 * @param conversationId 对话 ID
 * @param messageId 要删除的起始消息 ID（包含此消息）
 * @returns 被删除的消息数量
 */
export function deleteMessagesFrom(conversationId: string, messageId: string): number {
  const db = getDb()
  // 安全校验：messageId 必须存在于该对话中，否则不删除任何消息
  const targetMsg = db.prepare(
    'SELECT id, created_at FROM messages WHERE id = ? AND conversation_id = ?'
  ).get(messageId, conversationId) as { id: string; created_at: number } | undefined
  if (!targetMsg) {
    return 0
  }
  // 找到目标消息在对话内的序号（按 created_at, id 排序）
  const target = db.prepare(
    `SELECT COUNT(*) AS cnt FROM messages
     WHERE conversation_id = ?
       AND (created_at, id) < (?, ?)`
  ).get(conversationId, targetMsg.created_at, targetMsg.id) as { cnt: number } | undefined
  if (!target) return 0
  const targetRowNum = target.cnt // 目标消息是第 (targetRowNum + 1) 条，0-based = targetRowNum
  // 删除序号 >= targetRowNum 的所有消息（即目标消息及之后的所有消息）
  const result = db.prepare(
    `DELETE FROM messages
     WHERE conversation_id = ?
       AND id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
           FROM messages WHERE conversation_id = ?
         ) WHERE rn > ?  -- SQLite ROW_NUMBER 从 1 开始，目标消息 rn = targetRowNum + 1
       )`
  ).run(conversationId, conversationId, targetRowNum)
  touch(conversationId)
  return result.changes
}
