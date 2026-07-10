import { useState } from 'react'
import { Clock, Repeat, Activity, Fingerprint, Maximize2, Scissors, Zap, History } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { Slider } from '@/components/ui/Slider'
import { Toggle } from '@/components/ui/Toggle'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'

/**
 * API 设置：超时、重试、流式响应、User-Agent、上下文长度、对话压缩
 */
export function ApiSettings() {
  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  const [timeout, setTimeoutValue] = useState(getSetting<number>('api.timeout', 60))
  const [maxRetries, setMaxRetries] = useState(getSetting<number>('api.maxRetries', 2))
  const [stream, setStream] = useState(getSetting<boolean>('api.stream', true))
  const [userAgent, setUserAgent] = useState(getSetting<string>('api.userAgent', ''))
  const [maxContextLength, setMaxContextLength] = useState(
    getSetting<number>('api.maxContextLength', 32000),
  )
  const [compressThreshold, setCompressThreshold] = useState(
    getSetting<number>('api.compressThreshold', 80),
  )
  const [autoCompress, setAutoCompress] = useState(
    getSetting<boolean>('api.autoCompress', true),
  )
  const [compressKeepRecent, setCompressKeepRecent] = useState(
    getSetting<number>('api.compressKeepRecent', 6),
  )

  /** 滑块即时保存（避免拖动时 toast 刷屏，仅出错提示） */
  const saveSilent = async (key: string, value: unknown) => {
    try {
      await updateSetting(key, value, 'api')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  /** 离散设置保存（带成功反馈） */
  const save = async (key: string, value: unknown) => {
    try {
      await updateSetting(key, value, 'api')
      toast.success('设置已保存')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      {/* 默认超时 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">默认超时</h3>
          <span className="ml-auto text-xs text-text-tertiary">单位：秒</span>
        </div>
        <Slider
          value={timeout}
          min={10}
          max={120}
          step={1}
          onChange={(v) => {
            setTimeoutValue(v)
            void saveSilent('api.timeout', v)
          }}
        />
      </section>

      {/* 最大重试次数 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Repeat className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">最大重试次数</h3>
        </div>
        <Slider
          value={maxRetries}
          min={0}
          max={5}
          step={1}
          onChange={(v) => {
            setMaxRetries(v)
            void saveSilent('api.maxRetries', v)
          }}
        />
      </section>

      {/* 流式响应 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">流式响应</h3>
          <div className="ml-auto">
            <Toggle
              checked={stream}
              onChange={(next) => {
                setStream(next)
                void save('api.stream', next)
              }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          开启后模型回复将以流式方式逐步输出，响应更即时。
        </p>
      </section>

      {/* 自定义 User-Agent */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">自定义 User-Agent</h3>
        </div>
        <Input
          value={userAgent}
          onChange={(e) => setUserAgent(e.target.value)}
          onBlur={() => void save('api.userAgent', userAgent)}
          placeholder="留空使用默认 User-Agent"
        />
      </section>

      {/* 上下文长度限制 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Maximize2 className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">上下文长度限制</h3>
          <span className="ml-auto text-xs text-text-tertiary">单位：token</span>
        </div>
        <Slider
          value={maxContextLength}
          min={1000}
          max={1000000}
          step={1000}
          onChange={(v) => {
            setMaxContextLength(v)
            void saveSilent('api.maxContextLength', v)
          }}
        />
        <p className="mt-2 text-xs text-text-tertiary">
          全局默认上下文长度限制。如需为单个模型设置不同长度，请在「服务商设置」中编辑对应模型的上下文长度。模型独立设置优先于此全局值。
        </p>
      </section>

      {/* 自动压缩 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">自动压缩对话</h3>
          <div className="ml-auto">
            <Toggle
              checked={autoCompress}
              onChange={(next) => {
                setAutoCompress(next)
                void save('api.autoCompress', next)
              }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          开启后，发送消息前若上下文使用率超过阈值，将自动把旧消息压缩为摘要，释放上下文空间。
        </p>
      </section>

      {/* 压缩阈值 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Scissors className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">压缩阈值</h3>
          <span className="ml-auto text-xs text-text-tertiary">单位：%</span>
        </div>
        <Slider
          value={compressThreshold}
          min={30}
          max={95}
          step={5}
          onChange={(v) => {
            setCompressThreshold(v)
            void saveSilent('api.compressThreshold', v)
          }}
        />
        <p className="mt-2 text-xs text-text-tertiary">
          当上下文使用率达到此百分比时触发自动压缩。
        </p>
      </section>

      {/* 压缩保留条数 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">压缩保留条数</h3>
          <span className="ml-auto text-xs text-text-tertiary">单位：条</span>
        </div>
        <Slider
          value={compressKeepRecent}
          min={2}
          max={20}
          step={1}
          onChange={(v) => {
            setCompressKeepRecent(v)
            void saveSilent('api.compressKeepRecent', v)
          }}
        />
        <p className="mt-2 text-xs text-text-tertiary">
          压缩时保留最近的 N 条消息，更早的消息会被汇总为一份摘要。
        </p>
      </section>
    </div>
  )
}
