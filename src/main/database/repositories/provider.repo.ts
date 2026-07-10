import { getDb } from '../index'
import type { ProviderConfig, ModelInfo, ProviderType, CreateProviderDto, UpdateProviderDto } from '@shared/types/model'

export function findAll(): ProviderConfig[] {
  const db = getDb()
  return db.prepare('SELECT * FROM providers ORDER BY created_at ASC').all() as ProviderConfig[]
}

export function findEnabled(): ProviderConfig[] {
  const db = getDb()
  return db.prepare('SELECT * FROM providers WHERE enabled = 1 ORDER BY created_at ASC').all() as ProviderConfig[]
}

export function findById(id: string): ProviderConfig | null {
  const db = getDb()
  return (db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as ProviderConfig) || null
}

export function create(data: CreateProviderDto): ProviderConfig {
  const db = getDb()
  return db.prepare(
    'INSERT INTO providers (name, type, base_url, api_key, enabled) VALUES (?, ?, ?, ?, ?) RETURNING *'
  ).get(
    data.name,
    data.type,
    data.base_url,
    data.api_key,
    data.enabled !== false ? 1 : 0
  ) as ProviderConfig
}

export function update(id: string, data: UpdateProviderDto): ProviderConfig {
  const db = getDb()
  const current = findById(id)
  if (!current) throw new Error(`Provider ${id} not found`)

  const merged = {
    name: data.name ?? current.name,
    base_url: data.base_url ?? current.base_url,
    api_key: data.api_key ?? current.api_key,
    enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : current.enabled,
  }

  return db.prepare(
    'UPDATE providers SET name = ?, base_url = ?, api_key = ?, enabled = ?, updated_at = ? WHERE id = ? RETURNING *'
  ).get(merged.name, merged.base_url, merged.api_key, merged.enabled, Date.now(), id) as ProviderConfig
}

export function remove(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM providers WHERE id = ?').run(id)
}

// 模型相关
export function findModels(providerId: string): ModelInfo[] {
  const db = getDb()
  const rows = db.prepare(
    `SELECT m.*, p.name as provider_name, p.type as provider_type
     FROM models m
     JOIN providers p ON m.provider_id = p.id
     WHERE m.provider_id = ?
     ORDER BY m.name ASC`
  ).all(providerId) as Array<{
    id: string
    provider_id: string
    model_id: string
    name: string
    context_length: number
    supports_tools: number
    supports_vision: number
    description: string | null
    created_at: number
    provider_name: string
    provider_type: string
  }>

  return rows.map(row => ({
    id: row.id,
    provider_id: row.provider_id,
    provider: row.provider_name,
    name: row.name,
    context_length: row.context_length,
    supports_tools: row.supports_tools === 1,
    supports_vision: row.supports_vision === 1,
    description: row.description || undefined,
    type: row.provider_type as ProviderType,
  }))
}

export function addModel(data: {
  provider_id: string
  model_id: string
  name: string
  context_length?: number
  supports_tools?: boolean
  supports_vision?: boolean
  description?: string
}): void {
  const db = getDb()
  db.prepare(
    'INSERT OR REPLACE INTO models (provider_id, model_id, name, context_length, supports_tools, supports_vision, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    data.provider_id,
    data.model_id,
    data.name,
    data.context_length || 4096,
    data.supports_tools ? 1 : 0,
    data.supports_vision ? 1 : 0,
    data.description || null
  )
}

export function removeModels(providerId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM models WHERE provider_id = ?').run(providerId)
}

/** 更新单个模型的上下文长度 */
export function updateModelContextLength(providerId: string, modelId: string, contextLength: number): void {
  const db = getDb()
  db.prepare(
    'UPDATE models SET context_length = ? WHERE provider_id = ? AND model_id = ?'
  ).run(contextLength, providerId, modelId)
}

/** 按 model_id 查找模型信息（跨所有 provider） */
export function findModelByModelId(modelId: string): ModelInfo | null {
  const db = getDb()
  const row = db.prepare(
    `SELECT m.*, p.name as provider_name, p.type as provider_type
     FROM models m
     JOIN providers p ON m.provider_id = p.id
     WHERE m.model_id = ? OR m.name = ?
     LIMIT 1`
  ).get(modelId, modelId) as ({
    id: string
    provider_id: string
    model_id: string
    name: string
    context_length: number
    supports_tools: number
    supports_vision: number
    description: string | null
    created_at: number
    provider_name: string
    provider_type: string
  }) | undefined

  if (!row) return null

  return {
    id: row.id,
    provider_id: row.provider_id,
    provider: row.provider_name,
    name: row.name,
    context_length: row.context_length,
    supports_tools: row.supports_tools === 1,
    supports_vision: row.supports_vision === 1,
    description: row.description || undefined,
    type: row.provider_type as ProviderType,
  }
}
