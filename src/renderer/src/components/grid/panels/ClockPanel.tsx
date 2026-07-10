import { useState, useEffect } from 'react'

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function ClockPanel() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const month = now.getMonth() + 1
  const day = String(now.getDate()).padStart(2, '0')
  const weekday = WEEKDAYS[now.getDay()]

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 bg-bg-primary">
      <div data-testid="clock-time" className="text-4xl font-light tabular-nums text-text-primary">
        {hh}:{mm}
        <span className="ml-1 text-lg text-text-tertiary">{ss}</span>
      </div>
      <div data-testid="clock-date" className="text-xs text-text-secondary">
        {month}月{day}日 · {weekday}
      </div>
    </div>
  )
}
