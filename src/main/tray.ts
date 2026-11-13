// Icône de la zone de notification (en bas à droite de la barre des tâches) : fermer la fenêtre ne quitte pas
// l'application, qui reste prête à se rouvrir aussitôt. On la quitte vraiment depuis le menu de cette icône.
import { app, Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { join } from 'node:path'
import { getSettings } from '../core/settings'
import { APP_NAME } from '../shared/config'

let tray: Tray | null = null

/** Icône de l'exécutable une fois installée ; en développement (electron.exe), celle du dépôt. */
async function trayImage(): Promise<NativeImage> {
  if (app.isPackaged) {
    const icon = await app.getFileIcon(process.execPath, { size: 'normal' }).catch(() => null)
    if (icon && !icon.isEmpty()) return icon
  }
  const png = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
  return png.isEmpty() ? png : png.resize({ width: 32, height: 32 })
}

export interface TrayActions {
  /** Montre la fenêtre, sur la Bibliothèque ou le Studio (null : la vue en cours). */
  open(view: 'library' | 'studio' | null): void
  /** Quitte vraiment l'application. */
  quit(): void
}

export async function createTray(actions: TrayActions): Promise<void> {
  if (tray) return
  tray = new Tray(await trayImage())
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
