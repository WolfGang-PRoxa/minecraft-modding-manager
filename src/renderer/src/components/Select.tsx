// Menu déroulant aux couleurs de l'application, à la place du <select> natif (liste rectangulaire du système) : bouton
// arrondi, liste flottante arrondie avec la valeur choisie cochée, au clavier comme à la souris. La liste est rendue
// dans <body> pour ne jamais être coupée par une fenêtre de dialogue qui défile.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
}

const SIZES = {
  md: 'rounded-xl px-4 py-3 text-sm',
  sm: 'rounded-lg px-3 py-1.5 text-sm',
  xs: 'rounded-lg px-2 py-1 text-xs'
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  placeholder,
  disabled = false,
  size = 'md',
  className = ''
}: {
  value: T
  options: Array<SelectOption<T>>
  onChange: (value: T) => void
  /** Nom du menu pour les lecteurs d'écran. */
  label: string
  /** Texte montré quand la valeur ne correspond à aucune option. */
  placeholder?: string
  disabled?: boolean
  size?: keyof typeof SIZES
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number; above: boolean } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const selected = options.findIndex((o) => o.value === value)

  // Sous le bouton, ou au-dessus s'il manque de la place en bas de la fenêtre.
  useLayoutEffect(() => {
    if (!open || !button.current) return
    const rect = button.current.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 12
    const aboveSpace = rect.top - 12
    const above = below < 180 && aboveSpace > below
    setPosition({
      left: rect.left,
      top: above ? rect.top - 6 : rect.bottom + 6,
      width: Math.max(rect.width, 160),
      maxHeight: Math.min(288, above ? aboveSpace : below),
      above
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e.target instanceof Node && (button.current?.contains(e.target) || list.current?.contains(e.target))) return
      setOpen(false)
    }
    const closeNow = () => setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', closeNow)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', closeNow)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function show() {
    if (disabled || !options.length) return
    setActive(Math.max(selected, 0))
    setOpen(true)
  }

  function choose(index: number) {
    const option = options[index]
    setOpen(false)
    button.current?.focus()
    if (option && option.value !== value) onChange(option.value)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        show()
      }
      return
    }
    const moves: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: options.length - 1 }
    if (e.key in moves) {
      e.preventDefault()
      setActive(Math.min(Math.max(moves[e.key], 0), options.length - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      // Échap ferme le menu, pas la fenêtre de dialogue qui le contient.
      if (e.key === 'Escape') e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`flex min-w-0 items-center justify-between gap-2 bg-ink-950/60 text-left ring-1 ring-inset outline-none transition hover:bg-ink-950/80 disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? 'ring-grass-400/60' : 'ring-white/10 focus-visible:ring-grass-400/60'
        } ${SIZES[size]} ${className}`}
      >
        <span className={`truncate ${selected >= 0 ? 'text-ink-100' : 'text-ink-500'}`}>{selected >= 0 ? options[selected].label : placeholder}</span>
        <ChevronDown size={size === 'xs' ? 13 : 16} className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open &&
        position &&
        createPortal(
          <ul
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={{
              left: position.left,
              top: position.top,
              minWidth: position.width,
              maxHeight: position.maxHeight,
              transform: position.above ? 'translateY(-100%)' : undefined
            }}
            className="animate-fade-in fixed z-[100] max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-ink-800 p-1 shadow-2xl ring-1 ring-white/10"
          >
            {options.map((option, index) => {
              const isSelected = index === selected
              return (
                <li
                  key={String(option.value)}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(index)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    index === active ? 'bg-white/[0.07] text-ink-100' : 'text-ink-200'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <Check size={15} strokeWidth={3} className={`shrink-0 text-grass-400 ${isSelected ? '' : 'invisible'}`} />
                </li>
              )
            })}
          </ul>,
          document.body
        )}
    </>
  )
}
