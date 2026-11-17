'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'

type ToastTone = 'success' | 'error' | 'info'
type ToastItem = { id: string; message: string; tone: ToastTone }

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setItems((prev) => [...prev.slice(-3), { id, message, tone }])
      window.setTimeout(() => dismiss(id), 4500)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start justify-between gap-3 rounded-card border px-4 py-3 text-small shadow-float ${
              item.tone === 'error'
                ? 'border-danger/30 bg-danger-soft text-danger'
                : item.tone === 'info'
                  ? 'border-line bg-canvas text-ink'
                  : 'border-brand/30 bg-brand-soft text-brand'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <Icon
                name={item.tone === 'error' ? 'alert' : item.tone === 'info' ? 'info' : 'check'}
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="font-medium leading-snug">{item.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Đóng thông báo"
              className="rounded-sm p-1 opacity-70 hover:opacity-100"
            >
              <Icon name="close" className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
