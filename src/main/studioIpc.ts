import { dialog, ipcMain, net, protocol, shell, type BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ActionResult, PackSettings, PublishResult, RangerOrders, UpdateChannel } from '../shared/studio'
import { appUpdateTask } from './appUpdate'
import { maintenanceTask, registerMaintenanceIpc, stopMaintenance } from './maintenance'
import { openFolder, OpenFolderError } from './openFolder'
import { resolveCredential } from '../core/auth'
import { resolveInstancesDir } from '../core/curseforge'
import { pathExists } from '../core/fsutil'
import { operationTools } from '../core/operations'
import { getSettings } from '../core/settings'
import { AnalysisCache, describeError, StudioError } from '../core/studio/analyze'
import { CurseForgeClient } from '../core/curseforgeApi'
import { CurseForgeUploader } from '../core/curseforgeUpload'
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
let testController: AbortController | null = null

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

/** Résultat d'une action qui renvoie des données : `{ ok: true, ...données }` ou l'erreur. */
async function outcomeOf<T extends object>(run: () => Promise<T>): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  try {
    return { ok: true as const, ...(await run()) }
  } catch (err) {
    return { ok: false as const, error: describeError(err) }
  }
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
  return service?.currentTask ?? service?.otherProcessTask ?? maintenanceTask()
}

/** Arrête proprement une publication ou une création de zip en cours (fermeture de la fenêtre). */
export function stopStudioTasks(): void {
  publishController?.abort()
  zipController?.abort()
  testController?.abort()
  stopMaintenance()
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
    getCurseForgeClient: () => CurseForgeClient.create(),
    getCurseForgeUploader: () => CurseForgeUploader.create(),
    ...operationTools('l’application')
  })
  registerCoverProtocol()
  registerMaintenanceIpc(() => service, getWindow)
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
  ipcMain.handle('studio:setNotes', (_e, folder: string, version: number | string, notes: string) =>
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
  ipcMain.handle('studio:deleteModVersion', (_e, folder: string, version: string) =>
    unpublished(() => service.deleteModVersion(folder, String(version)))
  )
  ipcMain.handle('studio:deletePack', (_e, folder: string) => unpublished(() => service.deletePack(folder)))

  // Mods : dossier lié au projet du mod, import de ses versions.
  const pickModSource = async (title: string): Promise<string | null> => {
    const options: Electron.OpenDialogOptions = { title, properties: ['openDirectory'] }
    const result = parent() ? await dialog.showOpenDialog(parent()!, options) : await dialog.showOpenDialog(options)
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
  }
  ipcMain.handle('studio:createModFromSource', () =>
    outcomeOf(async () => {
      const source = await pickModSource('Dossier où le projet du mod dépose ses jars (releases, build/libs…)')
      return { folder: source ? await service.createModFromSource(source) : null }
    })
  )
  ipcMain.handle('studio:availableModVersions', (_e, folder: string) =>
    outcomeOf(async () => ({
      versions: (await service.availableModVersions(folder)).map((v) => ({
        version: v.version,
        files: v.files.map((f) => ({ fileName: f.fileName, loaders: f.analysis.loaders, minecraftVersions: f.analysis.minecraftVersions }))
      }))
    }))
  )
  ipcMain.handle('studio:importModVersions', (_e, folder: string, versions: string[]) =>
    outcomeOf(async () => ({ imported: await service.importModVersions(folder, Array.isArray(versions) ? versions.filter((v) => typeof v === 'string') : []) }))
  )
  ipcMain.handle('studio:linkModSource', (_e, folder: string, mode: 'pick' | null) =>
    action(async () => {
      if (mode !== 'pick') return service.linkModSource(folder, null)
      const source = await pickModSource('Dossier où le projet du mod dépose ses jars')
      if (source) await service.linkModSource(folder, source)
    })
  )
  ipcMain.handle('studio:deleteReleases', (_e, tags: string[]) => unpublished(() => service.deleteReleases(tags)))

  ipcMain.handle('studio:listInstances', async () => {
    const { dir } = await resolveInstancesDir(await getSettings())
    return { dir, instances: await listProfiles(dir) }
  })
  ipcMain.handle('studio:library', () => service.library())
  const outcome = async <T>(run: () => Promise<T>) => {
    try {
      return { ok: true as const, ...(await run()) }
    } catch (err) {
      return { ok: false as const, error: describeError(err) }
    }
  }
  ipcMain.handle('studio:checkUpdates', (_e, profilePath: string, channel: UpdateChannel) =>
    outcome(async () => ({ plan: await service.checkUpdates(profilePath, channel === 'beta' ? 'beta' : 'release') }))
  )
  ipcMain.handle('studio:applyUpdates', (_e, profilePath: string, channel: UpdateChannel, only: number[]) =>
    outcome(async () => {
      let last = 0
      const result = await service.applyUpdatesToTrial(profilePath, { channel: channel === 'beta' ? 'beta' : 'release', only }, (done, total, name) => {
        const now = Date.now()
        if (now - last < 120 && done < total) return
        last = now
        send('studio:update-progress', { done, total, name })
      })
      return { result }
    })
  )
  ipcMain.handle('studio:promoteTrial', (_e, profilePath: string) =>
    outcome(async () => ({ promoted: await service.promoteTrial(profilePath) }))
  )
  ipcMain.handle('studio:discardTrial', (_e, profilePath: string) => action(() => service.discardTrial(profilePath)))
  ipcMain.handle('studio:checkProfile', (_e, profilePath: string) =>
    outcome(async () => ({ report: await service.checkProfile(profilePath) }))
  )
  ipcMain.handle('studio:testServer', (_e, profilePath: string) =>
    outcome(async () => {
      testController = new AbortController()
      try {
        const report = await service.testServer(profilePath, (text) => send('studio:test-progress', text), { signal: testController.signal })
        return { report }
      } finally {
        testController = null
      }
    })
  )
  const withTestSignal = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    testController = new AbortController()
    try {
      return await run(testController.signal)
    } finally {
      testController = null
    }
  }
  ipcMain.handle('studio:testPlayers', (_e, profilePath: string, players?: number) =>
    outcome(async () =>
      withTestSignal(async (signal) => ({ report: await service.testPlayers(profilePath, (text) => send('studio:test-progress', text), { signal, players }) }))
    )
  )
  ipcMain.handle('studio:testAll', (_e, profilePath: string, players?: number) =>
    outcome(async () =>
      withTestSignal(async (signal) => ({ reports: await service.testAll(profilePath, (text) => send('studio:test-progress', text), { signal, players }) }))
    )
  )
  ipcMain.handle('studio:cancelTest', () => testController?.abort())
  ipcMain.handle('studio:lastTests', (_e, profilePath: string) => service.lastTests(profilePath))
  ipcMain.handle('studio:linkCurseForge', (_e, folder: string, ref: string) => outcome(() => service.linkCurseForge(folder, ref)))
  ipcMain.handle('studio:updatePublishTargets', (_e, folder: string, changes: { overrides?: string[]; github?: boolean; unlinkCurseForge?: boolean }) =>
    action(() =>
      service.updatePublishTargets(folder, {
        overrides: Array.isArray(changes?.overrides) ? changes.overrides.filter((o) => typeof o === 'string') : undefined,
        github: typeof changes?.github === 'boolean' ? changes.github : undefined,
        unlinkCurseForge: changes?.unlinkCurseForge === true
      })
    )
  )
  ipcMain.handle('studio:publishCurseForge', (_e, folder: string, version: number, releaseType: string) =>
    outcome(async () => ({
      fileId: await service.publishToCurseForge(
        folder,
        version,
        releaseType === 'beta' || releaseType === 'alpha' ? releaseType : 'release',
        (text) => send('studio:curseforge-progress', text)
      )
    }))
  )
  ipcMain.handle('studio:publishModCurseForge', (_e, folder: string, version: string, releaseType: string) =>
    outcome(() =>
      service.publishModToCurseForge(folder, String(version), releaseType === 'beta' || releaseType === 'alpha' ? releaseType : 'release', (text) =>
        send('studio:curseforge-progress', text)
      )
    )
  )
  ipcMain.handle('studio:curseForgeVersions', (_e, folder: string) => outcome(async () => ({ versions: await service.curseForgeVersions(folder) })))
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

  ipcMain.handle('studio:openPath', async (_e, path: unknown) => {
    try {
      await openFolder(path)
    } catch (err) {
      // Message montré tel quel par la vue Studio.
      throw err instanceof OpenFolderError ? new StudioError(err.message) : err
    }
  })
}
