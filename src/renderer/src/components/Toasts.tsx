import { CircleCheck, CircleX, Info, X } from 'lucide-react'
import { useStore } from '../store'

export interface ToastItem {
  id: number
  kind: 'success' | 'error' | 'info'
  title: string
  message?: string
  action?: { label: string; run: () => void }
  /** Reste affichée jusqu'à ce qu'on la ferme (une action qu'on ne doit pas manquer). */
  sticky?: boolean
}

const STYLES = {
  success: { icon: CircleCheck, color: 'text-grass-400', ring: 'ring-grass-400/25' },
  error: { icon: CircleX, color: 'text-red-400', ring: 'ring-red-400/25' },
  info: { icon: Info, color: 'text-sky-300', ring: 'ring-sky-300/20' }
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return <ToastList toasts={toasts} dismiss={dismiss} />
}

export function ToastList({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed right-6 bottom-6 z-[60] flex w-[400px] max-w-[calc(100vw-3rem)] flex-col gap-3">
      {toasts.map((toast) => {
        const { icon: Icon, color, ring } = STYLES[toast.kind]
        return (
          <div
            key={toast.id}
            role="status"
            className={`animate-rise pointer-events-auto flex gap-3 rounded-2xl bg-ink-800/95 p-4 shadow-2xl ring-1 backdrop-blur-xl ${ring}`}
          >
            <Icon size={22} className={`mt-0.5 shrink-0 ${color}`} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-100">{toast.title}</p>
              {toast.message && <p className="mt-1 text-sm break-words text-ink-300 select-text">{toast.message}</p>}
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.run()
                    dismiss(toast.id)
                  }}
                  className="mt-2 text-sm font-semibold text-grass-300 hover:text-grass-400"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Fermer"
              className="-mt-1 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-tint/10 hover:text-ink-100"
            >
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
