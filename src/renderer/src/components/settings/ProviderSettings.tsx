import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
  ChevronDown,
  AlertCircle,
  Cpu,
  Save,
} from 'lucide-react'
import { ipc } from '@/services/ipc'
import type {
  ProviderConfig,
  ModelInfo,
  ProviderType,
  CreateProviderDto,
} from '@shared/types/model'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/utils/cn'

/** 各类型 Provider 的默认 base_url */
const DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com/v1',
  ollama: 'http://localhost:11434',
  webchat: 'http://127.0.0.1:8080',
  custom: '',
}

/** Provider 类型可选项 */
const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'ollama', label: 'Ollama (本地)' },
  { value: 'custom', label: '自定义' },
]

/** 类型徽章颜色 */
const typeBadgeColors: Record<ProviderType, string> = {
  openai: 'bg-accent-blue/10 text-accent-blue',
  anthropic: 'bg-accent-orange/10 text-accent-orange',
  gemini: 'bg-accent-green/10 text-accent-green',
  ollama: 'bg-accent-green/10 text-accent-green',
  webchat: 'bg-accent-blue/10 text-accent-blue',
  custom: 'bg-bg-elevated text-text-secondary',
}

/** 格式化上下文长度 */
function formatContextLength(length: number): string {
  if (length >= 1000) return `${(length / 1000).toFixed(0)}K`
  return String(length)
}

// ============ 启用开关 ============
function EnabledToggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-fast disabled:opacity-50',
        enabled ? 'bg-accent-blue' : 'bg-bg-elevated',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-fast',
          enabled ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

// ============ 单个 Provider 卡片 ============
export function ProviderCard({
  provider,
  onChange,
  onDelete,
}: {
  provider: ProviderConfig
  onChange: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<null | { ok: boolean; message: string }>(null)
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  // 模型上下文长度编辑状态
  const [editingCtx, setEditingCtx] = useState<{ modelId: string; value: string } | null>(null)

  // 编辑表单
  const [editName, setEditName] = useState(provider.name)
  const [editBaseUrl, setEditBaseUrl] = useState(provider.base_url)
  const [editApiKey, setEditApiKey] = useState(provider.api_key)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing) {
      setEditName(provider.name)
      setEditBaseUrl(provider.base_url)
      setEditApiKey(provider.api_key)
    }
  }, [editing, provider])

  const handleListModels = async () => {
    setLocalError(null)
    setLoadingModels(true)
    setExpanded(true)
    try {
      const result = await ipc.provider.listModels(provider.id)
      if (result.ok) {
        setModels(result.models)
      } else {
        setLocalError(result.error || '拉取失败')
        setModels([])
      }
    } catch (err) {
      setLocalError((err as Error).message)
    } finally {
      setLoadingModels(false)
    }
  }

  const handleTestConnection = async () => {
    setLocalError(null)
    setTesting(true)
    setTestResult(null)
    try {
      const result = await ipc.provider.testConnection(provider.id)
      setTestResult({
        ok: result.ok,
        message: result.ok
          ? `连接成功（发现 ${result.modelCount ?? 0} 个模型）`
          : `连接失败：${result.error || '未知错误'}`,
      })
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const handleToggleEnabled = async (next: boolean) => {
    setLocalError(null)
    setTogglingEnabled(true)
    try {
      await ipc.provider.update(provider.id, { enabled: next })
      onChange()
    } catch (err) {
      setLocalError((err as Error).message)
    } finally {
      setTogglingEnabled(false)
    }
  }

  const handleSave = async () => {
    setLocalError(null)
    setSaving(true)
    try {
      await ipc.provider.update(provider.id, {
        name: editName.trim(),
        base_url: editBaseUrl.trim(),
        api_key: editApiKey,
      })
      setEditing(false)
      onChange()
    } catch (err) {
      setLocalError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (window.confirm(`确定删除供应商「${provider.name}」吗？此操作不可撤销。`)) {
      void onDelete()
    }
  }

  const handleSaveModelCtx = async (modelId: string) => {
    if (!editingCtx) return
    const value = parseInt(editingCtx.value, 10)
    if (isNaN(value) || value < 1000 || value > 1000000) {
      setLocalError('上下文长度需在 1,000 ~ 1,000,000 之间')
      return
    }
    setLocalError(null)
    try {
      await ipc.provider.updateModelContextLength(provider.id, modelId, value)
      // 更新本地模型列表
      setModels((prev) =>
        prev.map((m) =>
          m.id === modelId ? { ...m, context_length: value } : m
        )
      )
      setEditingCtx(null)
      onChange()
    } catch (err) {
      setLocalError((err as Error).message)
    }
  }

  return (
    <div className="rounded-md border border-border-default bg-bg-secondary">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform duration-fast',
              !expanded && '-rotate-90',
            )}
          />
          <Cpu className="h-4 w-4 flex-shrink-0 text-text-secondary" />
          <span className="flex-1 truncate text-sm font-medium text-text-primary">
            {provider.name}
          </span>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-xs font-medium',
              typeBadgeColors[provider.type],
            )}
          >
            {PROVIDER_TYPES.find((t) => t.value === provider.type)?.label ?? provider.type}
          </span>
        </button>
        <EnabledToggle
          enabled={provider.enabled}
          onChange={handleToggleEnabled}
          disabled={togglingEnabled}
        />
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-t border-border-default px-3 py-3 space-y-3">
          {localError && (
            <div className="flex items-start gap-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-2.5 py-2 text-xs text-accent-red">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1">{localError}</span>
            </div>
          )}

          {testResult && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-md px-2.5 py-2 text-xs',
                testResult.ok
                  ? 'border border-accent-green/30 bg-accent-green/5 text-accent-green'
                  : 'border border-accent-red/30 bg-accent-red/5 text-accent-red',
              )}
            >
              {testResult.ok ? (
                <Check className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <X className="h-3.5 w-3.5 flex-shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {editing ? (
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">名称</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="供应商名称"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  Base URL
                </label>
                <Input
                  value={editBaseUrl}
                  onChange={(e) => setEditBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  API Key
                </label>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !editName.trim() || !editBaseUrl.trim()}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  保存
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false)
                    setLocalError(null)
                  }}
                  disabled={saving}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* 只读信息 */}
              <div className="space-y-1.5 text-xs">
                <div className="flex gap-2">
                  <span className="w-20 flex-shrink-0 text-text-tertiary">Base URL</span>
                  <span className="flex-1 break-all font-mono text-text-secondary">
                    {provider.base_url || '(未设置)'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="w-20 flex-shrink-0 text-text-tertiary">API Key</span>
                  <span className="flex-1 font-mono text-text-secondary">
                    {provider.api_key ? '••••••••（已设置）' : '(未设置)'}
                  </span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleListModels}
                  disabled={loadingModels}
                >
                  {loadingModels ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  拉取模型列表
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  测试连接
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDelete} className="text-accent-red hover:bg-accent-red/10">
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </Button>
              </div>

              {/* 模型列表 */}
              {loadingModels && models.length === 0 ? (
                <div className="flex items-center justify-center gap-1.5 py-3 text-xs text-text-tertiary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>加载模型中...</span>
                </div>
              ) : models.length > 0 ? (
                <div className="rounded-md border border-border-default">
                  <div className="border-b border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-secondary">
                    模型列表（{models.length}）
                  </div>
                  <div className="max-h-60 overflow-auto">
                    {models.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center gap-2 border-b border-border-default px-2.5 py-1.5 text-xs last:border-b-0"
                      >
                        <span className="flex-1 truncate font-mono text-text-primary">
                          {model.name}
                        </span>
                        {editingCtx?.modelId === model.id ? (
                          <input
                            type="number"
                            value={editingCtx.value}
                            onChange={(e) => setEditingCtx({ modelId: model.id, value: e.target.value })}
                            onBlur={() => void handleSaveModelCtx(model.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveModelCtx(model.id)
                              if (e.key === 'Escape') setEditingCtx(null)
                            }}
                            autoFocus
                            className="w-20 rounded border border-accent-blue bg-bg-primary px-1.5 py-0.5 text-xs text-text-primary outline-none"
                            title="上下文长度（1,000 ~ 1,000,000）"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingCtx({ modelId: model.id, value: String(model.context_length) })}
                            className="rounded bg-bg-elevated px-1.5 py-0.5 text-text-tertiary transition-smooth-fast hover:bg-hover-surface hover:text-text-primary"
                            title="点击编辑上下文长度"
                          >
                            {formatContextLength(model.context_length)}
                          </button>
                        )}
                        {model.supports_tools && (
                          <span className="rounded bg-accent-blue/10 px-1.5 py-0.5 text-accent-blue">
                            工具
                          </span>
                        )}
                        {model.supports_vision && (
                          <span className="rounded bg-accent-purple/10 px-1.5 py-0.5 text-accent-purple">
                            视觉
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ============ 添加供应商表单 ============
function AddProviderForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ProviderType>('openai')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URLS.openai)
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTypeChange = (next: ProviderType) => {
    setType(next)
    setBaseUrl(DEFAULT_BASE_URLS[next])
  }

  const handleSubmit = async () => {
    setError(null)
    if (!name.trim()) {
      setError('请填写供应商名称')
      return
    }
    if (!baseUrl.trim()) {
      setError('请填写 Base URL')
      return
    }
    setSaving(true)
    try {
      const data: CreateProviderDto = {
        name: name.trim(),
        type,
        base_url: baseUrl.trim(),
        api_key: apiKey,
        enabled,
      }
      await ipc.provider.create(data)
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-accent-blue/30 bg-bg-secondary p-4">
      <div className="text-sm font-semibold text-text-primary">新增供应商</div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-2.5 py-2 text-xs text-accent-red">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">名称</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：我的 OpenAI"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">类型</label>
          <Select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as ProviderType)}
            className="w-full"
          >
            {PROVIDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Base URL</label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com/v1"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">API Key</label>
        <div className="relative">
          <Input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-...（Ollama 可留空）"
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShowApiKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
          >
            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <EnabledToggle enabled={enabled} onChange={setEnabled} />
        <span className="text-xs text-text-secondary">启用此供应商</span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={saving || !name.trim() || !baseUrl.trim()}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          保存
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </div>
    </div>
  )
}

// ============ 主组件 ============
export function ProviderSettings() {
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const loadProviders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await ipc.provider.list()
      setProviders(list)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const handleDelete = async (id: string) => {
    try {
      await ipc.provider.delete(id)
      await loadProviders()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      {/* 标题与操作 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 text-lg font-semibold text-text-primary">模型与供应商</h2>
          <p className="text-sm text-text-secondary">
            管理模型供应商配置，添加后可拉取可用模型列表用于对话。
          </p>
        </div>
        {!showAddForm && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            添加供应商
          </Button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-3 py-2 text-sm text-accent-red">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-accent-red/70 hover:text-accent-red"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 添加表单 */}
      {showAddForm && (
        <AddProviderForm
          onCreated={() => {
            setShowAddForm(false)
            void loadProviders()
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Provider 列表 */}
      {loading && providers.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>加载中...</span>
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-md border border-border-default bg-bg-secondary px-4 py-8 text-center text-sm text-text-tertiary">
          暂未配置任何供应商
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="text-accent-blue hover:underline"
            >
              点击添加第一个供应商
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onChange={loadProviders}
              onDelete={() => void handleDelete(provider.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
