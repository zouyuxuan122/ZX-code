import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastState {
  toasts: ToastItem[]
  addToast: (toast: Omit<ToastItem, 'id'>) => string
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    return id
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

// 便捷方法（非 React 组件中也可调用）
export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().addToast({ type: 'success', title, message }),
  error: (title: string, message?: string) => useToastStore.getState().addToast({ type: 'error', title, message }),
  info: (title: string, message?: string) => useToastStore.getState().addToast({ type: 'info', title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().addToast({ type: 'warning', title, message }),
}
