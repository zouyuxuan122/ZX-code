import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useToastStore, type ToastType, type ToastItem } from '@/stores/toastStore'
import { cn } from '@/utils/cn'

const iconMap: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const colorMap: Record<ToastType, string> = {
  success: 'text-accent-green',
  error: 'text-accent-red',
  info: 'text-accent-blue',
  warning: 'text-accent-orange',
}

function ToastCard({ item }: { item: ToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast)
  const Icon = iconMap[item.type]

  useEffect(() => {
    const timer = setTimeout(() => removeToast(item.id), item.duration ?? 3500)
    return () => clearTimeout(timer)
  }, [item.id, item.duration, removeToast])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.9 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="surface-3d pointer-events-auto flex w-80 items-start gap-3 rounded-md p-3"
    >
      <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', colorMap[item.type])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{item.title}</p>
        {item.message && <p className="mt-0.5 text-xs text-text-secondary">{item.message}</p>}
      </div>
      <button
        onClick={() => removeToast(item.id)}
        className="text-text-tertiary transition-smooth-fast hover:text-text-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed right-4 top-12 z-50 flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}
