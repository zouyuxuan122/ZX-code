import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'flex h-8 w-full rounded-lg border border-border-default bg-bg-tertiary/60 px-3 py-1 text-sm text-text-primary shadow-inset placeholder:text-text-tertiary transition-smooth-fast focus-visible:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/30 disabled:opacity-50 no-drag',
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'
