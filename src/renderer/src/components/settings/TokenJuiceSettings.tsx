import { useState } from 'react'
import { Zap, Scissors } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'

/**
 * TokenJuice 工具输出压缩设置
 *
 * 在工具结果注入到模型上下文前压缩,去除 ANSI 码、重复空行,
 * 超长输出按行保留头尾,节省 token。
 */
export function TokenJuiceSettings() {
  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  const [enabled, setEnabled] = useState(getSetting<boolean>('tokenJuice.enabled', true))
  const [maxToolOutputChars, setMaxToolOutputChars] = useState(
    getSetting<number>('tokenJuice.maxToolOutputChars', 8000),
  )

  /** 离散设置保存(带成功反馈) */
  const save = async (key: string, value: unknown) => {
    try {
      await updateSetting(key, value, 'model')
      toast.success('设置已保存')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  /** 数字输入即时保存(失焦时校验并保存) */
  const saveMaxChars = async (raw: string) => {
    const value = parseInt(raw, 10)
    if (isNaN(value) || value < 1000 || value > 50000) {
      toast.error('保存失败', '字符上限需在 1,000 ~ 50,000 之间')
      setMaxToolOutputChars(getSetting<number>('tokenJuice.maxToolOutputChars', 8000))
      return
    }
    if (value !== maxToolOutputChars) {
      setMaxToolOutputChars(value)
      await save('tokenJuice.maxToolOutputChars', value)
    }
  }

  return (
    <div className="space-y-4">
      {/* 压缩开关 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">工具输出压缩 (TokenJuice)</h3>
          <div className="ml-auto">
            <Toggle
              checked={enabled}
              onChange={(next) => {
                setEnabled(next)
                void save('tokenJuice.enabled', next)
              }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          开启后,工具调用结果在注入到模型上下文前会被压缩:去除 ANSI 终端转义码、合并重复空行,超长输出保留头尾并省略中间部分,以节省 token。
        </p>
      </section>

      {/* 字符上限 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Scissors className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">单次工具输出字符上限</h3>
          <span className="ml-auto text-xs text-text-tertiary">单位:字符</span>
        </div>
        <Input
          type="number"
          value={maxToolOutputChars}
          min={1000}
          max={50000}
          step={500}
          onChange={(e) => setMaxToolOutputChars(parseInt(e.target.value, 10) || 0)}
          onBlur={(e) => void saveMaxChars(e.target.value)}
          disabled={!enabled}
        />
        <p className="mt-2 text-xs text-text-tertiary">
          超过此字符数的工具输出将被截断(保留头部和尾部,中间用省略标记替代)。范围 1,000 ~ 50,000。
        </p>
      </section>
    </div>
  )
}
