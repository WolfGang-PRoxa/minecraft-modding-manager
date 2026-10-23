import { useEffect, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { IconButton } from '../components/Button'

interface ModalProps {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
  /** Faux pendant une opération qu'on ne peut pas abandonner en fermant la fenêtre. */
  closable?: boolean
}

export function Modal({ title, subtitle, onClose, children, footer, width = 'max-w-2xl', closable = true }: ModalProps) {
  useEffect(() => {
    if (!closable) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closable, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="animate-fade-in absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={closable ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-rise relative flex max-h-[calc(100vh-3rem)] w-full ${width} flex-col rounded-3xl bg-ink-850 shadow-2xl ring-1 ring-tint/10`}
      >
        <div className="flex items-start justify-between gap-4 px-8 pt-7 pb-5">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-ink-400">{subtitle}</div>}
          </div>
          {closable && <IconButton icon={X} label="Fermer" onClick={onClose} className="-mt-1 -mr-2" />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6">{children}</div>
        {footer && (
          <div className="flex items-center gap-3 rounded-b-3xl border-t border-tint/[0.06] bg-ink-900/40 px-8 py-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold tracking-widest text-ink-400 uppercase">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-xs leading-relaxed text-ink-400">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-xl bg-ink-950/60 px-4 py-3 text-sm text-ink-100 ring-1 ring-inset ring-tint/10 outline-none transition placeholder:text-ink-500 select-text focus:ring-grass-400/60'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} resize-none leading-relaxed ${props.className ?? ''}`} />
}

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={`animate-spin ${className}`} />
}

export function ProgressBar({ ratio, className = '' }: { ratio: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-ink-950/70 ring-1 ring-inset ring-tint/[0.06] ${className}`}>
      <div
        className="h-full rounded-full bg-linear-to-r from-grass-600 to-grass-400 transition-[width] duration-300 ease-out"
        style={{ width: `${Math.max(2, Math.min(1, ratio) * 100)}%` }}
      />
    </div>
  )
}
