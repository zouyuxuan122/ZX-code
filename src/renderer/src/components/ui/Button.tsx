import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

type Variant = 'default' | 'primary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  default:
    'bg-white/5 text-text-primary border border-border-default hover:bg-white/10 hover:border-border-strong shadow-sm',
  primary: 'bg-accent-blue text-white border border-accent-blue/40 hover:bg-accent-blue-hover shadow-sm',
  ghost: 'text-text-secondary hover:bg-hover-surface hover:text-text-primary border border-transparent',
  danger: 'bg-accent-red text-white border border-accent-red/30 hover:bg-accent-red/90 shadow-sm',
  outline:
    'border border-border-default text-text-primary hover:bg-hover-surface hover:border-border-strong',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-lg',
  md: 'h-8 px-3 text-sm rounded-lg',
  lg: 'h-10 px-4 text-base rounded-xl',
  icon: 'h-8 w-8 rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 font-medium transition-smooth-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/30 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 no-drag',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
