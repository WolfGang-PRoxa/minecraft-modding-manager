import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron'
import type { CurseForgeSecretKind, InstallResult, IssueReport, LaunchInfo, ModpackVersion, Settings, ShortcutLocation } from '../shared/types'
import { appUpdateTask, cancelAppUpdate, installAppUpdate } from './appUpdate'
import { registerAuthIpc } from './authIpc'
import { registerClaudeCodeIpc } from './claudeCode'
import { curseForgeAuthStatus, saveCurseForgeSecret } from '../core/curseforgeAuth'
import { getCurseForgeStatus, launchCurseForge, resolveInstancesDir, restartCurseForge } from '../core/curseforge'
import { getCatalog } from './github'
import { cancelInstall, installModpack, isInstalling, listInstalled } from './installer'
import { listProfiles } from '../core/profiles'
import { openFolder } from './openFolder'
import { openReportInBrowser, reportInfo, submitReport } from './report'
import { registerRoleIpc } from './roleIpc'
import { getSettings, updateSettings } from '../core/settings'
import { createShortcut, PLAYER_SHORTCUT, shortcutStatus } from './shortcut'
import { studioTask } from './studioIpc'
import { toggleMaximize } from './windowState'

export function registerIpc(
  getWindow: () => BrowserWindow | null,
  launch: Pick<LaunchInfo, 'justUpdated' | 'previousVersion'>
): void {
  registerAuthIpc()
  registerRoleIpc()
  registerClaudeCodeIpc()
  ipcMain.handle('cfauth:status', () => curseForgeAuthStatus())
  ipcMain.handle('cfauth:save', async (_e, kind: CurseForgeSecretKind, value: string | null) => {
    if (kind !== 'apiKey' && kind !== 'uploadToken') return { ok: false, error: 'Secret inconnu.' }
    try {
      await saveCurseForgeSecret(kind, typeof value === 'string' ? value : null)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  const send = (channel: string, payload: unknown) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  ipcMain.handle('catalog:get', (_e, force?: boolean) => getCatalog(Boolean(force)))

  ipcMain.handle('installed:list', async () => {
    const { dir } = await resolveInstancesDir(await getSettings())
    return listInstalled(dir)
  })

  ipcMain.handle('curseforge:profiles', async () => {
    const { dir } = await resolveInstancesDir(await getSettings())
    return listProfiles(dir)
  })

  ipcMain.handle('install:start', (_e, version: ModpackVersion): InstallResult | Promise<InstallResult> => {
    // L'application va se fermer pour se mettre à jour : une installation serait coupée en plein milieu.
    const updating = appUpdateTask()
    if (updating) return { ok: false, cancelled: false, error: `Patiente : ${updating} est en cours.` }
    return installModpack(version, (progress) => send('install:progress', progress))
  })
  ipcMain.handle('install:cancel', (_e, id: string) => cancelInstall(id))

  ipcMain.handle('curseforge:status', async () => getCurseForgeStatus(await getSettings()))
  ipcMain.handle('curseforge:launch', () => launchCurseForge())
  ipcMain.handle('curseforge:restart', async () => restartCurseForge((await resolveInstancesDir(await getSettings())).dir))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const allowed: Partial<Settings> = {}
    if ('instancesDir' in patch) allowed.instancesDir = patch.instancesDir || null
    if (typeof patch.openCurseForgeAfterInstall === 'boolean') {
      allowed.openCurseForgeAfterInstall = patch.openCurseForgeAfterInstall
    }
    if (typeof patch.shortcutPrompted === 'boolean') allowed.shortcutPrompted = patch.shortcutPrompted
    if (patch.lastView === 'library' || patch.lastView === 'studio') allowed.lastView = patch.lastView
    return updateSettings(allowed)
  })
  ipcMain.handle('settings:pickInstancesDir', async () => {
    const win = getWindow()
    const current = await resolveInstancesDir(await getSettings())
    const options: Electron.OpenDialogOptions = {
      title: 'Choisir le dossier Instances de CurseForge',
      defaultPath: current.dir,
      properties: ['openDirectory', 'createDirectory']
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return updateSettings({ instancesDir: result.filePaths[0] })
  })

  let update = launch
  ipcMain.handle('app:launchInfo', (): LaunchInfo => {
    const info: LaunchInfo = { view: process.argv.includes('--studio') ? 'studio' : null, ...update }
    // Annoncé une seule fois, même si la fenêtre est rechargée.
    update = { justUpdated: false, previousVersion: null }
    return info
  })

  ipcMain.handle('shortcut:status', () => shortcutStatus(PLAYER_SHORTCUT))
  ipcMain.handle('shortcut:create', async (_e, location: ShortcutLocation) => {
    const result = await createShortcut(PLAYER_SHORTCUT, location === 'choose' ? 'choose' : 'desktop', getWindow())
    // Une réponse a été donnée : le bandeau de premier lancement ne revient plus.
    if (result.ok) await updateSettings({ shortcutPrompted: true })
    return result
  })

  ipcMain.handle('shell:openPath', (_e, path: unknown) => openFolder(path))
  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (/^https:\/\//i.test(url)) await shell.openExternal(url)
  })

  ipcMain.handle('report:info', () => reportInfo())
  ipcMain.handle('report:submit', (_e, report: IssueReport) => submitReport(report))
  ipcMain.handle('report:browser', (_e, report: IssueReport) => openReportInBrowser(report))

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:update', () =>
    installAppUpdate({
      busyWith: () => (isInstalling() ? 'l’installation d’un modpack' : studioTask()),
      onProgress: (progress) => send('app:update-progress', progress)
    })
  )
  ipcMain.handle('app:cancelUpdate', () => cancelAppUpdate())

  ipcMain.on('window:minimize', () => getWindow()?.minimize())
  ipcMain.on('window:toggleMaximize', () => {
    const win = getWindow()
    if (win) toggleMaximize(win)
  })
  ipcMain.on('window:close', () => getWindow()?.close())
}
