import type Database from 'better-sqlite3'

interface MigrationRecord {
  id: number
  name: string
  applied_at: number
}

interface Migration {
  name: string
  sql: string
  postMigrate?: (db: Database.Database) => void
}

const migrations: Migration[] = [
  {
    name: '001_init',
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        last_active_at INTEGER,
        settings TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        project_id TEXT,
        title TEXT NOT NULL DEFAULT '新对话',
        model TEXT,
        thinking_level TEXT DEFAULT 'standard',
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
    `,
  },
  {
    name: '003_workspace',
    sql: ``,
    postMigrate: (db) => {
      // projects 表添加工作区外观字段（头像/背景）
      const tableInfo = db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>
      const columns = new Set(tableInfo.map((c) => c.name))
      if (!columns.has('ai_avatar')) {
        db.exec("ALTER TABLE projects ADD COLUMN ai_avatar TEXT DEFAULT ''")
      }
      if (!columns.has('user_avatar')) {
        db.exec("ALTER TABLE projects ADD COLUMN user_avatar TEXT DEFAULT ''")
      }
      if (!columns.has('background')) {
        db.exec("ALTER TABLE projects ADD COLUMN background TEXT DEFAULT ''")
      }
      if (!columns.has('background_type')) {
        db.exec("ALTER TABLE projects ADD COLUMN background_type TEXT DEFAULT 'none'")
      }
    },
  },
  {
    name: '002_agent',
    sql: `
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );

      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        name TEXT NOT NULL,
        context_length INTEGER DEFAULT 4096,
        supports_tools INTEGER DEFAULT 0,
        supports_vision INTEGER DEFAULT 0,
        description TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
    `,
    postMigrate: (db) => {
      // 安全地添加列（如果不存在）
      const tableInfo = db.prepare('PRAGMA table_info(conversations)').all() as Array<{ name: string }>
      const convColumns = new Set(tableInfo.map(c => c.name))
      if (!convColumns.has('provider_id')) {
        db.exec('ALTER TABLE conversations ADD COLUMN provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL')
      }

      const msgTableInfo = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>
      const msgColumns = new Set(msgTableInfo.map(c => c.name))
      if (!msgColumns.has('tool_call_id')) {
        db.exec('ALTER TABLE messages ADD COLUMN tool_call_id TEXT')
      }
      if (!msgColumns.has('tool_name')) {
        db.exec('ALTER TABLE messages ADD COLUMN tool_name TEXT')
      }
    },
  },
  {
    name: '004_memory_goals_sync',
    sql: `
      CREATE TABLE IF NOT EXISTS memory_nodes (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        parent_id TEXT,
        partition TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        FOREIGN KEY (parent_id) REFERENCES memory_nodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_memory_nodes_partition ON memory_nodes(partition);
      CREATE INDEX IF NOT EXISTS idx_memory_nodes_parent ON memory_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_memory_nodes_updated ON memory_nodes(updated_at);

      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        conversation_id TEXT,
        project_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_goals_project ON goals(project_id);
      CREATE INDEX IF NOT EXISTS idx_goals_conversation ON goals(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        goal_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        conversation_id TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON tasks(conversation_id);

      CREATE TABLE IF NOT EXISTS sync_sources (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        token TEXT DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_synced_at INTEGER,
        last_sync_result TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );

      CREATE INDEX IF NOT EXISTS idx_sync_sources_enabled ON sync_sources(enabled);
      CREATE INDEX IF NOT EXISTS idx_sync_sources_type ON sync_sources(type);
    `,
  },
]

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `)

  const applied = db.prepare('SELECT name FROM _migrations').all() as MigrationRecord[]
  const appliedNames = new Set(applied.map((m) => m.name))

  for (const migration of migrations) {
    if (!appliedNames.has(migration.name)) {
      const transaction = db.transaction(() => {
        db.exec(migration.sql)
        if (migration.postMigrate) {
          migration.postMigrate(db)
        }
        db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
          migration.name,
          Date.now()
        )
      })
      transaction()
    }
  }

  insertDefaultSettings(db)
}

function insertDefaultSettings(db: Database.Database): void {
  const defaults: Record<string, { value: unknown; category: string }> = {
    'general.language': { value: 'zh-CN', category: 'general' },
    'general.theme': { value: 'dark', category: 'general' },
    'general.fontSize': { value: 13, category: 'general' },
    'general.startup': { value: 'last-project', category: 'general' },
    'model.default': { value: 'gpt-4', category: 'model' },
    'model.thinkingLevel': { value: 'standard', category: 'model' },
    'permission.autoAccept': { value: false, category: 'permission' },
    'permission.fileSystem': { value: 'ask', category: 'permission' },
    'permission.execute': { value: 'ask', category: 'permission' },
    'permission.network': { value: 'ask', category: 'permission' },
    'log.level': { value: 'info', category: 'log' },
    'log.fileEnabled': { value: true, category: 'log' },
    'ui.sidebarCollapsed': { value: false, category: 'ui' },
    'ui.rightSidebarCollapsed': { value: false, category: 'ui' },
    'ui.terminalType': { value: 'powershell', category: 'ui' },
    // TTS 语音合成默认设置
    'tts.enabled': { value: false, category: 'tts' },
    'tts.provider': { value: 'edge', category: 'tts' },
    'tts.mode': { value: 'manual', category: 'tts' },
    'tts.voice': { value: 'zh-CN-XiaoxiaoNeural', category: 'tts' },
    'tts.rate': { value: 1, category: 'tts' },
    'tts.volume': { value: 1, category: 'tts' },
    'tts.apiKey': { value: '', category: 'tts' },
    'tts.baseUrl': { value: '', category: 'tts' },
    'tts.cloneVoiceId': { value: '', category: 'tts' },
    'tts.format': { value: 'mp3', category: 'tts' },
    'memory.enabled': { value: true, category: 'memory' },
    'memory.autoExtract': { value: true, category: 'memory' },
    'memory.autoRecall': { value: true, category: 'memory' },
    'memory.recallLimit': { value: 5, category: 'memory' },
    'superContext.enabled': { value: true, category: 'memory' },
    'superContext.timeoutMs': { value: 800, category: 'memory' },
    'tokenJuice.enabled': { value: true, category: 'model' },
    'tokenJuice.maxToolOutputChars': { value: 8000, category: 'model' },
    'sync.enabled': { value: false, category: 'sync' },
    'sync.intervalMinutes': { value: 20, category: 'sync' },
  }

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value, category, updated_at) VALUES (?, ?, ?, ?)'
  )

  const transaction = db.transaction(() => {
    for (const [key, { value, category }] of Object.entries(defaults)) {
      stmt.run(key, JSON.stringify(value), category, Date.now())
    }
  })
  transaction()
}
