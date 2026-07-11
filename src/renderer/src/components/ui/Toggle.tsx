import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  'aria-label'?: string
}

export function Toggle({ checked, onChange, disabled, size = 'md', ...rest }: ToggleProps) {
  // md: w-10 h-5 knob h-4 w-4 translate 18
  // sm: w-8 h-4 knob h-3 w-3 translate 14
  const dims = size === 'sm'
    ? { w: 'w-8', h: 'h-4', knob: 'h-3 w-3', translate: 14 }
    : { w: 'w-10', h: 'h-5', knob: 'h-4 w-4', translate: 18 }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      {...rest}
      className={cn(
        'relative inline-flex items-center rounded-full border transition-smooth-fast',
        dims.w, dims.h,
        checked
          ? 'border-accent-blue bg-accent-blue shadow-sm'
          : 'border-border-default bg-bg-tertiary',
        disabled && 'cursor-not-allowed opacity-50',
        !disabled && !checked && 'hover:border-border-strong',
        !disabled && checked && 'hover:opacity-90',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={cn(
          'inline-block rounded-full shadow-sm',
          dims.knob,
          checked ? 'bg-white' : 'bg-text-tertiary',
        )}
        style={{ marginLeft: 2, transform: checked ? `translateX(${dims.translate}px)` : 'translateX(0)' }}
      />
    </button>
  )
}
