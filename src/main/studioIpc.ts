import { dialog, ipcMain, net, protocol, shell, type BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ActionResult, PackSettings, PublishResult, RangerOrders } from '../shared/studio'
import { appUpdateTask } from './appUpdate'
import { resolveCredential } from '../core/auth'
import { resolveInstancesDir } from '../core/curseforge'
import { pathExists } from '../core/fsutil'
import { operationTools } from '../core/operations'
import { getSettings } from '../core/settings'
import { AnalysisCache, describeError, StudioError } from '../core/studio/analyze'
import { listProfiles } from '../core/profiles'
import { StudioService } from '../core/studio/service'
import { defaultWorkspaceDir, loadWorkspaceDir, saveWorkspaceDir } from '../core/studio/settings'
import { COVER_EXTENSIONS, type LocalPack } from '../core/studio/workspace'

/** Protocole qui sert les images des modpacks à la fenêtre (déclaré avant `ready` dans index.ts). */
export const COVER_SCHEME = 'studio-media'

let getWindow: () => BrowserWindow | null = () => null
let workspaceDir: string | null = null
let service: StudioService
let watcher: FSWatcher | null = null
let publishController: AbortController | null = null
let zipController: AbortController | null = null

function send(channel: string, payload?: unknown): void {
  const window = getWindow()
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
}

function coverUrl(pack: LocalPack): string | null {
  if (!pack.cover) return null
  return `${COVER_SCHEME}://cover/${encodeURIComponent(pack.folder)}?v=${Math.floor(pack.cover.mtimeMs)}-${pack.cover.size}`
}

/** Prévient la vue Studio quand le contenu du dossier change (zip déposé dans l'Explorateur…). */
function restartWatcher(): void {
  watcher?.close()
  watcher = null
  if (!workspaceDir) return
  let timer: NodeJS.Timeout | null = null
  try {
    watcher = watch(workspaceDir, { recursive: true }, (_event, fileName) => {
      if (fileName && (fileName.endsWith(AnalysisCache.FILE_NAME) || /\.(part|tmp)$/i.test(fileName))) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => send('studio:changed'), 700)
    })
    watcher.on('error', () => {
      watcher?.close()
      watcher = null
      send('studio:changed')
    })
  } catch {
    watcher = null
  }
}

async function setWorkspace(dir: string): Promise<void> {
  workspaceDir = dir
  await saveWorkspaceDir(dir)
  restartWatcher()
}

function registerCoverProtocol(): void {
  protocol.handle(COVER_SCHEME, async (request) => {
    const folder = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))
    if (workspaceDir && folder && !/[\\/]/.test(folder) && folder !== '..') {
      for (const ext of COVER_EXTENSIONS) {
        const file = join(workspaceDir, folder, `cover${ext}`)
        if (await pathExists(file)) return net.fetch(pathToFileURL(file).toString())
      }
    }
    return new Response(null, { status: 404 })
  })
}

async function action(run: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await run()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }
}

/**
 * Opération du studio qu'une mise à jour de l'application interromprait (« la publication »…), sinon null : celle
 * de la fenêtre, ou celle d'un autre processus (ligne de commande, serveur MCP), que l'installeur fermerait aussi.
 */
export function studioTask(): string | null {
  return service?.currentTask ?? service?.otherProcessTask ?? null
}

/** Arrête proprement une publication ou une création de zip en cours (fermeture de la fenêtre). */
export function stopStudioTasks(): void {
  publishController?.abort()
  zipController?.abort()
}

/** Vue Studio : canaux `studio:*`, images des modpacks et surveillance du dossier des modpacks. */
export async function registerStudio(window: () => BrowserWindow | null): Promise<void> {
  getWindow = window
  workspaceDir = await loadWorkspaceDir()
  // Repris de l'ancien fichier du studio : on l'inscrit une fois pour toutes dans les réglages communs.
  if (workspaceDir && !(await getSettings()).workspaceDir) await saveWorkspaceDir(workspaceDir)
  service = new StudioService({
    getWorkspaceDir: () => workspaceDir,
    defaultWorkspaceDir: defaultWorkspaceDir(),
    getAppSettings: getSettings,
    getCredential: () => resolveCredential(),
    coverUrl,
    onAnalyzing: (fileName) => send('studio:analyzing', fileName),
    blockedBy: appUpdateTask,
    trashItem: (path) => shell.trashItem(path),
    getInstancesDir: async () => (await resolveInstancesDir(await getSettings())).dir,
    ...operationTools('l’application')
  })
  registerCoverProtocol()
  restartWatcher()
  const parent = () => getWindow() ?? undefined

  ipcMain.handle('studio:overview', (_e, options?: { refreshRemote?: boolean }) => service.overview(options ?? {}))

  ipcMain.handle('studio:pickWorkspace', async () => {
    const options: Electron.OpenDialogOptions = {
      title: 'Dossier de tes modpacks',
      defaultPath: workspaceDir ?? defaultWorkspaceDir(),
      properties: ['openDirectory', 'createDirectory']
    }
    const result = parent() ? await dialog.showOpenDialog(parent()!, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return false
    await setWorkspace(result.filePaths[0])
    return true
  })
  ipcMain.handle('studio:useDefaultWorkspace', () =>
    action(async () => {
      const dir = defaultWorkspaceDir()
      await mkdir(dir, { recursive: true })
      await setWorkspace(dir)
    })
  )
  ipcMain.handle('studio:createPack', (_e, name: string) => action(() => service.createPack(name)))
  ipcMain.handle('studio:updatePackInfo', (_e, folder: string, info: { name: string; description: string }) =>
    action(() => service.updatePackInfo(folder, info))
  )
  ipcMain.handle('studio:updatePackSettings', (_e, folder: string, settings: PackSettings) =>
    action(() => service.updatePackSettings(folder, settings))
  )
  ipcMain.handle('studio:pickCover', (_e, folder: string) =>
    action(async () => {
      const options: Electron.OpenDialogOptions = {
        title: 'Image de couverture (16:9 conseillé)',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: COVER_EXTENSIONS.map((e) => e.slice(1)) }]
      }
      const result = parent() ? await dialog.showOpenDialog(parent()!, options) : await dialog.showOpenDialog(options)
      if (!result.canceled && result.filePaths[0]) await service.setCover(folder, result.filePaths[0])
    })
  )
  ipcMain.handle('studio:removeCover', (_e, folder: string) => action(() => service.setCover(folder, null)))
  ipcMain.handle('studio:setNotes', (_e, folder: string, version: number, notes: string) =>
    action(() => service.setNotes(folder, version, notes))
  )
  ipcMain.handle('studio:importFiles', async (_e, folder: string, paths: string[]) => {
    try {
      return { ok: true, ...(await service.importFiles(folder, paths)) }
    } catch (err) {
      return { ok: false, error: describeError(err) }
    }
  })

  ipcMain.handle('studio:rangerPlan', (_e, orders?: RangerOrders) => service.rangerPlan(orders))
  ipcMain.handle('studio:applyRanger', async (_e, orders?: RangerOrders) => {
    try {
      return { ok: true, renamed: await service.applyRanger(orders) }
    } catch (err) {
      return { ok: false, error: describeError(err) }
    }
  })

  ipcMain.handle('studio:publish', async (_e, fingerprint: string) => {
    publishController = new AbortController()
    try {
      return await service.publish(fingerprint, (progress) => send('studio:publish-progress', progress), publishController.signal)
    } catch (err) {
      return { ok: false, cancelled: false, error: describeError(err), done: 0 }
    } finally {
      publishController = null
    }
  })
  ipcMain.handle('studio:cancelPublish', () => publishController?.abort())

  const unpublished = (run: () => Promise<PublishResult>) =>
    run().catch((err: unknown): PublishResult => ({ ok: false, cancelled: false, error: describeError(err), done: 0 }))
  ipcMain.handle('studio:deleteVersion', (_e, folder: string, version: number) =>
    unpublished(() => service.deleteVersion(folder, version))
  )
  ipcMain.handle('studio:deletePack', (_e, folder: string) => unpublished(() => service.deletePack(folder)))
  ipcMain.handle('studio:deleteReleases', (_e, tags: string[]) => unpublished(() => service.deleteReleases(tags)))

  ipcMain.handle('studio:listInstances', async () => {
    const { dir } = await resolveInstancesDir(await getSettings())
    return { dir, instances: await listProfiles(dir) }
  })
  ipcMain.handle('studio:library', () => service.library())
  ipcMain.handle('studio:linkProfile', (_e, folder: string, profilePath: string | null) =>
    action(() => service.linkProfile(folder, profilePath))
  )
  /** Progression d'une écriture de zip, envoyée au plus toutes les 120 ms. */
  const zipProgress = () => {
    let lastEmit = 0
    return (done: number, total: number) => {
      const now = Date.now()
      if (now - lastEmit < 120 && done < total) return
      lastEmit = now
      send('studio:zip-progress', { done, total })
    }
  }
  ipcMain.handle('studio:zipInstance', async (_e, folder: string, instancePath: string, includeSaves: boolean) => {
    zipController = new AbortController()
    try {
      const fileName = await service.zipInstance(folder, instancePath, includeSaves, zipProgress(), zipController.signal)
      return { ok: true, fileName }
    } catch (err) {
      return { ok: false, error: describeError(err) }
    } finally {
      zipController = null
    }
  })
  ipcMain.handle('studio:createPackFromProfile', async (_e, name: string, profilePath: string, includeSaves: boolean) => {
    zipController = new AbortController()
    try {
      const { folder } = await service.createPackFromProfile(name, profilePath, includeSaves, zipProgress(), zipController.signal)
      return { ok: true, folder }
    } catch (err) {
      return { ok: false, error: describeError(err) }
    } finally {
      zipController = null
    }
  })
  ipcMain.handle('studio:stripExcluded', async (_e, folder: string, fileName: string) => {
    zipController = new AbortController()
    try {
      const removed = await service.stripExcluded(folder, fileName, zipProgress(), zipController.signal)
      return { ok: true, removed }
    } catch (err) {
      return { ok: false, error: describeError(err) }
    } finally {
      zipController = null
    }
  })
  ipcMain.handle('studio:cancelZip', () => zipController?.abort())

  ipcMain.handle('studio:zipContents', (_e, folder: string, fileName: string) => service.zipContents(folder, fileName))
  ipcMain.handle('studio:zipEntry', (_e, folder: string, fileName: string, path: string) =>
    service.previewZipEntry(folder, fileName, path)
  )

  ipcMain.handle('studio:openPath', async (_e, path: string) => {
    if (!(await pathExists(path))) throw new StudioError('Ce dossier n’existe plus.')
    await shell.openPath(path)
  })
}
