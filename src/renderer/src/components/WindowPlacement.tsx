// Paramètres → Fenêtre à l'ouverture : agrandie (par défaut) ou à un emplacement choisi sur un plan des écrans, comme
// dans CV Studio et Universal Learn Academy. Le cadre se déplace et se redimensionne à la souris (ou aux flèches) ; les
// valeurs se saisissent aussi. Appliqué au lancement et à chaque réouverture depuis l'arrière-plan.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { AppWindow } from 'lucide-react'
import { useStore } from '../store'
import { Button } from './Button'
import { MIN_WINDOW_SIZE, roundRect, type DisplayInfo, type WindowPlacement, type WindowRect } from '../../../shared/windowPlacement'

const HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
type Handle = (typeof HANDLES)[number]

const HANDLE_CLASS: Record<Handle, string> = {
  n: '-top-1.5 inset-x-2 h-2.5 cursor-ns-resize',
  s: '-bottom-1.5 inset-x-2 h-2.5 cursor-ns-resize',
  e: '-right-1.5 inset-y-2 w-2.5 cursor-ew-resize',
  w: '-left-1.5 inset-y-2 w-2.5 cursor-ew-resize',
  ne: '-top-2 -right-2 size-3.5 cursor-nesw-resize rounded-full bg-grass-400 ring-2 ring-white',
  sw: '-bottom-2 -left-2 size-3.5 cursor-nesw-resize rounded-full bg-grass-400 ring-2 ring-white',
  nw: '-top-2 -left-2 size-3.5 cursor-nwse-resize rounded-full bg-grass-400 ring-2 ring-white',
  se: '-bottom-2 -right-2 size-3.5 cursor-nwse-resize rounded-full bg-grass-400 ring-2 ring-white'
}

/** Étendue du bureau (tous les écrans), en pixels Windows. */
function deskOf(displays: DisplayInfo[]) {
  const left = Math.min(...displays.map((d) => d.bounds.x))
  const top = Math.min(...displays.map((d) => d.bounds.y))
  const right = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width))
  const bottom = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))
  return { left, top, width: right - left, height: bottom - top }
}

/** Le cadre reste sur le bureau, jamais plus petit que la fenêtre minimale. */
function clampRect(rect: WindowRect, desk: ReturnType<typeof deskOf>): WindowRect {
  const width = Math.min(Math.max(rect.width, MIN_WINDOW_SIZE.width), desk.width)
  const height = Math.min(Math.max(rect.height, MIN_WINDOW_SIZE.height), desk.height)
  const x = Math.min(Math.max(rect.x, desk.left), desk.left + desk.width - width)
  const y = Math.min(Math.max(rect.y, desk.top), desk.top + desk.height - height)
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

/** Plan des écrans à l'échelle, avec le cadre de la future fenêtre. */
function ScreenMap({ displays, rect, onChange, onCommit }: { displays: DisplayInfo[]; rect: WindowRect; onChange: (r: WindowRect) => void; onCommit: (r: WindowRect) => void }) {
  const desk = useMemo(() => deskOf(displays), [displays])
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(480)
  useEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth || 480))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(width / desk.width, 220 / desk.height)
  const px = (value: number) => `${value * scale}px`

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const dir = ((event.target as HTMLElement).dataset.dir ?? 'move') as Handle | 'move'
    const start = { x: event.clientX, y: event.clientY, rect }
    let last = rect
    target.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - start.x) / scale
      const dy = (e.clientY - start.y) / scale
      const r = { ...start.rect }
      if (dir === 'move') {
        r.x += dx
        r.y += dy
      } else {
        if (dir.includes('e')) r.width = start.rect.width + dx
        if (dir.includes('s')) r.height = start.rect.height + dy
        if (dir.includes('w')) {
          const w = Math.max(MIN_WINDOW_SIZE.width, start.rect.width - dx)
          r.x = start.rect.x + start.rect.width - w
          r.width = w
        }
        if (dir.includes('n')) {
          const h = Math.max(MIN_WINDOW_SIZE.height, start.rect.height - dy)
          r.y = start.rect.y + start.rect.height - h
          r.height = h
        }
      }
      last = clampRect(r, desk)
      onChange(last)
    }
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      onCommit(last)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  // Flèches : déplacer (Maj : pas de 50 px) ; Alt + flèches : redimensionner.
  function onKey(event: KeyboardEvent) {
    const keys: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const key = keys[event.key]
    if (!key) return
    event.preventDefault()
    const step = event.shiftKey ? 50 : 10
    const r = { ...rect }
    if (event.altKey) {
      r.width += key[0] * step
      r.height += key[1] * step
    } else {
      r.x += key[0] * step
      r.y += key[1] * step
    }
    const next = clampRect(r, desk)
    onChange(next)
    onCommit(next)
  }

  return (
    <div ref={host} className="flex w-full justify-center rounded-xl bg-ink-950/50 p-3.5 ring-1 ring-inset ring-tint/[0.06]">
      <div className="relative" style={{ width: px(desk.width), height: px(desk.height) }}>
        {displays.map((d) => (
          <div
            key={d.index}
            className={`absolute rounded-md border-2 bg-ink-800 ${d.primary ? 'border-ink-400/60' : 'border-ink-500/40'}`}
            style={{ left: px(d.bounds.x - desk.left), top: px(d.bounds.y - desk.top), width: px(d.bounds.width), height: px(d.bounds.height) }}
          >
            <span className="absolute bottom-1 left-2 text-[10px] text-ink-400">
              Écran {d.index}
              {d.primary ? ' (principal)' : ''} · {d.bounds.width}×{d.bounds.height}
            </span>
          </div>
        ))}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Fenêtre de l’application : flèches pour la déplacer, Alt et flèches pour la redimensionner"
          aria-valuetext={`${rect.width} × ${rect.height} en ${rect.x}, ${rect.y}`}
          onPointerDown={startDrag}
          onKeyDown={onKey}
          className="absolute cursor-move rounded border-2 border-grass-400 bg-grass-400/20 shadow-lg outline-none focus-visible:bg-grass-400/30"
          style={{ left: px(rect.x - desk.left), top: px(rect.y - desk.top), width: px(rect.width), height: px(rect.height) }}
        >
          <div className="pointer-events-none flex h-2.5 items-center gap-0.5 bg-grass-400/60 px-1">
            <span className="size-1 rounded-full bg-white/80" />
            <span className="size-1 rounded-full bg-white/80" />
            <span className="size-1 rounded-full bg-white/80" />
          </div>
          <div className="pointer-events-none absolute inset-0 top-2.5 grid place-items-center text-[11px] font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
            {rect.width} × {rect.height}
          </div>
          {HANDLES.map((dir) => (
            <span key={dir} data-dir={dir} className={`absolute z-10 ${HANDLE_CLASS[dir]}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setText(String(value))
  }, [value, editing])
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs text-ink-400">{label}</span>
      <span className="flex items-center gap-1.5 rounded-lg bg-ink-950/60 px-2.5 py-1.5 ring-1 ring-inset ring-tint/[0.08] focus-within:ring-grass-400/50">
        <input
          type="number"
          step={1}
          value={text}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(e) => {
            setText(e.target.value)
            const parsed = Number.parseInt(e.target.value, 10)
            if (Number.isFinite(parsed)) onChange(parsed)
          }}
          className="w-full min-w-0 bg-transparent text-sm text-ink-100 tabular-nums outline-none"
        />
        <span className="text-xs text-ink-500">px</span>
      </span>
    </label>
  )
}

export function WindowPlacementSection() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const pushToast = useStore((s) => s.pushToast)
  const [displays, setDisplays] = useState<DisplayInfo[] | null>(null)
  const placement: WindowPlacement | null = settings?.window ?? null
  const [rect, setRect] = useState<WindowRect | null>(placement?.bounds ?? null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const custom = placement?.mode === 'custom'

  useEffect(() => {
    if (custom && !displays) void window.api.getDisplays().then(setDisplays)
  }, [custom, displays])
  useEffect(() => {
    if (placement && !saveTimer.current) setRect(placement.bounds)
  }, [placement])
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  if (!placement || !rect) return null
  const desk = displays?.length ? deskOf(displays) : null

  /** Enregistré un quart de seconde après le dernier changement. */
  function save(bounds: WindowRect) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      void updateSettings({ window: { mode: 'custom', bounds } })
    }, 250)
  }

  function setField(key: keyof WindowRect, value: number) {
    const next = desk ? clampRect({ ...rect!, [key]: value }, desk) : roundRect({ ...rect!, [key]: value })
    setRect(next)
    save(next)
  }

  async function takeCurrent() {
    const bounds = await window.api.getWindowBounds()
    if (!bounds) return
    const next = desk ? clampRect(bounds, desk) : roundRect(bounds)
    setRect(next)
    await updateSettings({ window: { mode: 'custom', bounds: next } })
    pushToast({ kind: 'success', title: 'Taille et position de la fenêtre actuelle enregistrées' })
  }

  const option = (mode: WindowPlacement['mode'], label: string, hint: string) => (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 ring-1 ring-inset ${placement.mode === mode ? 'bg-grass-400/10 ring-grass-400/40' : 'ring-tint/[0.06] hover:bg-tint/[0.04]'}`}
    >
      <input
        type="radio"
        name="window-mode"
        className="mt-1 accent-grass-400"
        checked={placement.mode === mode}
        onChange={() => void updateSettings({ window: { mode, bounds: rect } })}
      />
      <span>
        <span className="block text-sm text-ink-100">{label}</span>
        <span className="block text-xs text-ink-400">{hint}</span>
      </span>
    </label>
  )

  return (
    <div>
      <p className="mb-3 text-xs text-ink-400">
        Au lancement, et quand on la rouvre alors qu’elle tournait en arrière-plan.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {option('maximized', 'Grande fenêtre', 'Agrandie sur l’écran principal (par défaut).')}
        {option('custom', 'Taille et position choisies', 'Exactement à l’emplacement choisi ci-dessous.')}
      </div>
      {custom && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-ink-400">
            Déplacer le cadre vert pour choisir la position, tirer ses bords ou ses coins pour choisir la taille. En pixels
            Windows, mise à l’échelle comprise. Si l’emplacement n’est plus visible (écran débranché), la fenêtre s’ouvre en
            grand.
          </p>
          {displays ? (
            <ScreenMap
              displays={displays}
              rect={rect}
              onChange={setRect}
              onCommit={save}
            />
          ) : (
            <div className="h-40 animate-pulse rounded-xl bg-ink-950/50" />
          )}
          <div className="grid grid-cols-4 gap-2">
            <NumberField label="Largeur" value={rect.width} onChange={(v) => setField('width', v)} />
            <NumberField label="Hauteur" value={rect.height} onChange={(v) => setField('height', v)} />
            <NumberField label="Position X" value={rect.x} onChange={(v) => setField('x', v)} />
            <NumberField label="Position Y" value={rect.y} onChange={(v) => setField('y', v)} />
          </div>
          <Button size="sm" icon={AppWindow} onClick={() => void takeCurrent()}>
            Reprendre la fenêtre actuelle
          </Button>
        </div>
      )}
    </div>
  )
}
