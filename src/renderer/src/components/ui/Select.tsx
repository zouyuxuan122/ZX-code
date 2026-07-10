import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative inline-flex w-full items-center">
        <select
          ref={ref}
          className={cn(
            'dark-options h-8 w-full appearance-none rounded-lg border border-border-default bg-bg-tertiary/60 pl-3 pr-8 text-sm text-text-primary shadow-inset transition-smooth-fast focus-visible:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/30 disabled:opacity-50 no-drag cursor-pointer',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-text-tertiary" />
      </div>
    )
  },
)
Select.displayName = 'Select'
