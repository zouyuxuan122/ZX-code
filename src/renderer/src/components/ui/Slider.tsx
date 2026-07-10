import { useState } from 'react'
import { cn } from '@/utils/cn'

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}

export function Slider({ value, min, max, step = 1, onChange, disabled, className }: SliderProps) {
  const [dragging, setDragging] = useState(false)
  const percent = ((value - min) / (max - min)) * 100

  return (
    <div className={cn('flex items-center gap-3', disabled && 'opacity-50', className)}>
      <div className="relative flex-1">
        {/* 轨道 */}
        <div className="h-1 rounded-full bg-bg-tertiary border border-border-default" />
        {/* 已选填充 */}
        <div
          className="absolute top-0 h-1 rounded-full bg-accent-blue shadow-glow"
          style={{ width: `${percent}%` }}
        />
        {/* 滑块手柄 */}
        <div
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent-blue bg-white shadow-md transition-transform',
            dragging ? 'scale-110' : 'hover:scale-105',
          )}
          style={{ left: `${percent}%` }}
        />
        {/* 透明 input 捕获交互 */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
          onTouchStart={() => setDragging(true)}
          onTouchEnd={() => setDragging(false)}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="w-12 text-right text-xs font-mono text-text-secondary tabular-nums">
        {value}
      </span>
    </div>
  )
}
