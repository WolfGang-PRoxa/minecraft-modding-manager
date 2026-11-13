import { screen, type BrowserWindow } from 'electron'
import type { WindowState } from '../shared/types'
import { MIN_WINDOW_SIZE, usableBounds, type DisplayInfo, type WindowPlacement, type WindowRect } from '../shared/windowPlacement'

export { MIN_WINDOW_SIZE }

/** Les écrans, en pixels indépendants de la résolution (DIP), pour le plan des paramètres. */
export function describeDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((display, index) => ({
    index: index + 1,
    primary: display.id === primaryId,
    bounds: display.bounds,
    workArea: display.workArea
  }))
}

const customBounds = (placement: WindowPlacement): WindowRect | null =>
  usableBounds(placement, screen.getAllDisplays().map((display) => display.workArea))

/** Emplacement de la fenêtre à sa création, et si elle doit ensuite s'agrandir. */
export function initialBounds(placement: WindowPlacement): { bounds: WindowRect; maximize: boolean } {
  const custom = customBounds(placement)
  if (custom) return { bounds: custom, maximize: false }
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(1440, workArea.width)
  const height = Math.min(900, workArea.height)
  return {
    bounds: { x: workArea.x + Math.round((workArea.width - width) / 2), y: workArea.y + Math.round((workArea.height - height) / 2), width, height },
    maximize: true
  }
}

/**
 * Place la fenêtre selon le réglage, à son ouverture : agrandie sur l'écran principal, ou à l'emplacement
 * personnalisé (s'il est encore visible). Sort d'abord du plein écran et de la réduction.
 */
export function applyPlacement(win: BrowserWindow, placement: WindowPlacement): void {
  if (win.isDestroyed()) return
  if (win.isFullScreen()) win.setFullScreen(false)
  if (win.isMinimized()) win.restore()
  const custom = customBounds(placement)
  if (!custom) {
    // Agrandie sur l'écran principal : la fenêtre y est d'abord ramenée.
    if (win.isMaximized()) win.unmaximize()
    win.setBounds(initialBounds({ ...placement, mode: 'maximized' }).bounds)
    win.maximize()
    return
  }
  if (win.isMaximized()) win.unmaximize()
  win.setBounds(custom)
}

/**
 * Taille de l'interface (Paramètres → Apparence) : zoom de la page, et taille minimale agrandie d'autant pour que la
 * mise en page dispose toujours d'au moins 960 × 640 (sans dépasser l'écran).
 */
export function applyInterfaceScale(win: BrowserWindow, scale: number): void {
  if (win.isDestroyed()) return
  win.webContents.setZoomFactor(scale)
  const area = screen.getDisplayMatching(win.getBounds()).workAreaSize
  win.setMinimumSize(
    Math.min(Math.round(MIN_WINDOW_SIZE.width * scale), area.width),
    Math.min(Math.round(MIN_WINDOW_SIZE.height * scale), area.height)
  )
}

/** La fenêtre était agrandie avant le plein écran : elle le redevient en le quittant. */
let maximizedBeforeFullScreen = true

export function windowState(win: BrowserWindow): WindowState {
  if (win.isFullScreen()) return 'fullscreen'
  return win.isMaximized() ? 'maximized' : 'normal'
}

/** F11 : plein écran (barre des tâches masquée), puis retour à la taille d'avant. */
export function toggleFullScreen(win: BrowserWindow): void {
  if (win.isFullScreen()) {
    win.setFullScreen(false)
    if (maximizedBeforeFullScreen) win.maximize()
  } else {
    maximizedBeforeFullScreen = win.isMaximized()
    win.setFullScreen(true)
  }
}

/** Bouton de la barre de titre : agrandir ou revenir au niveau inférieur, et quitter le plein écran. */
export function toggleMaximize(win: BrowserWindow): void {
  if (win.isFullScreen()) toggleFullScreen(win)
  else if (win.isMaximized()) win.unmaximize()
  else win.maximize()
}

/** Prévient la fenêtre à chaque changement, pour l'icône et le libellé du bouton. */
export function watchWindowState(win: BrowserWindow): void {
  const notify = () => {
    if (!win.isDestroyed()) win.webContents.send('window:state', windowState(win))
  }
  win.on('maximize', notify)
  win.on('unmaximize', notify)
  win.on('enter-full-screen', notify)
  win.on('leave-full-screen', notify)
}
