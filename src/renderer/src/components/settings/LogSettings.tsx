import { useState } from 'react'
import { ListTree, FileText, Info } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { Select } from '@/components/ui/Select'
import { Toggle } from '@/components/ui/Toggle'
import { toast } from '@/stores/toastStore'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 日志级别选项 */
const LOG_LEVEL_OPTIONS: { value: LogLevel; label: string }[] = [
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
]

/**
 * 日志设置：日志级别、文件日志、日志说明
 */
export function LogSettings() {
  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  const [level, setLevel] = useState(getSetting<LogLevel>('log.level', 'info'))
  const [fileEnabled, setFileEnabled] = useState(
    getSetting<boolean>('log.fileEnabled', true),
  )

  /** 保存设置（带成功反馈） */
  const save = async (key: string, value: unknown) => {
    try {
      await updateSetting(key, value, 'log')
      toast.success('设置已保存')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      {/* 日志级别 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <ListTree className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">日志级别</h3>
        </div>
        <Select
          value={level}
          onChange={(e) => {
            const next = e.target.value as LogLevel
            setLevel(next)
            void save('log.level', next)
          }}
        >
          {LOG_LEVEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <p className="mt-2 text-xs text-text-tertiary">
          仅记录所选级别及更高级别的日志。
        </p>
      </section>

      {/* 文件日志 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">文件日志</h3>
          <div className="ml-auto">
            <Toggle
              checked={fileEnabled}
              onChange={(next) => {
                setFileEnabled(next)
                void save('log.fileEnabled', next)
              }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          开启后日志将同步写入本地文件，便于排查问题。
        </p>
      </section>

      {/* 日志说明 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Info className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">日志说明</h3>
        </div>
        <div className="space-y-2 text-xs leading-relaxed text-text-secondary">
          <p>
            日志记录范围包括：应用启动与退出、IPC 调用、模型请求与响应、工具调用、错误与异常等。
          </p>
          <p>
            保留策略：日志文件按日期分割保存，默认保留最近 7 天的日志，超出后自动清理旧文件。
          </p>
          <p>
            日志级别从低到高为 Debug → Info → Warn → Error，选择某级别后将过滤掉所有更低级别的日志。
          </p>
        </div>
      </section>
    </div>
  )
}
