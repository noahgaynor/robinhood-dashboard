import { useState, useEffect, useCallback } from 'react'

interface Toast {
  id: number
  message: string
  type: 'info' | 'warn' | 'error' | 'success'
  action?: { label: string; onClick: () => void }
}

let toastId = 0
type ToastListener = (toast: Toast) => void
const listeners: ToastListener[] = []

export function showToast(message: string, type: Toast['type'] = 'info', action?: Toast['action']) {
  const toast: Toast = { id: ++toastId, message, type, action }
  listeners.forEach((l) => l(toast))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  useEffect(() => {
    const listener: ToastListener = (toast) => {
      setToasts((t) => [...t, toast])
      setTimeout(() => dismiss(toast.id), 6000)
    }
    listeners.push(listener)
    return () => { listeners.splice(listeners.indexOf(listener), 1) }
  }, [dismiss])

  if (toasts.length === 0) return null

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 400,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <span style={{
            color: t.type === 'warn' ? 'var(--warn)'
              : t.type === 'error' ? 'var(--neg)'
              : t.type === 'success' ? 'var(--pos)'
              : 'var(--text)',
            fontSize: 13,
            flex: 1,
            lineHeight: 1.4,
          }}>
            {t.message}
          </span>
          {t.action && (
            <button
              onClick={() => { t.action!.onClick(); dismiss(t.id) }}
              style={{
                background: 'none', border: 'none', color: 'var(--accent)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: '2px 0', whiteSpace: 'nowrap',
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(t.id)}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
