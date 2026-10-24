// Ce que les installations précédentes (« Modpack Manager.exe » dans Programs\minecraft-modpack-manager, et avant la
// 1.9.0 « Modpack Downloader.exe » dans Programs\minecraft-modpack-downloader) ont laissé autour d'elles, et que leur
// désinstalleur garde : raccourci du bureau, épingles de la barre des tâches, tâche planifiée des mises à jour
// automatiques, connexion de Claude Code. Le nouvel installeur a désinstallé l'ancienne application
// (build/installer.nsh) ; au premier lancement, tout cela est dirigé vers la nouvelle, une fois.
// Voir shared/previousIdentity.ts.
import { app, shell } from 'electron'
import { existsSync } from 'node:fs'
import { readdir, rm, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  installMaintenanceTask,
  maintenanceTaskExecutable,
  readMaintenanceTask,
  removeMaintenanceTask
} from '../core/maintenance/scheduledTask'
import { APP_NAME } from '../shared/config'
import { PREVIOUS_EXECUTABLES, PREVIOUS_IDENTITIES, PREVIOUS_PRODUCT } from '../shared/previousIdentity'
import { reconnectPrevious } from './claudeCode'
import { maintenanceLauncher } from './maintenance'
import { refreshShellIcons, WINDOWS_APP_ID } from './shortcut'

// Marque la reprise faite. Pas celui de la 1.9.0 (« previous-identity.done »), venu avec le dossier des données.
const DONE_FILE = 'previous-identity-2.done'

const isPrevious = (target: string) => PREVIOUS_EXECUTABLES.some((exe) => basename(target).toLowerCase() === exe.toLowerCase())

/** Les raccourcis (.lnk) d'un dossier et, si demandé, de ses sous-dossiers. */
async function shortcutsIn(dir: string, recursive: boolean): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isFile() && /\.lnk$/i.test(entry.name)) found.push(path)
    else if (recursive && entry.isDirectory()) found.push(...(await shortcutsIn(path, true)))
  }
  return found
}

/**
 * Raccourcis vers un ancien exécutable (bureau, menu Démarrer, épingles de la barre des tâches) : ils lancent
 * désormais celui-ci, avec son identifiant Windows (sans quoi la fenêtre ouverte ne se rangerait pas sous son épingle).
 * Celui du bureau qui porte l'ancien nom de l'application prend le nouveau (les épingles gardent leur fichier, que
 * Windows retient).
 */
async function retargetShortcuts(): Promise<number> {
  const roaming = app.getPath('appData')
  const desktop = app.getPath('desktop')
  const files = [
    ...(await shortcutsIn(desktop, false)),
    ...(await shortcutsIn(join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), true)),
    ...(await shortcutsIn(join(roaming, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'), false))
  ]
  let changed = 0
  for (const file of files) {
    let link: Electron.ShortcutDetails
    try {
      link = shell.readShortcutLink(file)
    } catch {
      continue
    }
    if (!isPrevious(link.target)) continue
    const details: Electron.ShortcutDetails = {
      ...link,
      target: process.execPath,
      cwd: dirname(process.execPath),
      icon: process.execPath,
      iconIndex: 0,
      appUserModelId: WINDOWS_APP_ID
    }
    const renamed = join(desktop, `${APP_NAME}.lnk`)
    const rename = dirname(file) === desktop && basename(file).toLowerCase() === `${PREVIOUS_PRODUCT.name}.lnk`.toLowerCase()
    if (rename && !existsSync(renamed)) {
      if (shell.writeShortcutLink(renamed, 'create', details)) {
        await unlink(file).catch(() => {})
        changed++
      }
      continue
    }
    if (shell.writeShortcutLink(file, 'replace', details)) changed++
  }
  if (changed) refreshShellIcons()
  return changed
}

/**
 * La tâche planifiée de l'ancien nom, qui lançait un ancien exécutable, est remplacée par celle de ce nom, qui lance
 * celui-ci à la même heure.
 */
async function retargetMaintenanceTask(): Promise<void> {
  const executable = await maintenanceTaskExecutable(PREVIOUS_PRODUCT.maintenanceTask)
  if (!executable || !isPrevious(executable)) return
  const task = await readMaintenanceTask(null, PREVIOUS_PRODUCT.maintenanceTask)
  if (task.time) await installMaintenanceTask(maintenanceLauncher(), { time: task.time, wake: task.wake })
  await removeMaintenanceTask(PREVIOUS_PRODUCT.maintenanceTask)
}

/** Une seule fois par dossier de données, et seulement pour l'application installée. Ne lève jamais. */
export async function migratePreviousInstallation(): Promise<void> {
  if (!app.isPackaged || process.platform !== 'win32') return
  const done = join(app.getPath('userData'), DONE_FILE)
  if (existsSync(done)) return
  await Promise.allSettled([
    retargetShortcuts(),
    retargetMaintenanceTask(),
    reconnectPrevious(PREVIOUS_PRODUCT.mcpServer, PREVIOUS_EXECUTABLES),
    ...PREVIOUS_IDENTITIES.map((identity) => rm(join(app.getPath('temp'), identity.tempDir), { recursive: true, force: true }))
  ])
  await writeFile(done, new Date().toISOString()).catch(() => {})
}
