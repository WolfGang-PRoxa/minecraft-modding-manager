import { screen, type BrowserWindow } from 'electron'
import type { WindowState } from '../shared/types'

/** Taille minimale de la fenêtre à la taille normale de l'interface. */
export const MIN_WINDOW_SIZE = { width: 960, height: 640 }

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
