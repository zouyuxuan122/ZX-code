import { useState, useEffect, useCallback, useRef } from 'react'
import { ipc } from '@/services/ipc'
import type { WeatherData } from '@shared/types/weather'
import { Cloud, Droplets, MapPin, RefreshCw, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/utils/cn'

export function WeatherPanel() {
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [city, setCity] = useState('北京')
  const [editing, setEditing] = useState(false)
  const [inputCity, setInputCity] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (useCity: string) => {
    setLoading(true)
    setError(false)
    try {
      const result = await ipc.weather.fetch(useCity)
      if (!result.ok) throw new Error(result.error)
      setData(result.data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始加载：从设置读取保存的城市
  useEffect(() => {
    void (async () => {
      const savedCity = (await ipc.settings.get('weather.city')) as string | null
      const useCity = savedCity || '北京'
      setCity(useCity)
      void load(useCity)
    })()
  }, [load])

  // 定时刷新（10 分钟）
  useEffect(() => {
    if (!city) return
    const timer = setInterval(() => void load(city), 10 * 60 * 1000)
    return () => clearInterval(timer)
  }, [city, load])

  const handleStartEdit = useCallback(() => {
    setInputCity(city)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [city])

  const handleSaveCity = useCallback(async () => {
    const trimmed = inputCity.trim()
    if (!trimmed) {
      setEditing(false)
      return
    }
    setCity(trimmed)
    setEditing(false)
    await ipc.settings.set('weather.city', trimmed, 'weather')
    void load(trimmed)
  }, [inputCity, load])

  const handleCancelEdit = useCallback(() => {
    setEditing(false)
  }, [])

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 flex-shrink-0 items-center justify-between border-b border-border-default/30 px-2.5">
        <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
          <Cloud className="h-3 w-3" /> 天气
        </span>
        <button onClick={() => void load(city)} className="text-text-tertiary hover:text-text-secondary">
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </button>
      </div>
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
          <div className="text-[11px] text-state-error">加载失败</div>
          <button
            onClick={() => void load(city)}
            className="text-[10px] text-text-tertiary underline hover:text-text-secondary"
          >
            重试
          </button>
        </div>
      ) : !data ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-text-tertiary">加载中...</div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <div data-testid="weather-temp" className="text-4xl font-light text-text-primary">{data.temp}°</div>
          <div data-testid="weather-desc" className="text-sm text-text-secondary">{data.desc}</div>
          {/* 城市显示/编辑 */}
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                value={inputCity}
                onChange={(e) => setInputCity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveCity()
                  if (e.key === 'Escape') handleCancelEdit()
                }}
                placeholder="输入城市名"
                className="w-24 rounded border border-border-default bg-bg-secondary px-1.5 py-0.5 text-[11px] text-text-primary outline-none focus:border-accent-blue"
              />
              <button onClick={() => void handleSaveCity()} className="text-state-success hover:opacity-80">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={handleCancelEdit} className="text-text-tertiary hover:text-state-error">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              data-testid="weather-city"
              onClick={handleStartEdit}
              className="flex items-center gap-1 text-[11px] text-text-tertiary transition-colors hover:text-text-secondary"
              title="点击修改城市"
            >
              <MapPin className="h-3 w-3" /> {data.city}
              <Pencil className="h-2.5 w-2.5 opacity-50" />
            </button>
          )}
          <div data-testid="weather-humidity" className="flex items-center gap-1 text-[11px] text-text-tertiary">
            <Droplets className="h-3 w-3" /> {data.humidity}%
          </div>
        </div>
      )}
    </div>
  )
}
