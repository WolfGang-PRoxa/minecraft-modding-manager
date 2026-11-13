// Taille et position de la fenêtre à son ouverture (Paramètres → Fenêtre à l'ouverture), comme dans CV Studio et
// Universal Learn Academy : agrandie sur l'écran principal (par défaut), ou à un emplacement choisi sur un plan des
// écrans. Lu au lancement et à chaque réouverture depuis l'arrière-plan.

export interface WindowRect {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowPlacement {
  mode: 'maximized' | 'custom'
  /** Emplacement personnalisé, en pixels indépendants de la résolution (DIP), gardé même en mode agrandi. */
  bounds: WindowRect
}

/** Un écran, pour le plan des paramètres. */
export interface DisplayInfo {
  index: number
  primary: boolean
  bounds: WindowRect
  workArea: WindowRect
}

/** Taille minimale de la fenêtre à la taille normale de l'interface. */
export const MIN_WINDOW_SIZE = { width: 960, height: 640 }

export const DEFAULT_WINDOW_PLACEMENT: WindowPlacement = {
  mode: 'maximized',
  bounds: { x: 120, y: 80, width: 1440, height: 900 }
}

const isRect = (value: unknown): value is WindowRect =>
  !!value &&
  typeof value === 'object' &&
  (['x', 'y', 'width', 'height'] as const).every((key) => Number.isFinite((value as Record<string, unknown>)[key]))

/** Emplacement arrondi, jamais plus petit que la taille minimale. */
export function roundRect(rect: WindowRect): WindowRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(MIN_WINDOW_SIZE.width, Math.round(rect.width)),
    height: Math.max(MIN_WINDOW_SIZE.height, Math.round(rect.height))
  }
}

export function normalizeWindowPlacement(value: unknown): WindowPlacement {
  const stored = (value && typeof value === 'object' ? value : {}) as Partial<WindowPlacement>
  return {
    mode: stored.mode === 'custom' ? 'custom' : 'maximized',
    bounds: isRect(stored.bounds) ? roundRect(stored.bounds) : { ...DEFAULT_WINDOW_PLACEMENT.bounds }
  }
}

function intersectionArea(a: WindowRect, b: WindowRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

/**
 * L'emplacement personnalisé, s'il reste utilisable : au moins 30 % de la fenêtre visible sur les écrans (un écran a
 * pu être débranché). Sinon null : la fenêtre s'ouvre agrandie.
 */
export function usableBounds(placement: WindowPlacement, workAreas: WindowRect[]): WindowRect | null {
  if (placement.mode !== 'custom') return null
  const rect = roundRect(placement.bounds)
  const visible = workAreas.reduce((sum, area) => sum + intersectionArea(rect, area), 0)
  return visible >= rect.width * rect.height * 0.3 ? rect : null
}
