// Ce que l'installation d'avant la 1.9.0 (« Modpack Downloader.exe », dans Programs\minecraft-modpack-downloader) a
// laissé autour d'elle, et que son désinstalleur garde : raccourcis du bureau, épingles de la barre des tâches, tâche
// planifiée des mises à jour automatiques, connexion de Claude Code. Le nouvel installeur a désinstallé l'ancienne
// application (build/installer.nsh) ; au premier lancement, tout cela est dirigé vers la nouvelle, une fois.
// À retirer avec shared/previousIdentity.ts (voir ce fichier).
import { app, shell } from 'electron'
import { existsSync } from 'node:fs'
import { readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { installMaintenanceTask, maintenanceTaskExecutable, readMaintenanceTask } from '../core/maintenance/scheduledTask'
import { PREVIOUS_IDENTITY } from '../shared/previousIdentity'
import { reconnectIfMoved } from './claudeCode'
import { maintenanceLauncher } from './maintenance'
import { refreshShellIcons, WINDOWS_APP_ID } from './shortcut'

const DONE_FILE = 'previous-identity.done'

const isPrevious = (target: string) => basename(target).toLowerCase() === PREVIOUS_IDENTITY.executable.toLowerCase()

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
 * Raccourcis vers l'ancien exécutable (bureau, menu Démarrer, épingles de la barre des tâches) : ils lancent désormais
 * celui-ci, avec son identifiant Windows (sans quoi la fenêtre ouverte ne se rangerait pas sous son épingle).
 */
async function retargetShortcuts(): Promise<number> {
  const roaming = app.getPath('appData')
  const files = [
    ...(await shortcutsIn(app.getPath('desktop'), false)),
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
    const ok = shell.writeShortcutLink(file, 'replace', {
      ...link,
      target: process.execPath,
      cwd: dirname(process.execPath),
      icon: process.execPath,
      iconIndex: 0,
      appUserModelId: WINDOWS_APP_ID
    })
    if (ok) changed++
  }
  if (changed) refreshShellIcons()
  return changed
}

/** La tâche planifiée qui lançait l'ancien exécutable lance celui-ci, à la même heure. */
async function retargetMaintenanceTask(): Promise<void> {
  const executable = await maintenanceTaskExecutable()
  if (!executable || !isPrevious(executable)) return
  const task = await readMaintenanceTask(null)
  if (task.time) await installMaintenanceTask(maintenanceLauncher(), { time: task.time, wake: task.wake })
}

/** Une seule fois par dossier de données, et seulement pour l'application installée. Ne lève jamais. */
export async function migratePreviousInstallation(): Promise<void> {
  if (!app.isPackaged || process.platform !== 'win32') return
  const done = join(app.getPath('userData'), DONE_FILE)
  if (existsSync(done)) return
  await Promise.allSettled([
    retargetShortcuts(),
    retargetMaintenanceTask(),
    reconnectIfMoved(PREVIOUS_IDENTITY.executable),
    rm(join(app.getPath('temp'), PREVIOUS_IDENTITY.tempDir), { recursive: true, force: true })
  ])
  await writeFile(done, new Date().toISOString()).catch(() => {})
}
