import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../migrate'

let db: DBType

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
})

/**
 * 插入一条 message 的辅助函数。
 * messages 表有外键约束 -> conversations，需先创建父记录。
 */
function insertMessage(
  messageId: string,
  conversationId: string,
  role: string,
  content: string
): void {
  // 先确保 conversation 存在（messages FK -> conversations）
  const convExists = db
    .prepare('SELECT 1 FROM conversations WHERE id = ?')
    .get(conversationId)
  if (!convExists) {
    // conversations FK -> projects（可为 NULL），直接插入
    db.prepare(
      "INSERT INTO conversations (id, title) VALUES (?, ?)"
    ).run(conversationId, '测试对话')
  }
  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)'
  ).run(messageId, conversationId, role, content)
}

describe('Migration 008_hermes_evolution', () => {
  it('创建 agent_traces 表', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_traces'")
      .get() as { name: string } | undefined
    expect(row).toBeDefined()
    expect(row?.name).toBe('agent_traces')
  })

  it('创建 skill_versions 表', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='skill_versions'")
      .get() as { name: string } | undefined
    expect(row).toBeDefined()
    expect(row?.name).toBe('skill_versions')
  })

  it('创建 evolution_runs 表', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evolution_runs'")
      .get() as { name: string } | undefined
    expect(row).toBeDefined()
    expect(row?.name).toBe('evolution_runs')
  })

  it('创建 user_profile 表', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profile'")
      .get() as { name: string } | undefined
    expect(row).toBeDefined()
    expect(row?.name).toBe('user_profile')
  })

  it('创建 agent_cron_jobs 表', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_cron_jobs'")
      .get() as { name: string } | undefined
    expect(row).toBeDefined()
    expect(row?.name).toBe('agent_cron_jobs')
  })

  it('一次性验证 5 张表全部存在', () => {
    const expectedTables = [
      'agent_traces',
      'skill_versions',
      'evolution_runs',
      'user_profile',
      'agent_cron_jobs',
    ]
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?, ?, ?, ?, ?)"
      )
      .all(...expectedTables) as Array<{ name: string }>
    const found = new Set(rows.map((r) => r.name))
    for (const t of expectedTables) {
      expect(found.has(t)).toBe(true)
    }
  })

  it('agent_traces 表包含必要索引', () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='agent_traces'"
      )
      .all() as Array<{ name: string }>
    const indexNames = new Set(indexes.map((i) => i.name))
    expect(indexNames.has('idx_agent_traces_conversation')).toBe(true)
    expect(indexNames.has('idx_agent_traces_created')).toBe(true)
  })

  it('skill_versions 表包含唯一索引 (skill_id, version)', () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='skill_versions'"
      )
      .all() as Array<{ name: string }>
    const indexNames = new Set(indexes.map((i) => i.name))
    expect(indexNames.has('idx_skill_versions_skill')).toBe(true)
    expect(indexNames.has('idx_skill_versions_skill_version')).toBe(true)
  })
})

describe('Migration 009_fts5_messages', () => {
  it('创建 messages_fts 虚拟表', () => {
    const row = db
      .prepare(
        "SELECT name, type FROM sqlite_master WHERE type='table' AND name='messages_fts'"
      )
      .get() as { name: string; type: string } | undefined
    expect(row).toBeDefined()
    expect(row?.name).toBe('messages_fts')
  })

  it('创建 messages_fts_ai 插入触发器', () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='messages_fts_ai'"
      )
      .get() as { name: string } | undefined
    expect(row).toBeDefined()
    expect(row?.name).toBe('messages_fts_ai')
  })

  it('创建 messages_fts_ad 删除触发器', () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='messages_fts_ad'"
      )
      .get() as { name: string } | undefined
    expect(row).toBeDefined()
    expect(row?.name).toBe('messages_fts_ad')
  })

  it('创建 messages_fts_au 更新触发器', () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='messages_fts_au'"
      )
      .get() as { name: string } | undefined
    expect(row).toBeDefined()
    expect(row?.name).toBe('messages_fts_au')
  })

  it('一次性验证 3 个触发器全部存在', () => {
    const expected = ['messages_fts_ai', 'messages_fts_ad', 'messages_fts_au']
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN (?, ?, ?)"
      )
      .all(...expected) as Array<{ name: string }>
    const found = new Set(rows.map((r) => r.name))
    for (const t of expected) {
      expect(found.has(t)).toBe(true)
    }
  })

  it('FTS5 表可查询: 插入 message 后能通过 MATCH 检索到', () => {
    insertMessage('msg-fts-test-1', 'conv-fts-test', 'user', 'Hello world from FTS5 test')

    // 通过 FTS5 全文检索
    const result = db
      .prepare("SELECT content, conversation_id, message_id FROM messages_fts WHERE messages_fts MATCH ?")
      .get('Hello') as { content: string; conversation_id: string; message_id: string } | undefined

    expect(result).toBeDefined()
    expect(result?.message_id).toBe('msg-fts-test-1')
    expect(result?.conversation_id).toBe('conv-fts-test')
    expect(result?.content).toContain('Hello world from FTS5 test')
  })

  it('FTS5 支持前缀匹配检索 (CJK)', () => {
    insertMessage('msg-fts-test-2', 'conv-fts-test', 'assistant', '今天天气很好，适合写代码')

    // unicode61 tokenizer 将 CJK 连续字符作为单个 token（按标点切分）
    // 使用前缀 '*' 运算符匹配以 '适合' 开头的 token
    const result = db
      .prepare("SELECT message_id FROM messages_fts WHERE messages_fts MATCH ?")
      .get('适合*') as { message_id: string } | undefined

    expect(result).toBeDefined()
    expect(result?.message_id).toBe('msg-fts-test-2')
  })

  it('删除 message 后 FTS5 同步删除', () => {
    insertMessage('msg-fts-del-1', 'conv-del', 'user', 'To be deleted content unique')

    // 确认存在
    const before = db
      .prepare("SELECT message_id FROM messages_fts WHERE messages_fts MATCH ?")
      .get('deleted') as { message_id: string } | undefined
    expect(before).toBeDefined()

    // 删除
    db.prepare("DELETE FROM messages WHERE id = ?").run('msg-fts-del-1')

    // 确认 FTS5 中也删除了
    const after = db
      .prepare("SELECT message_id FROM messages_fts WHERE messages_fts MATCH ?")
      .get('deleted') as { message_id: string } | undefined
    expect(after).toBeUndefined()
  })

  it('更新 message 后 FTS5 同步更新', () => {
    insertMessage('msg-fts-upd-1', 'conv-upd', 'user', 'original content here')

    // 更新内容
    db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(
      'updated brand new content',
      'msg-fts-upd-1'
    )

    // 旧内容应不再匹配
    const oldResult = db
      .prepare("SELECT message_id FROM messages_fts WHERE messages_fts MATCH ?")
      .get('original') as { message_id: string } | undefined
    expect(oldResult).toBeUndefined()

    // 新内容应能匹配
    const newResult = db
      .prepare("SELECT message_id FROM messages_fts WHERE messages_fts MATCH ?")
      .get('brand') as { message_id: string } | undefined
    expect(newResult).toBeDefined()
    expect(newResult?.message_id).toBe('msg-fts-upd-1')
  })
})

describe('Migration 完整性', () => {
  it('008 和 009 迁移已记录到 _migrations 表', () => {
    const rows = db
      .prepare("SELECT name FROM _migrations WHERE name IN (?, ?)")
      .all('008_hermes_evolution', '009_fts5_messages') as Array<{ name: string }>
    const names = new Set(rows.map((r) => r.name))
    expect(names.has('008_hermes_evolution')).toBe(true)
    expect(names.has('009_fts5_messages')).toBe(true)
  })

  it('重复运行 migrations 不会报错（幂等性）', () => {
    expect(() => runMigrations(db)).not.toThrow()
  })
})
