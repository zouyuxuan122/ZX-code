# ZX-Code 阶段 1 实现计划：基础框架 + 核心 UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建可运行的 ZX-Code 桌面应用骨架，实现 Codex 风格深色主题界面、基础布局、路由系统、SQLite 数据库和项目管理功能。

**Architecture:** 纯 Electron 单体架构，主进程负责窗口管理/数据库/IPC，渲染进程使用 React + Tailwind 实现 Codex 风格 UI，通过 preload 脚本的 contextBridge 安全通信。

**Tech Stack:** Electron 33+ / React 19 / TypeScript 5.6 / Tailwind CSS 4 / Zustand 5 / better-sqlite3 11 / electron-vite / Framer Motion 11 / Radix UI / Lucide React

**设计文档:** [2026-07-07-zx-code-design.md](file:///d:/ZX%20code/docs/specs/2026-07-07-zx-code-design.md)

---

## 文件结构总览

```
zx-code/
├── package.json                    # 项目配置与依赖
├── electron.vite.config.ts         # electron-vite 构建配置
├── tsconfig.json                   # TypeScript 基础配置
├── tsconfig.node.json              # 主进程 TS 配置
├── tsconfig.web.json               # 渲染进程 TS 配置
├── tailwind.config.ts              # Tailwind 配置
├── postcss.config.js               # PostCSS 配置
├── electron-builder.yml            # 打包配置
├── .eslintrc.cjs                   # ESLint 配置
├── .gitignore
│
├── src/
│   ├── main/                       # 主进程
│   │   ├── index.ts                # 主进程入口
│   │   ├── window.ts               # 窗口管理
│   │   ├── ipc/
│   │   │   ├── index.ts            # IPC 注册器
│   │   │   ├── project.ipc.ts      # 项目 IPC
│   │   │   └── settings.ipc.ts     # 设置 IPC
│   │   ├── database/
│   │   │   ├── index.ts            # SQLite 初始化
│   │   │   ├── migrate.ts          # 迁移管理器
│   │   │   └── repositories/
│   │   │       ├── project.repo.ts
│   │   │       └── settings.repo.ts
│   │   └── services/
│   │       ├── logger.service.ts   # 日志
│   │       ├── config.service.ts   # 配置
│   │       └── tray.service.ts     # 系统托盘
│   │
│   ├── preload/
│   │   ├── index.ts                # 预加载入口
│   │   └── api.ts                  # 暴露的 API
│   │
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx            # React 入口
│   │       ├── App.tsx             # 根组件
│   │       ├── router/
│   │       │   └── index.tsx       # 路由
│   │       ├── pages/
│   │       │   ├── ChatPage.tsx
│   │       │   ├── SettingsPage.tsx
│   │       │   ├── MarketPage.tsx
│   │       │   ├── ProjectsPage.tsx
│   │       │   └── AboutPage.tsx
│   │       ├── components/
│   │       │   ├── layout/
│   │       │   │   ├── AppLayout.tsx
│   │       │   │   ├── TitleBar.tsx
│   │       │   │   ├── StatusBar.tsx
│   │       │   │   ├── LeftSidebar.tsx
│   │       │   │   ├── RightSidebar.tsx
│   │       │   │   └── BottomBar.tsx
│   │       │   ├── chat/
│   │       │   │   ├── ChatInput.tsx
│   │       │   │   ├── ModelSelector.tsx
│   │       │   │   └── ThinkingLevelSelector.tsx
│   │       │   ├── ui/
│   │       │   │   ├── Button.tsx
│   │       │   │   ├── Input.tsx
│   │       │   │   ├── Select.tsx
│   │       │   │   ├── Tooltip.tsx
│   │       │   │   └── Dialog.tsx
│   │       │   └── ErrorBoundary.tsx
│   │       ├── stores/
│   │       │   ├── uiStore.ts
│   │       │   ├── projectStore.ts
│   │       │   └── settingsStore.ts
│   │       ├── hooks/
│   │       │   └── useTheme.ts
│   │       ├── services/
│   │       │   └── ipc.ts
│   │       ├── styles/
│   │       │   └── globals.css
│   │       └── utils/
│   │           └── cn.ts
│   │
│   └── shared/
│       ├── types/
│       │   ├── ipc.ts
│       │   ├── project.ts
│       │   └── settings.ts
│       └── constants/
│           └── app.ts
│
├── resources/
│   └── icons/
│       └── icon.png                # 应用图标（占位，后续替换）
│
└── tests/                          # 测试（阶段1可选）
```

---

## Task 1: 项目初始化与依赖安装

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `.eslintrc.cjs`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "zx-code",
  "version": "0.1.0",
  "description": "ZX-Code - Windows 桌面端编程 Agent 智能体应用",
  "main": "./out/main/index.js",
  "author": "zouyuxuan122",
  "license": "MIT",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "pack": "electron-builder --dir",
    "dist": "electron-vite build && electron-builder",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "clsx": "^2.1.1",
    "electron-store": "^10.0.0",
    "framer-motion": "^11.5.4",
    "lucide-react": "^0.441.0",
    "nanoid": "^5.0.7",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.26.2",
    "tailwind-merge": "^2.5.2",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.7.4",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@typescript-eslint/eslint-plugin": "^8.8.0",
    "@typescript-eslint/parser": "^8.8.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.5",
    "electron-vite": "^2.3.0",
    "eslint": "^9.11.1",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.12",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.8"
  }
}
```

> **注意**: 使用 Tailwind CSS 3.x 而非 4.x，因为 4.x 仍处于早期阶段，3.x 生态更成熟稳定。

- [ ] **Step 2: 创建 .gitignore**

```gitignore
# 依赖
node_modules/

# 构建产物
out/
dist/

# IDE
.vscode/
.idea/
*.swp
*.swo

# 系统
.DS_Store
Thumbs.db
desktop.ini

# 日志
*.log
logs/

# 环境变量
.env
.env.local
.env.*.local

# 数据库
*.db
*.db-journal
*.db-wal
*.db-shm
```

- [ ] **Step 3: 创建 electron.vite.config.ts**

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    plugins: [react()],
  },
})
```

- [ ] **Step 4: 创建 TypeScript 配置文件**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true,
    "types": ["node", "electron-vite/node"]
  },
  "include": [
    "src/main/**/*",
    "src/preload/**/*",
    "src/shared/**/*",
    "electron.vite.config.ts"
  ]
}
```

`tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/renderer/src/*"],
      "@shared/*": ["src/shared/*"]
    },
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "types": ["vite/client"]
  },
  "include": [
    "src/renderer/src/**/*",
    "src/renderer/src/**/*.tsx",
    "src/shared/**/*"
  ]
}
```

- [ ] **Step 5: 创建 Tailwind 配置**

`tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 背景色
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
          elevated: 'var(--bg-elevated)',
          overlay: 'var(--bg-overlay)',
        },
        // 边框
        border: {
          default: 'var(--border-default)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        // 文字
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          link: 'var(--text-link)',
        },
        // 强调色
        accent: {
          blue: 'var(--accent-blue)',
          green: 'var(--accent-green)',
          orange: 'var(--accent-orange)',
          red: 'var(--accent-red)',
          purple: 'var(--accent-purple)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'Segoe UI', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['11px', '1.25'],
        sm: ['12px', '1.5'],
        base: ['13px', '1.5'],
        md: ['14px', '1.5'],
        lg: ['16px', '1.5'],
        xl: ['20px', '1.25'],
        '2xl': ['24px', '1.25'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '250ms',
        slow: '350ms',
      },
    },
  },
  plugins: [],
} satisfies Config
```

`postcss.config.js`:
```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: 创建 ESLint 配置**

`.eslintrc.cjs`:
```javascript
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'out', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off',
  },
}
```

- [ ] **Step 7: 安装依赖**

Run: `npm install`
Expected: 依赖安装成功，无错误

- [ ] **Step 8: 验证项目结构**

Run: `dir src`
Expected: 显示 main, preload, renderer, shared 目录（需先创建）

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "chore: 初始化项目结构与依赖配置

- 配置 electron-vite + React + TypeScript
- 配置 Tailwind CSS 深色主题
- 配置 ESLint 代码规范"
```

---

## Task 2: 全局样式与主题系统

**Files:**
- Create: `src/renderer/src/styles/globals.css`
- Create: `src/renderer/src/utils/cn.ts`

- [ ] **Step 1: 创建全局样式文件**

```css
/* src/renderer/src/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* 主色调 - 深色背景（Codex 风格）*/
    --bg-primary: #0d1117;
    --bg-secondary: #161b22;
    --bg-tertiary: #21262d;
    --bg-elevated: #30363d;
    --bg-overlay: rgba(22, 27, 34, 0.5);

    /* 边框 */
    --border-default: #30363d;
    --border-subtle: #21262d;
    --border-strong: #484f58;

    /* 文字 */
    --text-primary: #e6edf3;
    --text-secondary: #7d8590;
    --text-tertiary: #484f58;
    --text-link: #2f81f7;

    /* 强调色 */
    --accent-blue: #2f81f7;
    --accent-blue-hover: #1f6feb;
    --accent-green: #3fb950;
    --accent-orange: #d29922;
    --accent-red: #f85149;
    --accent-purple: #a371f7;

    /* 阴影 */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 3px 6px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);

    /* 动画过渡 */
    --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  * {
    border-color: var(--border-default);
  }

  html, body, #root {
    height: 100%;
    margin: 0;
    padding: 0;
  }

  body {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
    font-size: 13px;
    line-height: 1.5;
    overflow: hidden;
    user-select: none;
  }

  /* 滚动条样式 */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border-default);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--border-strong);
  }
}

@layer components {
  /* 可拖拽区域（标题栏）*/
  .drag-region {
    -webkit-app-region: drag;
  }

  /* 不可拖拽区域（按钮等）*/
  .no-drag {
    -webkit-app-region: no-drag;
  }
}
```

- [ ] **Step 2: 创建 className 工具函数**

```typescript
// src/renderer/src/utils/cn.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/styles/globals.css src/renderer/src/utils/cn.ts
git commit -m "feat: 添加全局样式与 Codex 深色主题

- CSS 变量定义主题色板
- 滚动条样式
- 可拖拽区域工具类"
```

---

## Task 3: 共享类型定义

**Files:**
- Create: `src/shared/types/project.ts`
- Create: `src/shared/types/settings.ts`
- Create: `src/shared/types/ipc.ts`
- Create: `src/shared/constants/app.ts`

- [ ] **Step 1: 创建项目类型定义**

```typescript
// src/shared/types/project.ts
export interface Project {
  id: string
  name: string
  workspace_path: string
  description: string | null
  created_at: number
  updated_at: number
  last_active_at: number | null
  settings: string // JSON string
}

export interface CreateProjectDto {
  name: string
  workspace_path: string
  description?: string
}

export interface UpdateProjectDto {
  name?: string
  workspace_path?: string
  description?: string
  settings?: Record<string, unknown>
}
```

- [ ] **Step 2: 创建设置类型定义**

```typescript
// src/shared/types/settings.ts
export type SettingCategory =
  | 'general'
  | 'model'
  | 'api'
  | 'permission'
  | 'theme'
  | 'log'
  | 'ui'

export interface Setting {
  key: string
  value: string // JSON string
  category: SettingCategory
  updated_at: number
}

export type ThinkingLevel = 'fast' | 'standard' | 'deep'

export interface DefaultSettings {
  'general.language': string
  'general.theme': 'dark' | 'light'
  'general.fontSize': number
  'general.startup': 'last-project' | 'none'
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
}
```

- [ ] **Step 3: 创建 IPC 类型定义**

```typescript
// src/shared/types/ipc.ts
import type { Project, CreateProjectDto, UpdateProjectDto } from './project'
import type { Setting, SettingCategory } from './settings'

export interface ProjectApi {
  list: () => Promise<Project[]>
  get: (id: string) => Promise<Project | null>
  create: (data: CreateProjectDto) => Promise<Project>
  update: (id: string, data: UpdateProjectDto) => Promise<Project>
  delete: (id: string) => Promise<void>
  setActive: (id: string) => Promise<void>
}

export interface SettingsApi {
  get: (key: string) => Promise<unknown>
  getAll: (category?: SettingCategory) => Promise<Setting[]>
  set: (key: string, value: unknown, category: SettingCategory) => Promise<void>
  delete: (key: string) => Promise<void>
}

export interface WindowApi {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
}

export interface SystemApi {
  getVersion: () => Promise<string>
  selectDirectory: () => Promise<string | null>
}

export interface IpcApi {
  project: ProjectApi
  settings: SettingsApi
  window: WindowApi
  system: SystemApi
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
}
```

- [ ] **Step 4: 创建应用常量**

```typescript
// src/shared/constants/app.ts
export const APP_NAME = 'ZX-Code'
export const APP_VERSION = '0.1.0'

export const AUTHOR_INFO = {
  github: 'https://github.com/zouyuxuan122',
  bilibili: '清浅无语qvq',
}

export const DEFAULT_WINDOW_SIZE = {
  width: 1400,
  height: 900,
  minWidth: 1000,
  minHeight: 600,
}

export const SIDEBAR_WIDTH = {
  left: 240,
  right: 300,
  leftCollapsed: 48,
  rightCollapsed: 0,
}
```

- [ ] **Step 5: 提交**

```bash
git add src/shared/
git commit -m "feat: 添加共享类型定义与应用常量

- Project/Settings 类型
- IPC API 接口定义
- 应用常量"
```

---

## Task 4: 数据库系统

**Files:**
- Create: `src/main/database/index.ts`
- Create: `src/main/database/migrate.ts`
- Create: `src/main/database/repositories/project.repo.ts`
- Create: `src/main/database/repositories/settings.repo.ts`

- [ ] **Step 1: 创建数据库初始化文件**

```typescript
// src/main/database/index.ts
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { runMigrations } from './migrate'

let db: Database.Database | null = null

export function initDatabase(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'zx-code.db')
  db = new Database(dbPath)
  
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  
  runMigrations(db)
  
  return db
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
```

- [ ] **Step 2: 创建迁移管理器**

```typescript
// src/main/database/migrate.ts
import type Database from 'better-sqlite3'

interface MigrationRecord {
  id: number
  name: string
  applied_at: number
}

const migrations: { name: string; sql: string }[] = [
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
]

export function runMigrations(db: Database.Database): void {
  // 创建迁移记录表
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
        db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
          migration.name,
          Date.now()
        )
      })
      transaction()
    }
  }

  // 插入默认设置
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
```

- [ ] **Step 3: 创建项目数据访问层**

```typescript
// src/main/database/repositories/project.repo.ts
import { getDb } from '../index'
import type { Project, CreateProjectDto, UpdateProjectDto } from '@shared/types/project'

export function findAll(): Project[] {
  const db = getDb()
  return db.prepare('SELECT * FROM projects ORDER BY last_active_at DESC NULLS LAST, created_at DESC').all() as Project[]
}

export function findById(id: string): Project | null {
  const db = getDb()
  return (db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project) || null
}

export function create(data: CreateProjectDto): Project {
  const db = getDb()
  const result = db.prepare(
    'INSERT INTO projects (name, workspace_path, description) VALUES (?, ?, ?) RETURNING *'
  ).get(data.name, data.workspace_path, data.description || null) as Project
  return result
}

export function update(id: string, data: UpdateProjectDto): Project {
  const db = getDb()
  const current = findById(id)
  if (!current) throw new Error(`Project ${id} not found`)

  const merged = {
    name: data.name ?? current.name,
    workspace_path: data.workspace_path ?? current.workspace_path,
    description: data.description ?? current.description,
    settings: data.settings ? JSON.stringify(data.settings) : current.settings,
  }

  return db.prepare(
    'UPDATE projects SET name = ?, workspace_path = ?, description = ?, settings = ?, updated_at = ? WHERE id = ? RETURNING *'
  ).get(merged.name, merged.workspace_path, merged.description, merged.settings, Date.now(), id) as Project
}

export function remove(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export function setActive(id: string): void {
  const db = getDb()
  const transaction = db.transaction(() => {
    db.prepare('UPDATE projects SET last_active_at = NULL WHERE last_active_at IS NOT NULL').run()
    db.prepare('UPDATE projects SET last_active_at = ?, updated_at = ? WHERE id = ?').run(
      Date.now(),
      Date.now(),
      id
    )
  })
  transaction()
}

export function findActive(): Project | null {
  const db = getDb()
  return (db.prepare('SELECT * FROM projects WHERE last_active_at IS NOT NULL ORDER BY last_active_at DESC LIMIT 1').get() as Project) || null
}
```

- [ ] **Step 4: 创建设置数据访问层**

```typescript
// src/main/database/repositories/settings.repo.ts
import { getDb } from '../index'
import type { Setting, SettingCategory } from '@shared/types/settings'

export function get(key: string): unknown | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM settings WHERE key = ?').get(key) as Setting | undefined
  return row ? JSON.parse(row.value) : null
}

export function getAll(category?: SettingCategory): Setting[] {
  const db = getDb()
  if (category) {
    return db.prepare('SELECT * FROM settings WHERE category = ? ORDER BY key').all(category) as Setting[]
  }
  return db.prepare('SELECT * FROM settings ORDER BY category, key').all() as Setting[]
}

export function set(key: string, value: unknown, category: SettingCategory): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO settings (key, value, category, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, category = excluded.category, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), category, Date.now())
}

export function remove(key: string): void {
  const db = getDb()
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}
```

- [ ] **Step 5: 提交**

```bash
git add src/main/database/
git commit -m "feat: 实现 SQLite 数据库系统

- 数据库初始化与连接管理
- 迁移管理器（自动建表+默认数据）
- 项目数据访问层（CRUD）
- 设置数据访问层（键值对存储）"
```

---

## Task 5: 主进程服务层

**Files:**
- Create: `src/main/services/logger.service.ts`
- Create: `src/main/services/config.service.ts`
- Create: `src/main/services/tray.service.ts`

- [ ] **Step 1: 创建日志服务**

```typescript
// src/main/services/logger.service.ts
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

let logLevel: LogLevel = 'info'
let logFile: fs.WriteStream | null = null

export function initLogger(level: LogLevel = 'info'): void {
  logLevel = level
  
  const logDir = path.join(app.getPath('userData'), 'logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  
  const logPath = path.join(logDir, `zx-code-${new Date().toISOString().split('T')[0]}.log`)
  logFile = fs.createWriteStream(logPath, { flags: 'a' })
}

function formatMessage(level: LogLevel, msg: string, error?: Error): string {
  const timestamp = new Date().toISOString()
  const errorStr = error ? `\n  ${error.stack || error.message}` : ''
  return `[${timestamp}] [${level.toUpperCase()}] ${msg}${errorStr}`
}

function log(level: LogLevel, msg: string, error?: Error): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[logLevel]) return
  
  const formatted = formatMessage(level, msg, error)
  
  // 输出到控制台
  const consoleMethod = level === 'debug' ? console.debug : level === 'warn' ? console.warn : level === 'error' ? console.error : console.info
  consoleMethod(formatted)
  
  // 写入文件
  if (logFile) {
    logFile.write(formatted + '\n')
  }
}

export const logger = {
  debug: (msg: string) => log('debug', msg),
  info: (msg: string) => log('info', msg),
  warn: (msg: string) => log('warn', msg),
  error: (msg: string, error?: Error) => log('error', msg, error),
  setLevel: (level: LogLevel) => { logLevel = level },
}
```

- [ ] **Step 2: 创建配置服务**

```typescript
// src/main/services/config.service.ts
import Store from 'electron-store'

interface WindowState {
  width: number
  height: number
  x: number | undefined
  y: number | undefined
  isMaximized: boolean
}

interface AppConfig {
  windowState: WindowState
  activeProjectId: string | null
}

const store = new Store<AppConfig>({
  defaults: {
    windowState: {
      width: 1400,
      height: 900,
      x: undefined,
      y: undefined,
      isMaximized: false,
    },
    activeProjectId: null,
  },
})

export const config = {
  getWindowState: (): WindowState => store.get('windowState'),
  setWindowState: (state: WindowState): void => store.set('windowState', state),
  
  getActiveProjectId: (): string | null => store.get('activeProjectId'),
  setActiveProjectId: (id: string | null): void => store.set('activeProjectId', id),
}
```

- [ ] **Step 3: 创建系统托盘服务**

```typescript
// src/main/services/tray.service.ts
import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron'
import path from 'path'
import { APP_NAME } from '@shared/constants/app'

let tray: Tray | null = null

export function createTray(getMainWindow: () => BrowserWindow | null): Tray {
  // 使用空图标占位，后续替换实际图标
  const iconPath = path.join(__dirname, '../../resources/icons/tray-icon.png')
  
  let icon: nativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty()
    }
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip(APP_NAME)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        const win = getMainWindow()
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }
      },
    },
    {
      label: '退出',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isVisible()) {
        if (win.isFocused()) {
          win.hide()
        } else {
          win.focus()
        }
      } else {
        win.show()
        win.focus()
      }
    }
  })

  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add src/main/services/
git commit -m "feat: 实现主进程服务层

- 日志服务（文件+控制台，分级日志）
- 配置服务（窗口状态持久化）
- 系统托盘服务"
```

---

## Task 6: 窗口管理与主进程入口

**Files:**
- Create: `src/main/window.ts`
- Create: `src/main/index.ts`

- [ ] **Step 1: 创建窗口管理模块**

```typescript
// src/main/window.ts
import { BrowserWindow, shell } from 'electron'
import path from 'path'
import { config } from './services/config.service'
import { DEFAULT_WINDOW_SIZE } from '@shared/constants/app'
import { logger } from './services/logger.service'

let mainWindow: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  const windowState = config.getWindowState()

  mainWindow = new BrowserWindow({
    width: windowState.width || DEFAULT_WINDOW_SIZE.width,
    height: windowState.height || DEFAULT_WINDOW_SIZE.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: DEFAULT_WINDOW_SIZE.minWidth,
    minHeight: DEFAULT_WINDOW_SIZE.minHeight,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 窗口准备好后再显示，避免白屏
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (windowState.isMaximized) {
      mainWindow?.maximize()
    }
  })

  // 保存窗口状态
  const saveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const isMaximized = mainWindow.isMaximized()
    const bounds = isMaximized ? undefined : mainWindow.getBounds()
    config.setWindowState({
      width: bounds?.width || windowState.width,
      height: bounds?.height || windowState.height,
      x: bounds?.x,
      y: bounds?.y,
      isMaximized,
    })
  }

  mainWindow.on('resize', saveState)
  mainWindow.on('move', saveState)
  mainWindow.on('maximize', saveState)
  mainWindow.on('unmaximize', saveState)

  // 外部链接在浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 加载页面
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  logger.info('主窗口已创建')
  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
```

- [ ] **Step 2: 创建主进程入口**

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { createMainWindow, getMainWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initDatabase, closeDatabase } from './database'
import { initLogger, logger } from './services/logger.service'
import { createTray, destroyTray } from './services/tray.service'

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    // 初始化顺序：日志 → 数据库 → IPC → 窗口 → 托盘
    initLogger('info')
    logger.info('应用启动中...')

    initDatabase()
    logger.info('数据库已初始化')

    registerIpcHandlers()
    logger.info('IPC 处理器已注册')

    createMainWindow()
    createTray(getMainWindow)
    logger.info('应用启动完成')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    logger.info('应用退出中...')
    destroyTray()
    closeDatabase()
  })
}
```

- [ ] **Step 3: 提交**

```bash
git add src/main/window.ts src/main/index.ts
git commit -m "feat: 实现窗口管理与主进程入口

- 无边框窗口 + 状态持久化
- 单实例锁
- 初始化顺序：日志→数据库→IPC→窗口→托盘"
```

---

## Task 7: IPC 通信层

**Files:**
- Create: `src/main/ipc/project.ipc.ts`
- Create: `src/main/ipc/settings.ipc.ts`
- Create: `src/main/ipc/index.ts`

- [ ] **Step 1: 创建项目 IPC 处理器**

```typescript
// src/main/ipc/project.ipc.ts
import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as projectRepo from '../database/repositories/project.repo'
import { config } from '../services/config.service'
import { logger } from '../services/logger.service'
import type { CreateProjectDto, UpdateProjectDto } from '@shared/types/project'

export function registerProjectIpc(): void {
  ipcMain.handle('project:list', () => {
    return projectRepo.findAll()
  })

  ipcMain.handle('project:get', (_event, id: string) => {
    return projectRepo.findById(id)
  })

  ipcMain.handle('project:create', (_event, data: CreateProjectDto) => {
    logger.info(`创建项目: ${data.name}`)
    return projectRepo.create(data)
  })

  ipcMain.handle('project:update', (_event, id: string, data: UpdateProjectDto) => {
    logger.info(`更新项目: ${id}`)
    return projectRepo.update(id, data)
  })

  ipcMain.handle('project:delete', (_event, id: string) => {
    logger.info(`删除项目: ${id}`)
    projectRepo.remove(id)
  })

  ipcMain.handle('project:setActive', (_event, id: string) => {
    logger.info(`激活项目: ${id}`)
    projectRepo.setActive(id)
    config.setActiveProjectId(id)
  })

  ipcMain.handle('project:getActive', () => {
    return projectRepo.findActive()
  })

  ipcMain.handle('dialog:selectDirectory', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = dialog.showOpenDialogSync(window!, {
      properties: ['openDirectory'],
    })
    return result && result.length > 0 ? result[0] : null
  })
}
```

- [ ] **Step 2: 创建设置 IPC 处理器**

```typescript
// src/main/ipc/settings.ipc.ts
import { ipcMain } from 'electron'
import * as settingsRepo from '../database/repositories/settings.repo'
import { logger } from '../services/logger.service'
import type { SettingCategory } from '@shared/types/settings'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', (_event, key: string) => {
    return settingsRepo.get(key)
  })

  ipcMain.handle('settings:getAll', (_event, category?: SettingCategory) => {
    return settingsRepo.getAll(category)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: unknown, category: SettingCategory) => {
    logger.debug(`设置更新: ${key} = ${JSON.stringify(value)}`)
    settingsRepo.set(key, value, category)
  })

  ipcMain.handle('settings:delete', (_event, key: string) => {
    settingsRepo.remove(key)
  })
}
```

- [ ] **Step 3: 创建窗口和系统 IPC 处理器**

```typescript
// src/main/ipc/index.ts
import { ipcMain, app, BrowserWindow } from 'electron'
import { registerProjectIpc } from './project.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { getMainWindow } from '../window'
import { APP_VERSION } from '@shared/constants/app'

export function registerIpcHandlers(): void {
  registerProjectIpc()
  registerSettingsIpc()

  // 窗口控制
  ipcMain.handle('window:minimize', () => {
    getMainWindow()?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    getMainWindow()?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return getMainWindow()?.isMaximized() ?? false
  })

  // 系统信息
  ipcMain.handle('system:getVersion', () => {
    return APP_VERSION
  })

  // 窗口最大化状态变化通知
  const win = getMainWindow()
  if (win) {
    win.on('maximize', () => {
      BrowserWindow.fromId(win.id)?.webContents.send('window:maximizeChanged', true)
    })
    win.on('unmaximize', () => {
      BrowserWindow.fromId(win.id)?.webContents.send('window:maximizeChanged', false)
    })
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add src/main/ipc/
git commit -m "feat: 实现 IPC 通信层

- 项目 CRUD + 激活状态
- 设置键值对读写
- 窗口控制（最小化/最大化/关闭）
- 目录选择对话框"
```

---

## Task 8: 预加载脚本

**Files:**
- Create: `src/preload/api.ts`
- Create: `src/preload/index.ts`

- [ ] **Step 1: 创建预加载 API**

```typescript
// src/preload/api.ts
import { ipcRenderer } from 'electron'
import type { IpcApi } from '@shared/types/ipc'

export const api: IpcApi = {
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    get: (id: string) => ipcRenderer.invoke('project:get', id),
    create: (data) => ipcRenderer.invoke('project:create', data),
    update: (id: string, data) => ipcRenderer.invoke('project:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('project:delete', id),
    setActive: (id: string) => ipcRenderer.invoke('project:setActive', id),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    getAll: (category) => ipcRenderer.invoke('settings:getAll', category),
    set: (key: string, value, category) => ipcRenderer.invoke('settings:set', key, value, category),
    delete: (key: string) => ipcRenderer.invoke('settings:delete', key),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  system: {
    getVersion: () => ipcRenderer.invoke('system:getVersion'),
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  },
  on: (channel: string, callback) => {
    const handler = (_event: unknown, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}
```

- [ ] **Step 2: 创建预加载入口**

```typescript
// src/preload/index.ts
import { contextBridge } from 'electron'
import { api } from './api'

// 通过 contextBridge 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 3: 提交**

```bash
git add src/preload/
git commit -m "feat: 实现预加载脚本

- contextBridge 安全通信
- 类型安全的 IPC API 封装"
```

---

## Task 9: 渲染进程入口与路由

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/router/index.tsx`
- Create: `src/renderer/src/services/ipc.ts`

- [ ] **Step 1: 创建 HTML 入口**

```html
<!-- src/renderer/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';" />
    <title>ZX-Code</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 创建 IPC 服务封装**

```typescript
// src/renderer/src/services/ipc.ts
import type { IpcApi } from '@shared/types/ipc'

// 获取全局 api 对象（由 preload 注入）
export const ipc: IpcApi = (window as unknown as { api: IpcApi }).api
```

- [ ] **Step 3: 创建 React 入口**

```tsx
// src/renderer/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
```

- [ ] **Step 4: 创建路由配置**

```tsx
// src/renderer/src/router/index.tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'

const ChatPage = lazy(() => import('@/pages/ChatPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const MarketPage = lazy(() => import('@/pages/MarketPage'))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'))
const AboutPage = lazy(() => import('@/pages/AboutPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-text-secondary text-sm">加载中...</div>
    </div>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route
        path="/chat"
        element={
          <Suspense fallback={<PageLoader />}>
            <ChatPage />
          </Suspense>
        }
      />
      <Route
        path="/settings"
        element={
          <Suspense fallback={<PageLoader />}>
            <SettingsPage />
          </Suspense>
        }
      />
      <Route
        path="/market"
        element={
          <Suspense fallback={<PageLoader />}>
            <MarketPage />
          </Suspense>
        }
      />
      <Route
        path="/projects"
        element={
          <Suspense fallback={<PageLoader />}>
            <ProjectsPage />
          </Suspense>
        }
      />
      <Route
        path="/about"
        element={
          <Suspense fallback={<PageLoader />}>
            <AboutPage />
          </Suspense>
        }
      />
    </Routes>
  )
}
```

- [ ] **Step 5: 创建 App 根组件**

```tsx
// src/renderer/src/App.tsx
import { AppLayout } from '@/components/layout/AppLayout'
import { AppRoutes } from '@/router'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <AppLayout>
        <AppRoutes />
      </AppLayout>
    </ErrorBoundary>
  )
}
```

- [ ] **Step 6: 提交**

```bash
git add src/renderer/
git commit -m "feat: 实现渲染进程入口与路由

- React 19 入口
- HashRouter 路由配置
- 懒加载页面
- IPC 服务封装"
```

---

## Task 10: 状态管理（Zustand Stores）

**Files:**
- Create: `src/renderer/src/stores/uiStore.ts`
- Create: `src/renderer/src/stores/projectStore.ts`
- Create: `src/renderer/src/stores/settingsStore.ts`

- [ ] **Step 1: 创建 UI 状态管理**

```typescript
// src/renderer/src/stores/uiStore.ts
import { create } from 'zustand'
import type { ThinkingLevel } from '@shared/types/settings'

interface UIState {
  // 侧边栏状态
  leftSidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  
  // 对话栏状态
  selectedModel: string
  thinkingLevel: ThinkingLevel
  
  // 窗口状态
  isMaximized: boolean
  
  // Actions
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  setLeftSidebarCollapsed: (collapsed: boolean) => void
  setRightSidebarCollapsed: (collapsed: boolean) => void
  setSelectedModel: (model: string) => void
  setThinkingLevel: (level: ThinkingLevel) => void
  setMaximized: (maximized: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  leftSidebarCollapsed: false,
  rightSidebarCollapsed: false,
  selectedModel: 'gpt-4',
  thinkingLevel: 'standard',
  isMaximized: false,
  
  toggleLeftSidebar: () => set((state) => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed })),
  toggleRightSidebar: () => set((state) => ({ rightSidebarCollapsed: !state.rightSidebarCollapsed })),
  setLeftSidebarCollapsed: (collapsed) => set({ leftSidebarCollapsed: collapsed }),
  setRightSidebarCollapsed: (collapsed) => set({ rightSidebarCollapsed: collapsed }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setThinkingLevel: (level) => set({ thinkingLevel: level }),
  setMaximized: (maximized) => set({ isMaximized: maximized }),
}))
```

- [ ] **Step 2: 创建项目状态管理**

```typescript
// src/renderer/src/stores/projectStore.ts
import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { Project, CreateProjectDto } from '@shared/types/project'
import { useEffect } from 'react'

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  error: string | null
  
  loadProjects: () => Promise<void>
  createProject: (data: CreateProjectDto) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  switchProject: (id: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  error: null,
  
  loadProjects: async () => {
    set({ loading: true, error: null })
    try {
      const [projects, active] = await Promise.all([
        ipc.project.list(),
        ipc.project.list().then(() => {
          // 通过 getAll 获取活跃项目 ID，再查找
          return null
        }),
      ])
      set({ projects, loading: false })
      
      // 加载当前活跃项目
      const activeProjects = projects.filter((p) => p.last_active_at !== null)
      if (activeProjects.length > 0) {
        const sorted = activeProjects.sort((a, b) => (b.last_active_at! - a.last_active_at!))
        set({ currentProject: sorted[0] })
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },
  
  createProject: async (data: CreateProjectDto) => {
    const project = await ipc.project.create(data)
    set((state) => ({ projects: [project, ...state.projects] }))
    return project
  },
  
  deleteProject: async (id: string) => {
    await ipc.project.delete(id)
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }))
  },
  
  switchProject: async (id: string) => {
    await ipc.project.setActive(id)
    const project = get().projects.find((p) => p.id === id)
    if (project) {
      set({ currentProject: project })
    }
  },
}))

// 初始化时加载项目
export function useProjectInit() {
  const loadProjects = useProjectStore((s) => s.loadProjects)
  useEffect(() => {
    loadProjects()
  }, [loadProjects])
}
```

- [ ] **Step 3: 创建设置状态管理**

```typescript
// src/renderer/src/stores/settingsStore.ts
import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { SettingCategory } from '@shared/types/settings'

interface SettingsState {
  settings: Record<string, unknown>
  loaded: boolean
  
  loadSettings: () => Promise<void>
  getSetting: <T>(key: string, defaultValue: T) => T
  updateSetting: (key: string, value: unknown, category: SettingCategory) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loaded: false,
  
  loadSettings: async () => {
    try {
      const all = await ipc.settings.getAll()
      const map: Record<string, unknown> = {}
      for (const s of all) {
        try {
          map[s.key] = JSON.parse(s.value)
        } catch {
          map[s.key] = s.value
        }
      }
      set({ settings: map, loaded: true })
    } catch (err) {
      console.error('加载设置失败:', err)
      set({ loaded: true })
    }
  },
  
  getSetting: <T>(key: string, defaultValue: T): T => {
    const value = get().settings[key]
    return value !== undefined ? (value as T) : defaultValue
  },
  
  updateSetting: async (key: string, value: unknown, category: SettingCategory) => {
    await ipc.settings.set(key, value, category)
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }))
  },
}))

// 初始化时加载设置
export function useSettingsInit() {
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const loaded = useSettingsStore((s) => s.loaded)
  if (!loaded) {
    loadSettings()
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/stores/
git commit -m "feat: 实现 Zustand 状态管理

- UI 状态（侧边栏/模型选择/窗口状态）
- 项目状态（列表/当前项目/CRUD）
- 设置状态（键值对/加载/更新）"
```

---

## Task 11: 基础 UI 组件

**Files:**
- Create: `src/renderer/src/components/ui/Button.tsx`
- Create: `src/renderer/src/components/ui/Input.tsx`
- Create: `src/renderer/src/components/ui/Select.tsx`
- Create: `src/renderer/src/components/ui/Tooltip.tsx`
- Create: `src/renderer/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: 创建 Button 组件**

```tsx
// src/renderer/src/components/ui/Button.tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

type Variant = 'default' | 'primary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  default: 'bg-bg-tertiary text-text-primary hover:bg-bg-elevated border border-border-default',
  primary: 'bg-accent-blue text-white hover:bg-accent-blue-hover',
  ghost: 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
  danger: 'bg-accent-red text-white hover:bg-accent-red/90',
  outline: 'border border-border-default text-text-primary hover:bg-bg-tertiary',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-2 text-xs rounded-md',
  md: 'h-8 px-3 text-sm rounded-md',
  lg: 'h-10 px-4 text-base rounded-lg',
  icon: 'h-8 w-8 rounded-md',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50 disabled:opacity-50 disabled:pointer-events-none no-drag',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
```

- [ ] **Step 2: 创建 Input 组件**

```tsx
// src/renderer/src/components/ui/Input.tsx
import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'flex h-8 w-full rounded-md border border-border-default bg-bg-tertiary px-3 py-1 text-sm text-text-primary placeholder:text-text-tertiary transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue focus-visible:border-accent-blue disabled:opacity-50 no-drag',
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
```

- [ ] **Step 3: 创建 Select 组件**

```tsx
// src/renderer/src/components/ui/Select.tsx
import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative inline-flex items-center">
        <select
          ref={ref}
          className={cn(
            'h-8 appearance-none rounded-md border border-border-default bg-bg-tertiary pl-3 pr-8 text-sm text-text-primary transition-colors duration-fast focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue focus-visible:border-accent-blue disabled:opacity-50 no-drag cursor-pointer',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-text-tertiary" />
      </div>
    )
  }
)
Select.displayName = 'Select'
```

- [ ] **Step 4: 创建 Tooltip 组件**

```tsx
// src/renderer/src/components/ui/Tooltip.tsx
import { type ReactNode, useState } from 'react'
import { cn } from '@/utils/cn'

interface TooltipProps {
  content: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function Tooltip({ content, children, side = 'bottom' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  
  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1',
  }
  
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={cn(
            'absolute z-50 whitespace-nowrap rounded-md border border-border-default bg-bg-elevated px-2 py-1 text-xs text-text-primary shadow-md pointer-events-none',
            sideClasses[side]
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 创建 ErrorBoundary**

```tsx
// src/renderer/src/components/ErrorBoundary.tsx
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { Button } from './ui/Button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <h2 className="text-lg font-semibold text-text-primary">应用出现错误</h2>
          <p className="text-sm text-text-secondary">抱歉，发生了意外错误。</p>
          {this.state.error && (
            <pre className="max-w-lg overflow-auto rounded-md bg-bg-tertiary p-3 text-xs text-text-secondary">
              {this.state.error.message}
            </pre>
          )}
          <Button variant="primary" onClick={this.handleReload}>
            重新加载
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/ui/ src/renderer/src/components/ErrorBoundary.tsx
git commit -m "feat: 实现基础 UI 组件

- Button（5种变体/4种尺寸）
- Input/Select 表单组件
- Tooltip 悬浮提示
- ErrorBoundary 错误边界"
```

---

## Task 12: 布局组件 - 标题栏与状态栏

**Files:**
- Create: `src/renderer/src/components/layout/AppLayout.tsx`
- Create: `src/renderer/src/components/layout/TitleBar.tsx`
- Create: `src/renderer/src/components/layout/StatusBar.tsx`
- Create: `src/renderer/src/components/layout/BottomBar.tsx`

- [ ] **Step 1: 创建标题栏**

```tsx
// src/renderer/src/components/layout/TitleBar.tsx
import { Minus, Square, X, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ipc } from '@/services/ipc'
import { useUIStore } from '@/stores/uiStore'
import { APP_NAME } from '@shared/constants/app'
import { cn } from '@/utils/cn'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const setMaximized = useUIStore((s) => s.setMaximized)
  
  useEffect(() => {
    // 获取初始最大化状态
    ipc.window.isMaximized().then(setIsMaximized)
    
    // 监听最大化状态变化
    const cleanup = ipc.on('window:maximizeChanged', (maximized: unknown) => {
      const isMax = maximized as boolean
      setIsMaximized(isMax)
      setMaximized(isMax)
    })
    
    return cleanup
  }, [setMaximized])
  
  const handleMinimize = () => ipc.window.minimize()
  const handleMaximize = () => ipc.window.maximize()
  const handleClose = () => ipc.window.close()
  
  return (
    <div className="drag-region flex h-8 items-center justify-between border-b border-border-default bg-bg-secondary px-3">
      {/* 左侧：应用名 */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-text-primary">{APP_NAME}</span>
      </div>
      
      {/* 右侧：窗口控制按钮 */}
      <div className="no-drag flex items-center">
        <button
          onClick={handleMinimize}
          className="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors duration-fast"
          title="最小化"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors duration-fast"
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={handleClose}
          className="flex h-8 w-8 items-center justify-center text-text-secondary hover:bg-accent-red hover:text-white transition-colors duration-fast"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建状态栏**

```tsx
// src/renderer/src/components/layout/StatusBar.tsx
import { Activity, Server, Cpu } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useUIStore } from '@/stores/uiStore'

export function StatusBar() {
  const currentProject = useProjectStore((s) => s.currentProject)
  const selectedModel = useUIStore((s) => s.selectedModel)
  
  return (
    <div className="flex h-7 items-center justify-between border-b border-border-default bg-bg-secondary px-3 text-xs">
      {/* 左侧：LCP / MCP 状态 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-text-secondary">
          <Cpu className="h-3 w-3" />
          <span>LCP:</span>
          <span className="text-text-primary">{selectedModel}</span>
        </div>
        <div className="flex items-center gap-1.5 text-text-secondary">
          <Activity className="h-3 w-3" />
          <span>MCP:</span>
          <span className="text-accent-green">Active</span>
        </div>
      </div>
      
      {/* 右侧：服务器状态 */}
      <div className="flex items-center gap-1.5 text-text-secondary">
        <Server className="h-3 w-3" />
        <span>Server:</span>
        <span className="text-accent-green">Connected</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 创建底部状态栏**

```tsx
// src/renderer/src/components/layout/BottomBar.tsx
import { Terminal, FolderOpen } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'

export function BottomBar() {
  const currentProject = useProjectStore((s) => s.currentProject)
  
  return (
    <div className="flex h-6 items-center justify-between border-t border-border-default bg-bg-secondary px-3 text-xs text-text-secondary">
      {/* 左侧：项目路径 */}
      <div className="flex items-center gap-1.5 truncate">
        <FolderOpen className="h-3 w-3" />
        <span className="truncate">
          {currentProject?.workspace_path || '未选择项目'}
        </span>
      </div>
      
      {/* 右侧：终端切换 */}
      <div className="flex items-center gap-2">
        <span>UTF-8</span>
        <span>·</span>
        <button className="flex items-center gap-1 hover:text-text-primary transition-colors duration-fast">
          <Terminal className="h-3 w-3" />
          <span>PowerShell</span>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 创建主布局**

```tsx
// src/renderer/src/components/layout/AppLayout.tsx
import { type ReactNode, useEffect } from 'react'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'
import { BottomBar } from './BottomBar'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { useProjectInit } from '@/stores/projectStore'
import { useSettingsInit } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  useProjectInit()
  useSettingsInit()
  
  const leftCollapsed = useUIStore((s) => s.leftSidebarCollapsed)
  const rightCollapsed = useUIStore((s) => s.rightSidebarCollapsed)
  
  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <TitleBar />
      <StatusBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">{children}</div>
        </main>
        <RightSidebar />
      </div>
      <BottomBar />
    </div>
  )
}
```

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/layout/
git commit -m "feat: 实现布局组件

- TitleBar 自定义标题栏（窗口控制）
- StatusBar 状态栏（LCP/MCP/Server）
- BottomBar 底部状态栏（项目路径/终端）
- AppLayout 主布局"
```

---

## Task 13: 侧边栏组件

**Files:**
- Create: `src/renderer/src/components/layout/LeftSidebar.tsx`
- Create: `src/renderer/src/components/layout/RightSidebar.tsx`

- [ ] **Step 1: 创建左侧栏**

```tsx
// src/renderer/src/components/layout/LeftSidebar.tsx
import { useNavigate } from 'react-router-dom'
import { Plus, Settings, Info, PanelLeftClose, PanelLeft, FolderGit2 } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useProjectStore } from '@/stores/projectStore'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/utils/cn'

export function LeftSidebar() {
  const navigate = useNavigate()
  const collapsed = useUIStore((s) => s.leftSidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleLeftSidebar)
  const { projects, currentProject, switchProject } = useProjectStore()
  
  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center gap-2 border-r border-border-default bg-bg-secondary py-2">
        <button
          onClick={toggle}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors duration-fast"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => navigate('/projects')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors duration-fast"
        >
          <FolderGit2 className="h-4 w-4" />
        </button>
      </div>
    )
  }
  
  return (
    <div className="flex w-60 flex-col border-r border-border-default bg-bg-secondary">
      {/* 头部：标题 + 折叠按钮 */}
      <div className="flex h-9 items-center justify-between px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          项目
        </span>
        <button
          onClick={toggle}
          className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors duration-fast"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      
      {/* 项目列表 */}
      <div className="flex-1 overflow-auto px-2">
        {projects.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-text-tertiary">
            暂无项目
          </div>
        ) : (
          projects.map((project) => (
            <button
              key={project.id}
              onClick={() => switchProject(project.id)}
              className={cn(
                'mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-fast',
                currentProject?.id === project.id
                  ? 'bg-bg-tertiary text-text-primary'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              )}
            >
              <FolderGit2 className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{project.name}</span>
            </button>
          ))
        )}
      </div>
      
      {/* 底部：操作按钮 */}
      <div className="border-t border-border-default p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => navigate('/projects')}
        >
          <Plus className="h-4 w-4" />
          新建项目
        </Button>
        <div className="mt-1 flex">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start"
            onClick={() => navigate('/settings')}
          >
            <Settings className="h-4 w-4" />
            设置
          </Button>
          <Tooltip content="关于">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/about')}
            >
              <Info className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建右侧栏**

```tsx
// src/renderer/src/components/layout/RightSidebar.tsx
import { PanelRightClose, PanelRight, ListTodo, Package, BookOpen } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

export function RightSidebar() {
  const collapsed = useUIStore((s) => s.rightSidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleRightSidebar)
  
  if (collapsed) {
    return (
      <div className="flex w-8 flex-col items-center gap-2 border-l border-border-default bg-bg-secondary py-2">
        <button
          onClick={toggle}
          className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors duration-fast"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>
    )
  }
  
  return (
    <div className="flex w-72 flex-col border-l border-border-default bg-bg-secondary">
      {/* 头部 */}
      <div className="flex h-9 items-center justify-between px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          详情
        </span>
        <button
          onClick={toggle}
          className="flex h-6 w-6 items-center justify-center rounded text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors duration-fast"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      
      {/* 待办事项区 */}
      <div className="flex flex-col border-b border-border-default">
        <div className="flex items-center gap-2 px-3 py-2">
          <ListTodo className="h-4 w-4 text-text-secondary" />
          <span className="text-xs font-semibold text-text-secondary">待办事项</span>
        </div>
        <div className="px-3 pb-3">
          <div className="rounded-md bg-bg-tertiary p-2 text-xs text-text-tertiary">
            暂无待办事项
          </div>
        </div>
      </div>
      
      {/* 任务产物区 */}
      <div className="flex flex-col border-b border-border-default">
        <div className="flex items-center gap-2 px-3 py-2">
          <Package className="h-4 w-4 text-text-secondary" />
          <span className="text-xs font-semibold text-text-secondary">任务产物</span>
        </div>
        <div className="px-3 pb-3">
          <div className="rounded-md bg-bg-tertiary p-2 text-xs text-text-tertiary">
            暂无任务产物
          </div>
        </div>
      </div>
      
      {/* 参考信息区 */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 py-2">
          <BookOpen className="h-4 w-4 text-text-secondary" />
          <span className="text-xs font-semibold text-text-secondary">参考信息</span>
        </div>
        <div className="px-3 pb-3">
          <div className="rounded-md bg-bg-tertiary p-2 text-xs text-text-tertiary">
            暂无参考信息
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/layout/LeftSidebar.tsx src/renderer/src/components/layout/RightSidebar.tsx
git commit -m "feat: 实现侧边栏组件

- 左侧栏：项目列表 + 新建/设置/关于按钮
- 右侧栏：待办事项/任务产物/参考信息
- 支持折叠/展开"
```

---

## Task 14: 对话栏组件（模型选择器 + 思考强度）

**Files:**
- Create: `src/renderer/src/components/chat/ModelSelector.tsx`
- Create: `src/renderer/src/components/chat/ThinkingLevelSelector.tsx`
- Create: `src/renderer/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: 创建模型选择器**

```tsx
// src/renderer/src/components/chat/ModelSelector.tsx
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check, Cpu, Cloud, HardDrive } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

interface ModelOption {
  id: string
  name: string
  provider: string
  type: 'api' | 'gateway' | 'local'
}

// 阶段1的占位模型列表（阶段2从配置加载）
const MOCK_MODELS: ModelOption[] = [
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', type: 'api' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', type: 'api' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', type: 'api' },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'Google', type: 'api' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', type: 'api' },
  { id: 'qwen-max', name: 'Qwen Max', provider: 'Alibaba', type: 'api' },
  { id: 'glm-4', name: 'GLM-4 (网关)', provider: 'Zhipu', type: 'gateway' },
  { id: 'kimi-k2', name: 'Kimi K2 (网关)', provider: 'Moonshot', type: 'gateway' },
  { id: 'llama3-8b', name: 'Llama 3 8B (本地)', provider: 'Ollama', type: 'local' },
]

const typeIcons = {
  api: Cloud,
  gateway: Cpu,
  local: HardDrive,
}

const typeColors = {
  api: 'text-accent-blue',
  gateway: 'text-accent-purple',
  local: 'text-accent-green',
}

export function ModelSelector() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selectedModel = useUIStore((s) => s.selectedModel)
  const setSelectedModel = useUIStore((s) => s.setSelectedModel)
  const ref = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  const filtered = MOCK_MODELS.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase())
  )
  
  const selected = MOCK_MODELS.find((m) => m.id === selectedModel) || MOCK_MODELS[0]
  const SelectedIcon = typeIcons[selected.type]
  
  // 按供应商分组
  const grouped = filtered.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = []
    acc[model.provider].push(model)
    return acc
  }, {} as Record<string, ModelOption[]>)
  
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border-default bg-bg-tertiary px-2 text-xs text-text-primary hover:bg-bg-elevated transition-colors duration-fast"
      >
        <SelectedIcon className={cn('h-3.5 w-3.5', typeColors[selected.type])} />
        <span>{selected.name}</span>
        <ChevronDown className="h-3 w-3 text-text-tertiary" />
      </button>
      
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-64 rounded-md border border-border-default bg-bg-elevated shadow-lg z-50">
          {/* 搜索框 */}
          <div className="border-b border-border-default p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索模型..."
                className="h-7 w-full rounded-md border border-border-default bg-bg-tertiary pl-7 pr-2 text-xs text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue"
                autoFocus
              />
            </div>
          </div>
          
          {/* 模型列表 */}
          <div className="max-h-64 overflow-auto p-1">
            {Object.entries(grouped).map(([provider, models]) => (
              <div key={provider} className="mb-1">
                <div className="px-2 py-1 text-xs font-semibold text-text-tertiary">
                  {provider}
                </div>
                {models.map((model) => {
                  const Icon = typeIcons[model.type]
                  return (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel(model.id)
                        setOpen(false)
                        setSearch('')
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-fast',
                        selectedModel === model.id
                          ? 'bg-bg-tertiary text-text-primary'
                          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5', typeColors[model.type])} />
                      <span className="flex-1 truncate">{model.name}</span>
                      {selectedModel === model.id && <Check className="h-3 w-3 text-accent-blue" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建思考强度选择器**

```tsx
// src/renderer/src/components/chat/ThinkingLevelSelector.tsx
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Zap, Brain, Sparkles, Check } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import type { ThinkingLevel } from '@shared/types/settings'
import { cn } from '@/utils/cn'

const levelConfig: Record<ThinkingLevel, { label: string; icon: typeof Zap; description: string; color: string }> = {
  fast: { label: '快速', icon: Zap, description: '最低推理深度，快速响应', color: 'text-accent-green' },
  standard: { label: '标准', icon: Sparkles, description: '默认平衡模式', color: 'text-accent-blue' },
  deep: { label: '深度', icon: Brain, description: '最大推理深度，适合复杂任务', color: 'text-accent-purple' },
}

export function ThinkingLevelSelector() {
  const [open, setOpen] = useState(false)
  const thinkingLevel = useUIStore((s) => s.thinkingLevel)
  const setThinkingLevel = useUIStore((s) => s.setThinkingLevel)
  const ref = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  const config = levelConfig[thinkingLevel]
  const Icon = config.icon
  
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border-default bg-bg-tertiary px-2 text-xs text-text-primary hover:bg-bg-elevated transition-colors duration-fast"
        title={config.description}
      >
        <Icon className={cn('h-3.5 w-3.5', config.color)} />
        <span>思考: {config.label}</span>
        <ChevronDown className="h-3 w-3 text-text-tertiary" />
      </button>
      
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-56 rounded-md border border-border-default bg-bg-elevated shadow-lg z-50 p-1">
          {(Object.keys(levelConfig) as ThinkingLevel[]).map((level) => {
            const cfg = levelConfig[level]
            const LevelIcon = cfg.icon
            return (
              <button
                key={level}
                onClick={() => {
                  setThinkingLevel(level)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors duration-fast',
                  thinkingLevel === level
                    ? 'bg-bg-tertiary text-text-primary'
                    : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                )}
              >
                <LevelIcon className={cn('mt-0.5 h-3.5 w-3.5', cfg.color)} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{cfg.label}</span>
                    {thinkingLevel === level && <Check className="h-3 w-3 text-accent-blue" />}
                  </div>
                  <div className="text-xs text-text-tertiary">{cfg.description}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 创建对话输入栏**

```tsx
// src/renderer/src/components/chat/ChatInput.tsx
import { useState, useRef, type KeyboardEvent } from 'react'
import { ArrowUp, Wrench, Paperclip } from 'lucide-react'
import { ModelSelector } from './ModelSelector'
import { ThinkingLevelSelector } from './ThinkingLevelSelector'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/utils/cn'

export function ChatInput() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
  
  const handleSend = () => {
    if (!input.trim()) return
    // 阶段2实现实际发送逻辑
    console.log('发送消息:', input)
    setInput('')
    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }
  
  const handleInput = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
    }
  }
  
  return (
    <div className="border-t border-border-default bg-bg-secondary p-3">
      <div className="rounded-lg border border-border-default bg-bg-tertiary">
        {/* 输入区 */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          className="w-full resize-none bg-transparent px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none"
          rows={1}
          style={{ maxHeight: '200px' }}
        />
        
        {/* 工具栏 */}
        <div className="flex items-center gap-2 border-t border-border-subtle px-2 py-1.5">
          <ModelSelector />
          <ThinkingLevelSelector />
          
          <Tooltip content="附件">
            <button className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors duration-fast">
              <Paperclip className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          
          <Tooltip content="工具 (3)">
            <button className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors duration-fast">
              <Wrench className="h-3.5 w-3.5" />
              <span>3</span>
            </button>
          </Tooltip>
          
          {/* 发送按钮 */}
          <div className="ml-auto">
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-fast',
                input.trim()
                  ? 'bg-accent-blue text-white hover:bg-accent-blue-hover'
                  : 'bg-bg-elevated text-text-tertiary cursor-not-allowed'
              )}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/chat/
git commit -m "feat: 实现对话栏组件

- ModelSelector 模型选择器（搜索/分组/状态标识）
- ThinkingLevelSelector 思考强度切换（快速/标准/深度）
- ChatInput 对话输入栏（多行输入/快捷键/自适应高度）"
```

---

## Task 15: 页面组件

**Files:**
- Create: `src/renderer/src/pages/ChatPage.tsx`
- Create: `src/renderer/src/pages/SettingsPage.tsx`
- Create: `src/renderer/src/pages/MarketPage.tsx`
- Create: `src/renderer/src/pages/ProjectsPage.tsx`
- Create: `src/renderer/src/pages/AboutPage.tsx`

- [ ] **Step 1: 创建对话页面**

```tsx
// src/renderer/src/pages/ChatPage.tsx
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageSquare } from 'lucide-react'

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col">
      {/* 消息列表区 */}
      <div className="flex-1 overflow-auto">
        {/* 空状态 */}
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
          <MessageSquare className="h-12 w-12 text-text-tertiary" />
          <div className="text-center">
            <h2 className="text-lg font-semibold text-text-primary">开始新对话</h2>
            <p className="mt-1 text-sm text-text-secondary">
              输入消息开始与 AI 助手对话
            </p>
          </div>
        </div>
      </div>
      
      {/* 输入栏 */}
      <ChatInput />
    </div>
  )
}
```

- [ ] **Step 2: 创建设置页面**

```tsx
// src/renderer/src/pages/SettingsPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, Settings, Cpu, Key, Shield, Palette, 
  FileText, ChevronRight 
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'

const settingTabs = [
  { id: 'general', label: '通用', icon: Settings, desc: '语言、主题、启动行为' },
  { id: 'model', label: '模型与供应商', icon: Cpu, desc: '模型配置、供应商管理' },
  { id: 'api', label: 'API 设置', icon: Key, desc: 'URL、密钥、参数' },
  { id: 'permission', label: '权限管理', icon: Shield, desc: '资源访问控制' },
  { id: 'theme', label: '外观', icon: Palette, desc: '主题、字体、快捷键' },
  { id: 'log', label: '日志', icon: FileText, desc: '日志级别、错误报告' },
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('general')
  
  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex h-12 items-center gap-3 border-b border-border-default px-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold text-text-primary">设置</h1>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        {/* 设置导航 */}
        <div className="w-56 border-r border-border-default p-2">
          {settingTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'mb-0.5 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors duration-fast',
                  activeTab === tab.id
                    ? 'bg-bg-tertiary text-text-primary'
                    : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-sm">{tab.label}</span>
              </button>
            )
          })}
        </div>
        
        {/* 设置内容 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-1 text-lg font-semibold text-text-primary">
              {settingTabs.find((t) => t.id === activeTab)?.label}
            </h2>
            <p className="mb-6 text-sm text-text-secondary">
              {settingTabs.find((t) => t.id === activeTab)?.desc}
            </p>
            
            <div className="rounded-md border border-border-default bg-bg-secondary p-4">
              <p className="text-sm text-text-tertiary">
                此设置项将在阶段 3 完整实现。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 创建市场页面**

```tsx
// src/renderer/src/pages/MarketPage.tsx
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Store, Search, Package, Layers } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function MarketPage() {
  const navigate = useNavigate()
  
  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex h-12 items-center gap-3 border-b border-border-default px-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Store className="h-4 w-4 text-text-secondary" />
        <h1 className="text-base font-semibold text-text-primary">扩展市场</h1>
      </div>
      
      {/* 搜索栏 */}
      <div className="border-b border-border-default p-3">
        <div className="relative mx-auto max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <Input
            placeholder="搜索扩展..."
            className="pl-9"
          />
        </div>
      </div>
      
      {/* 分类标签 */}
      <div className="flex gap-2 border-b border-border-default px-4 py-2">
        <button className="rounded-md bg-bg-tertiary px-3 py-1 text-xs text-text-primary">
          全部
        </button>
        <button className="rounded-md px-3 py-1 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors duration-fast">
          <span className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            SCL
          </span>
        </button>
        <button className="rounded-md px-3 py-1 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors duration-fast">
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            MCP
          </span>
        </button>
      </div>
      
      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-md border border-border-default bg-bg-secondary p-8 text-center">
            <Store className="mx-auto mb-2 h-8 w-8 text-text-tertiary" />
            <p className="text-sm text-text-tertiary">
              市场功能将在阶段 4 完整实现
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 创建项目管理页面**

```tsx
// src/renderer/src/pages/ProjectsPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, FolderOpen, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useProjectStore } from '@/stores/projectStore'
import { ipc } from '@/services/ipc'
import { cn } from '@/utils/cn'

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { projects, currentProject, createProject, deleteProject, switchProject } = useProjectStore()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  
  const handleSelectPath = async () => {
    const dir = await ipc.system.selectDirectory()
    if (dir) setPath(dir)
  }
  
  const handleCreate = async () => {
    if (!name.trim() || !path.trim()) return
    await createProject({
      name: name.trim(),
      workspace_path: path.trim(),
      description: description.trim() || undefined,
    })
    setName('')
    setPath('')
    setDescription('')
    setShowCreate(false)
  }
  
  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex h-12 items-center gap-3 border-b border-border-default px-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold text-text-primary">项目管理</h1>
        <div className="ml-auto">
          <Button variant="primary" size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4" />
            新建项目
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl">
          {/* 新建项目表单 */}
          {showCreate && (
            <div className="mb-4 rounded-md border border-border-default bg-bg-secondary p-4">
              <h3 className="mb-3 text-sm font-semibold text-text-primary">新建项目</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-text-secondary">项目名称</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="输入项目名称"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-secondary">工作区路径</label>
                  <div className="flex gap-2">
                    <Input
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      placeholder="选择或输入工作区路径"
                      className="flex-1"
                    />
                    <Button variant="outline" size="md" onClick={handleSelectPath}>
                      <FolderOpen className="h-4 w-4" />
                      浏览
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-secondary">描述（可选）</label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="项目描述"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="md" onClick={() => setShowCreate(false)}>
                    取消
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleCreate}
                    disabled={!name.trim() || !path.trim()}
                  >
                    创建
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {/* 项目列表 */}
          <div className="space-y-2">
            {projects.length === 0 ? (
              <div className="rounded-md border border-border-default bg-bg-secondary p-8 text-center">
                <FolderOpen className="mx-auto mb-2 h-8 w-8 text-text-tertiary" />
                <p className="text-sm text-text-tertiary">暂无项目，点击"新建项目"创建</p>
              </div>
            ) : (
              projects.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    'flex items-center gap-3 rounded-md border bg-bg-secondary p-3 transition-colors duration-fast',
                    currentProject?.id === project.id
                      ? 'border-accent-blue/50 bg-bg-tertiary'
                      : 'border-border-default hover:border-border-strong'
                  )}
                >
                  <FolderOpen className="h-5 w-5 flex-shrink-0 text-text-secondary" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{project.name}</span>
                      {currentProject?.id === project.id && (
                        <span className="flex items-center gap-0.5 text-xs text-accent-blue">
                          <Check className="h-3 w-3" />
                          当前
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-text-tertiary">
                      {project.workspace_path}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {currentProject?.id !== project.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => switchProject(project.id)}
                      >
                        切换
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`确定删除项目 "${project.name}"?`)) {
                          deleteProject(project.id)
                        }
                      }}
                      className="text-text-tertiary hover:text-accent-red"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 创建关于页面**

```tsx
// src/renderer/src/pages/AboutPage.tsx
import { useNavigate, useEffect, useState } from 'react'
import { ArrowLeft, Github, Tv, Code2, Heart } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ipc } from '@/services/ipc'
import { APP_NAME, AUTHOR_INFO } from '@shared/constants/app'

export default function AboutPage() {
  const navigate = useNavigate()
  const [version, setVersion] = useState('0.1.0')
  
  useEffect(() => {
    ipc.system.getVersion().then(setVersion)
  }, [])
  
  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex h-12 items-center gap-3 border-b border-border-default px-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chat')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold text-text-primary">关于</h1>
      </div>
      
      {/* 内容 */}
      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-2xl">
          {/* 应用信息 */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-xl bg-gradient-to-br from-accent-blue to-accent-purple">
              <Code2 className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-text-primary">{APP_NAME}</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Windows 桌面端编程 Agent 智能体应用
            </p>
            <p className="mt-2 text-xs text-text-tertiary">版本 {version}</p>
          </div>
          
          {/* 作者信息 */}
          <div className="rounded-lg border border-border-default bg-bg-secondary p-6">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">作者信息</h3>
            
            <div className="space-y-3">
              {/* GitHub */}
              <a
                href={AUTHOR_INFO.github}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-md p-2 hover:bg-bg-tertiary transition-colors duration-fast"
              >
                <Github className="h-5 w-5 text-text-secondary" />
                <div>
                  <div className="text-xs text-text-tertiary">GitHub</div>
                  <div className="text-sm text-text-primary">{AUTHOR_INFO.github}</div>
                </div>
              </a>
              
              {/* B站 */}
              <div className="flex items-center gap-3 rounded-md p-2">
                <Tv className="h-5 w-5 text-text-secondary" />
                <div>
                  <div className="text-xs text-text-tertiary">B站</div>
                  <div className="text-sm text-text-primary">{AUTHOR_INFO.bilibili}</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 技术栈 */}
          <div className="mt-4 rounded-lg border border-border-default bg-bg-secondary p-6">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">技术栈</h3>
            <div className="flex flex-wrap gap-2">
              {['Electron', 'React', 'TypeScript', 'Tailwind CSS', 'Zustand', 'SQLite'].map((tech) => (
                <span
                  key={tech}
                  className="rounded-md bg-bg-tertiary px-2 py-1 text-xs text-text-secondary"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
          
          {/* 版权 */}
          <div className="mt-6 text-center text-xs text-text-tertiary">
            <p className="flex items-center justify-center gap-1">
              Made with <Heart className="h-3 w-3 text-accent-red" /> by {APP_NAME}
            </p>
            <p className="mt-1">MIT License</p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/pages/
git commit -m "feat: 实现页面组件

- ChatPage 对话页面（空状态+输入栏）
- SettingsPage 设置页面（6个分类导航）
- MarketPage 市场页面（搜索+分类占位）
- ProjectsPage 项目管理（创建/切换/删除）
- AboutPage 关于页面（作者信息+技术栈）"
```

---

## Task 16: 打包配置与资源文件

**Files:**
- Create: `electron-builder.yml`
- Create: `resources/icons/icon.png` (占位)

- [ ] **Step 1: 创建打包配置**

```yaml
# electron-builder.yml
appId: com.zuxuan.zx-code
productName: ZX-Code
copyright: Copyright © 2026 zouyuxuan122

directories:
  output: dist
  buildResources: resources

files:
  - out/**/*
  - resources/**/*
  - package.json

extraMetadata:
  main: out/main/index.js

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icons/icon.ico
  artifactName: ${productName}-${version}-${arch}.${ext}

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: ZX-Code
```

- [ ] **Step 2: 创建资源目录占位**

Run: `mkdir -p resources/icons`
Run: `echo "placeholder" > resources/icons/.gitkeep`

- [ ] **Step 3: 验证开发环境启动**

Run: `npm run dev`
Expected: Electron 应用启动，显示深色主题界面

- [ ] **Step 4: 验证构建**

Run: `npm run build`
Expected: 构建成功，输出到 out/ 目录

- [ ] **Step 5: 提交**

```bash
git add electron-builder.yml resources/
git commit -m "chore: 添加打包配置与资源目录

- electron-builder NSIS 安装包配置
- 应用图标占位"
```

---

## Task 17: 最终验证与文档

- [ ] **Step 1: 运行完整开发环境**

Run: `npm run dev`

验证清单：
- [ ] 应用正常启动，无白屏
- [ ] 深色主题正确显示
- [ ] 标题栏窗口控制按钮可用（最小化/最大化/关闭）
- [ ] 状态栏显示 LCP/MCP/Server 信息
- [ ] 左侧栏显示项目列表
- [ ] 右侧栏可折叠/展开
- [ ] 对话栏显示模型选择器 + 思考强度切换
- [ ] 模型选择器可搜索、按供应商分组
- [ ] 思考强度三档可切换
- [ ] 路由切换正常（对话/设置/市场/项目/关于）
- [ ] 项目管理可创建/切换/删除项目
- [ ] 关于页面显示作者信息
- [ ] 底部状态栏显示项目路径
- [ ] 系统托盘功能正常
- [ ] 数据库正常初始化

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: 阶段1完成 - 基础框架与核心UI

完成内容:
- Electron + React + TypeScript 项目搭建
- Codex 风格深色主题系统
- 完整布局（标题栏/状态栏/侧边栏/底部栏）
- 对话栏（模型选择器+思考强度切换）
- 5个页面（对话/设置/市场/项目/关于）
- SQLite 数据库系统
- 项目管理功能（CRUD）
- 窗口状态持久化
- 系统托盘
- IPC 通信层"
```

---

## 验收标准对照

| 验收项 | 状态 | 对应任务 |
|--------|------|---------|
| 应用可在 Windows 10+ 上正常启动 | ✅ | Task 6, 17 |
| Codex 风格深色主题界面正确显示 | ✅ | Task 2, 12 |
| 左侧栏项目列表可显示、新建项目 | ✅ | Task 13, 15 |
| 右侧栏可折叠/展开 | ✅ | Task 13 |
| 顶部状态栏显示占位状态信息 | ✅ | Task 12 |
| 底部状态栏显示项目路径 | ✅ | Task 12 |
| 对话栏 UI 完整（含模型选择器 + 思考强度切换） | ✅ | Task 14 |
| 路由可正常切换 | ✅ | Task 9, 15 |
| 设置页面框架可显示 | ✅ | Task 15 |
| 关于页面显示作者信息 | ✅ | Task 15 |
| SQLite 数据库正常初始化 | ✅ | Task 4 |
| 项目数据可持久化存储 | ✅ | Task 4, 7 |
| 窗口状态可记忆 | ✅ | Task 5, 6 |
| 系统托盘功能正常 | ✅ | Task 5 |
| 无明显卡顿，动画流畅 | ✅ | Task 2 (CSS transitions) |

---

*本计划覆盖阶段 1 的所有实现内容。后续阶段将各自有独立的实现计划。*
