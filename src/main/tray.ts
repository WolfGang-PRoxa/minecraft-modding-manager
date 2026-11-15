// Icône de la zone de notification (en bas à droite de la barre des tâches) : fermer la fenêtre ne quitte pas
// l'application, qui reste prête à se rouvrir aussitôt. On la quitte vraiment depuis le menu de cette icône.
import { app, Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { join } from 'node:path'
import { getSettings } from '../core/settings'
import { APP_NAME } from '../shared/config'

let tray: Tray | null = null

/**
 * Logo de l'application (build/icon.png, embarqué dans le paquet), en une image par échelle d'affichage : 16 px à
 * 100 %, 20 px à 125 %, 24 px à 150 %, 32 px à 200 %… Windows prend celle de l'écran. Pas `app.getFileIcon` sur
 * l'exécutable : ses icônes y sont rangées en PNG et Electron n'en tire que l'icône générique de Windows (constaté le
 * 2026-11-15 sur la 2.4.0), méconnaissable dans le menu des icônes cachées.
 */
function trayImage(): NativeImage {
  const logo = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
  if (logo.isEmpty()) throw new Error('logo introuvable (build/icon.png)')
  const image = nativeImage.createEmpty()
  for (const scaleFactor of [1, 1.25, 1.5, 2, 2.5, 3]) {
    const size = Math.round(16 * scaleFactor)
    const buffer = logo.resize({ width: size, height: size, quality: 'best' }).toPNG()
    image.addRepresentation({ scaleFactor, width: size, height: size, buffer })
  }
  return image
}

export interface TrayActions {
  /** Montre la fenêtre, sur la Bibliothèque ou le Studio (null : la vue en cours). */
  open(view: 'library' | 'studio' | null): void
  /** Quitte vraiment l'application. */
  quit(): void
}

export async function createTray(actions: TrayActions): Promise<void> {
  if (tray) return
  tray = new Tray(trayImage())
  tray.setToolTip(APP_NAME)
  tray.on('click', () => actions.open(null))
  tray.on('double-click', () => actions.open(null))
  // Menu construit à chaque ouverture : l'entrée du Studio suit le rôle choisi.
  tray.on('right-click', () => {
    void getSettings().then((settings) => {
      const menu = Menu.buildFromTemplate([
        { label: `Ouvrir ${APP_NAME}`, click: () => actions.open(null) },
        ...(settings.role === 'publisher'
          ? [
              { label: 'Ouvrir la Bibliothèque', click: () => actions.open('library') },
              { label: 'Ouvrir le Studio', click: () => actions.open('studio') }
            ]
          : []),
        { type: 'separator' },
        { label: `Quitter ${APP_NAME}`, click: () => actions.quit() }
      ])
      tray?.popUpContextMenu(menu)
    })
  })
}

/** Bulle affichée la première fois que la fenêtre se ferme : l'application tourne encore. */
export function announceBackground(): void {
  tray?.displayBalloon({
    title: `${APP_NAME} reste ouvert en arrière-plan`,
    content: 'Il se rouvre aussitôt depuis cette icône. Pour le quitter : clic droit sur l’icône, puis Quitter.',
    iconType: 'info',
    respectQuietTime: true
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
