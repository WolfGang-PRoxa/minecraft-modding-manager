import { app, dialog, nativeImage, shell, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { APP_NAME, APP_USER_MODEL_ID } from '../shared/config'
import type { ShortcutLocation, ShortcutResult, ShortcutStatus } from '../shared/types'

export interface ShortcutSpec {
  /** Nom du fichier .lnk, sans extension. */
  name: string
  description: string
  /** Arguments passés à l'application. */
  args: string[]
  appUserModelId: string
}

/**
 * Identifiant de l'application pour Windows. En développement, un autre : une notification d'Electron non packagé crée
 * dans le menu Démarrer un raccourci « Electron.lnk » vers electron.exe avec cet identifiant, et Windows en tirerait
 * l'icône et le nom de l'application installée dans la barre des tâches.
 */
export const WINDOWS_APP_ID = app.isPackaged ? APP_USER_MODEL_ID : `${APP_USER_MODEL_ID}.dev`

export const PLAYER_SHORTCUT: ShortcutSpec = {
  name: APP_NAME,
  description: 'Installer et gérer les modpacks Minecraft de CurseForge',
  args: [],
  appUserModelId: WINDOWS_APP_ID
}

const quote = (arg: string) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)

/**
 * Icône du raccourci : celle de l'exécutable une fois installé. En développement, l'exécutable est
 * electron.exe : on fabrique un .ico (une image PNG 256×256, format lu par Windows) depuis build/icon.png.
 */
async function shortcutIcon(): Promise<string> {
  if (app.isPackaged) return process.execPath
  const png = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
  if (png.isEmpty()) return process.execPath
  const data = png.resize({ width: 256, height: 256 }).toPNG()
  const header = Buffer.alloc(22)
  header.writeUInt16LE(1, 2) // type : icône
  header.writeUInt16LE(1, 4) // une image
  // Octets 6 et 7 à 0 : largeur et hauteur de 256.
  header.writeUInt16LE(1, 10) // plans de couleur
  header.writeUInt16LE(32, 12) // bits par pixel
  header.writeUInt32LE(data.length, 14)
  header.writeUInt32LE(22, 18) // position de l'image
  const file = join(app.getPath('userData'), 'shortcut.ico')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, Buffer.concat([header, data]))
  return file
}

export function desktopShortcutPath(spec: ShortcutSpec): string {
  return join(app.getPath('desktop'), `${spec.name}.lnk`)
}

export function shortcutStatus(spec: ShortcutSpec): ShortcutStatus {
  const desktopPath = desktopShortcutPath(spec)
  return { desktopPath, onDesktop: existsSync(desktopPath) }
}

/** Crée (ou remplace) un raccourci vers l'application, sur le bureau ou à l'endroit choisi. */
export async function createShortcut(
  spec: ShortcutSpec,
  location: ShortcutLocation,
  window: BrowserWindow | null
): Promise<ShortcutResult> {
  let file = desktopShortcutPath(spec)
  if (location === 'choose') {
    const options: Electron.SaveDialogOptions = {
      title: 'Où créer le raccourci ?',
      defaultPath: file,
      buttonLabel: 'Créer le raccourci',
      filters: [{ name: 'Raccourci', extensions: ['lnk'] }]
    }
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true }
    file = /\.lnk$/i.test(result.filePath) ? result.filePath : `${result.filePath}.lnk`
  }

  // Non packagée, l'application se lance avec electron.exe suivi du dossier du projet.
  const args = app.isPackaged ? spec.args : [app.getAppPath(), ...spec.args]
  const icon = await shortcutIcon().catch(() => process.execPath)
  const ok = shell.writeShortcutLink(file, 'create', {
    target: process.execPath,
    args: args.map(quote).join(' '),
    cwd: dirname(process.execPath),
    description: spec.description,
    icon,
    iconIndex: 0,
    appUserModelId: spec.appUserModelId
  })
  if (!ok) return { ok: false, cancelled: false, error: 'Windows a refusé de créer le raccourci à cet emplacement.' }
  refreshShellIcons()
  return { ok: true, path: file }
}

/**
 * Demande à l'Explorateur de relire ses icônes (SHChangeNotify, SHCNE_ASSOCCHANGED), sans attendre la réponse. Il
 * garde en mémoire l'icône d'un exécutable : sans cela, un raccourci recréé après une mise à jour peut reprendre
 * une icône vide, mémorisée pendant que l'exécutable était absent.
 */
export function refreshShellIcons(): void {
  const script =
    'Add-Type -Namespace Mm -Name Shell -MemberDefinition \'[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, IntPtr a, IntPtr b);\';' +
    ' [Mm.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)'
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 30_000 }, () => {
    // Sans conséquence : l'icône se mettra à jour au prochain rafraîchissement de l'Explorateur.
  })
}
