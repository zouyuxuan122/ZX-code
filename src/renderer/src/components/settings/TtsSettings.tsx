import { useState, useEffect } from 'react'
import { Volume2, Settings2, KeyRound, Copy, Upload, Loader2, FileAudio } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Toggle } from '@/components/ui/Toggle'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'
import { cn } from '@/utils/cn'
import type { TtsVoice } from '@shared/types/tts'
import { ipc } from '@/services/ipc'

/**
 * TTS 语音合成设置组件
 *
 * 配置项：
 * - 启用/禁用 TTS
 * - TTS 引擎（edge 免费本地 / openai 云端 / custom 自定义端点）
 * - 朗读模式（auto 自动朗读 / manual 手动点击）
 * - 音色选择
 * - 语速、音量
 * - API Key（openai/custom）
 * - Base URL（custom）
 * - 声音克隆 voice ID（openai/custom）
 */
export function TtsSettings() {
  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  const [enabled, setEnabled] = useState(getSetting<boolean>('tts.enabled', false))
  const [provider, setProvider] = useState(getSetting<string>('tts.provider', 'edge'))
  const [mode, setMode] = useState(getSetting<string>('tts.mode', 'manual'))
  const [voice, setVoice] = useState(getSetting<string>('tts.voice', 'zh-CN-XiaoxiaoNeural'))
  const [rate, setRate] = useState(getSetting<number>('tts.rate', 1))
  const [volume, setVolume] = useState(getSetting<number>('tts.volume', 1))
  const [apiKey, setApiKey] = useState(getSetting<string>('tts.apiKey', ''))
  const [baseUrl, setBaseUrl] = useState(getSetting<string>('tts.baseUrl', ''))
  const [cloneVoiceId, setCloneVoiceId] = useState(getSetting<string>('tts.cloneVoiceId', ''))
  const [voices, setVoices] = useState<TtsVoice[]>([])
  // 语音克隆 UI 状态
  const [cloneAudioPath, setCloneAudioPath] = useState('')
  const [cloneReferenceText, setCloneReferenceText] = useState('')
  const [isCloning, setIsCloning] = useState(false)

  // 加载音色列表
  useEffect(() => {
    if (!enabled) return
    ipc.tts.listVoices().then((res) => {
      if (res.ok && res.voices) {
        setVoices(res.voices)
      }
    }).catch(() => {
      // 忽略：音色列表加载失败不阻塞设置
    })
  }, [enabled, provider])

  /** 保存设置（带成功提示） */
  const save = async (key: string, value: unknown) => {
    try {
      await updateSetting(key, value, 'tts')
      toast.success('设置已保存')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  /** 滑块静默保存（避免拖动时 toast 刷屏） */
  const saveSilent = async (key: string, value: unknown) => {
    try {
      await updateSetting(key, value, 'tts')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  const isCloudProvider = provider === 'openai' || provider === 'custom'

  /** 选择音频文件 */
  const handleSelectAudio = async () => {
    const res = await ipc.tts.selectAudio()
    if (res.ok && res.filePath) {
      setCloneAudioPath(res.filePath)
      toast.success('已选择音频文件')
    }
  }

  /** 执行语音克隆 */
  const handleCloneVoice = async () => {
    if (!cloneAudioPath) {
      toast.error('请先选择音频文件')
      return
    }
    if (!cloneReferenceText.trim()) {
      toast.error('请输入音频对应的参考文字')
      return
    }
    setIsCloning(true)
    try {
      const res = await ipc.tts.cloneVoice(cloneAudioPath, cloneReferenceText.trim())
      if (res.ok && res.voiceId) {
        setCloneVoiceId(res.voiceId)
        await updateSetting('tts.cloneVoiceId', res.voiceId, 'tts')
        toast.success(`克隆成功，voice ID: ${res.voiceId}`)
      } else {
        toast.error('克隆失败', res.error || '未知错误')
      }
    } catch (err) {
      toast.error('克隆失败', (err as Error).message)
    } finally {
      setIsCloning(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center gap-2 px-1">
        <Volume2 className="h-5 w-5 text-text-secondary" />
        <h2 className="text-base font-semibold text-text-primary">语音合成</h2>
      </div>

      {/* 启用开关 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">启用 TTS</span>
          </div>
          <Toggle
            checked={enabled}
            aria-label="启用 TTS"
            onChange={(v) => {
              setEnabled(v)
              void save('tts.enabled', v)
            }}
          />
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          开启后，AI 回复的文本可以转换为语音播放
        </p>
      </section>

      {/* TTS 引擎 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">TTS 引擎</span>
        </div>
        <Select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value)
            void save('tts.provider', e.target.value)
          }}
          disabled={!enabled}
        >
          <option value="edge">Edge TTS（免费，无需 API Key）</option>
          <option value="openai">OpenAI TTS（云端，支持声音克隆）</option>
          <option value="custom">自定义端点（OpenAI 兼容）</option>
        </Select>
        <p className="mt-2 text-xs text-text-tertiary">
          {provider === 'edge' && '使用微软 Edge 浏览器内置的免费 TTS 服务，支持多语言 Neural 音色'}
          {provider === 'openai' && '使用 OpenAI TTS API，需要 API Key，支持声音克隆'}
          {provider === 'custom' && '连接 OpenAI 兼容的第三方 TTS 端点（如 Azure OpenAI、鱼云等）'}
        </p>
      </section>

      {/* 朗读模式 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">朗读模式</span>
        </div>
        <Select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value)
            void save('tts.mode', e.target.value)
          }}
          disabled={!enabled}
        >
          <option value="manual">手动朗读（点击语音按钮触发）</option>
          <option value="auto">自动朗读（AI 回复完成后自动播放）</option>
        </Select>
      </section>

      {/* 音色选择 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">音色</span>
        </div>
        {voices.length > 0 ? (
          <Select
            value={voice}
            onChange={(e) => {
              setVoice(e.target.value)
              void save('tts.voice', e.target.value)
            }}
            disabled={!enabled}
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.language})
              </option>
            ))}
          </Select>
        ) : (
          <Input
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            onBlur={() => void save('tts.voice', voice)}
            disabled={!enabled}
            placeholder="输入音色 ID"
          />
        )}
      </section>

      {/* 语速 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">语速</span>
          <span className="text-xs text-text-tertiary">{rate.toFixed(1)}x</span>
        </div>
        <Slider
          value={rate}
          min={0.5}
          max={2}
          step={0.1}
          onChange={(v) => {
            setRate(v)
            void saveSilent('tts.rate', v)
          }}
          disabled={!enabled}
        />
      </section>

      {/* 音量 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">音量</span>
          <span className="text-xs text-text-tertiary">{Math.round(volume * 100)}%</span>
        </div>
        <Slider
          value={volume}
          min={0}
          max={1}
          step={0.1}
          onChange={(v) => {
            setVolume(v)
            void saveSilent('tts.volume', v)
          }}
          disabled={!enabled}
        />
      </section>

      {/* 云端引擎配置（openai/custom） */}
      {isCloudProvider && (
        <>
          <section className="surface-3d rounded-xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-text-secondary" />
              <span className="text-sm font-medium text-text-primary">API Key</span>
            </div>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => void save('tts.apiKey', apiKey)}
              disabled={!enabled}
              placeholder="sk-..."
            />
          </section>

          {provider === 'custom' && (
            <section className="surface-3d rounded-xl p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">Base URL</span>
              </div>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={() => void save('tts.baseUrl', baseUrl)}
                disabled={!enabled}
                placeholder="https://api.example.com"
              />
            </section>
          )}

          {/* 声音克隆 */}
          <section className="surface-3d rounded-xl p-4">
            <div className="mb-3 flex items-center gap-2">
              <Copy className="h-4 w-4 text-text-secondary" />
              <span className="text-sm font-medium text-text-primary">声音克隆</span>
            </div>

            {/* 当前克隆 voice ID */}
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-tertiary">当前克隆 Voice ID</label>
              <Input
                value={cloneVoiceId}
                onChange={(e) => setCloneVoiceId(e.target.value)}
                onBlur={() => void save('tts.cloneVoiceId', cloneVoiceId)}
                disabled={!enabled}
                placeholder="留空使用标准音色"
              />
            </div>

            {/* 分隔线 */}
            <div className="my-3 border-t border-border-subtle" />
            <p className="mb-3 text-xs text-text-tertiary">
              上传一段音频并输入对应的文字，通过云端 API 创建克隆音色
            </p>

            {/* 音频文件选择 */}
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-tertiary">音频文件</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAudio}
                  disabled={!enabled}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-tertiary px-3 py-1.5 text-xs transition-smooth-fast',
                    'hover:border-accent-blue/50 hover:bg-accent-blue/10 hover:text-accent-blue',
                    !enabled && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <Upload className="h-3.5 w-3.5" />
                  选择音频
                </button>
                {cloneAudioPath && (
                  <span className="flex items-center gap-1 text-xs text-text-secondary">
                    <FileAudio className="h-3.5 w-3.5" />
                    {cloneAudioPath.replace(/\\/g, '/').split('/').pop()}
                  </span>
                )}
              </div>
            </div>

            {/* 参考文字 */}
            <div className="mb-3">
              <label className="mb-1.5 block text-xs text-text-tertiary">参考文字（音频对应的文字内容）</label>
              <textarea
                value={cloneReferenceText}
                onChange={(e) => setCloneReferenceText(e.target.value)}
                disabled={!enabled}
                placeholder="输入音频中说话内容的文字..."
                rows={3}
                className={cn(
                  'w-full resize-none rounded-lg border border-border-default bg-bg-tertiary/60 px-3 py-2 text-sm text-text-primary shadow-inset transition-smooth-fast',
                  'focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/30 focus:outline-none',
                  'disabled:opacity-40',
                )}
              />
            </div>

            {/* 克隆按钮 */}
            <button
              type="button"
              onClick={handleCloneVoice}
              disabled={!enabled || isCloning || !cloneAudioPath || !cloneReferenceText.trim()}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-smooth-fast',
                isCloning
                  ? 'border-border-default bg-bg-tertiary text-text-tertiary'
                  : 'border-accent-blue bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25',
                (!enabled || !cloneAudioPath || !cloneReferenceText.trim()) && 'cursor-not-allowed opacity-40',
              )}
            >
              {isCloning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在克隆...
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  开始克隆
                </>
              )}
            </button>
            {cloneVoiceId && (
              <p className="mt-2 text-xs text-accent-green">
                当前使用克隆音色: {cloneVoiceId}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
