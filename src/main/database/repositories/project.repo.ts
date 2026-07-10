import { getDb } from '../index'
import type { Project, CreateProjectDto, UpdateProjectDto } from '@shared/types/project'
import * as settingsRepo from './settings.repo'

/**
 * 将 file:// URL 转换为 app-asset:// 协议，以便在沙箱化渲染进程中正常加载
 */
function migrateFileUrls(project: Project): Project {
  return {
    ...project,
    ai_avatar: convertToAssetUrl(project.ai_avatar),
    user_avatar: convertToAssetUrl(project.user_avatar),
    background: project.background_type === 'image' ? convertToAssetUrl(project.background) : project.background,
  }
}

function convertToAssetUrl(url: string): string {
  if (!url) return url
  if (/^file:\/\/\//.test(url)) {
    // file:///C:/... -> app-asset:///C:/... （保留三斜杠格式）
    return 'app-asset://' + url.slice('file://'.length)
  }
  if (/^file:\/\//.test(url)) {
    // file://host/path -> app-asset:///path
    return 'app-asset:///' + url.slice('file://'.length).replace(/^[^/]+/, '')
  }
  return url
}

/**
 * 工作区外观共享设置
 *
 * 共享开启时，所有工作区在显示时使用 settings 表里的统一外观值；
 * 关闭时，各工作区使用自己的 ai_avatar / user_avatar / background 字段。
 *
 * 注意：共享值仅用于显示覆盖，不会写回各 project 的字段；
 *       关闭共享后各工作区立即恢复各自的外观。
 */
interface ShareAppearanceSettings {
  shareAppearance: boolean
  sharedAiAvatar: string
  sharedUserAvatar: string
  sharedBackground: string
  sharedBackgroundType: 'none' | 'color' | 'image'
}

/** 读取共享外观设置 */
export function getShareAppearanceSettings(): ShareAppearanceSettings {
  const share = readBool('workspace.shareAppearance', false)
  const ai = readString('workspace.sharedAiAvatar', '')
  const user = readString('workspace.sharedUserAvatar', '')
  const bg = readString('workspace.sharedBackground', '')
  const bgType = readString('workspace.sharedBackgroundType', 'none') as 'none' | 'color' | 'image'
  return {
    shareAppearance: share,
    sharedAiAvatar: convertToAssetUrl(ai),
    sharedUserAvatar: convertToAssetUrl(user),
    sharedBackground: bgType === 'image' ? convertToAssetUrl(bg) : bg,
    sharedBackgroundType: bgType,
  }
}

/** 若开启共享，覆盖 project 的外观字段；否则原样返回 */
function applyShareAppearance(project: Project): Project {
  const s = getShareAppearanceSettings()
  if (!s.shareAppearance) return migrateFileUrls(project)
  return migrateFileUrls({
    ...project,
    ai_avatar: s.sharedAiAvatar,
    user_avatar: s.sharedUserAvatar,
    background: s.sharedBackground,
    background_type: s.sharedBackgroundType,
  })
}

function readBool(key: string, def: boolean): boolean {
  const v = settingsRepo.get(key)
  return typeof v === 'boolean' ? v : def
}

function readString(key: string, def: string): string {
  const v = settingsRepo.get(key)
  return typeof v === 'string' ? v : def
}

export function findAll(): Project[] {
  const db = getDb()
  // SQLite 不支持 NULLS LAST 语法，用 CASE 模拟：last_active_at IS NULL 排在后面
  const rows = db.prepare(
    'SELECT * FROM projects ORDER BY CASE WHEN last_active_at IS NULL THEN 1 ELSE 0 END, last_active_at DESC, created_at DESC',
  ).all() as Project[]
  return rows.map(applyShareAppearance)
}

export function findById(id: string): Project | null {
  const db = getDb()
  const row = (db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project) || null
  return row ? applyShareAppearance(row) : null
}

/** 读取 project 原始字段（不走共享覆盖），用于 update 时合并 */
function findByIdRaw(id: string): Project | null {
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
  // 用原始字段合并，避免共享覆盖值被写回
  const current = findByIdRaw(id)
  if (!current) throw new Error(`Project ${id} not found`)

  const merged = {
    name: data.name ?? current.name,
    workspace_path: data.workspace_path ?? current.workspace_path,
    description: data.description ?? current.description,
    settings: data.settings ? JSON.stringify(data.settings) : current.settings,
    ai_avatar: data.ai_avatar ?? current.ai_avatar,
    user_avatar: data.user_avatar ?? current.user_avatar,
    background: data.background ?? current.background,
    background_type: data.background_type ?? current.background_type,
  }

  const row = db.prepare(
    `UPDATE projects
     SET name = ?, workspace_path = ?, description = ?, settings = ?,
         ai_avatar = ?, user_avatar = ?, background = ?, background_type = ?,
         updated_at = ?
     WHERE id = ? RETURNING *`,
  ).get(
    merged.name,
    merged.workspace_path,
    merged.description,
    merged.settings,
    merged.ai_avatar,
    merged.user_avatar,
    merged.background,
    merged.background_type,
    Date.now(),
    id,
  ) as Project
  // 返回时应用共享覆盖（前端拿到的就是显示值）
  return applyShareAppearance(row)
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
