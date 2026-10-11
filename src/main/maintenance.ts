// Mises à jour automatiques côté application : le passage lancé par la tâche planifiée (`--maintenance` : sans
// fenêtre, puis une notification), et les canaux `maintenance:*` de la vue Studio. Le travail est dans
// src/core/maintenance/.
import { app, ipcMain, Notification, type BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import type { MaintenanceRecord, PackUpdates } from '../shared/studio'
import { createCommandRuntime } from '../core/commands/context'
import { ANALYSIS_TOOLS, failurePrompt } from '../core/maintenance/claude'
import { discardPending, finishPending, maintenanceStatus, runMaintenance, summarize, type MaintenanceOptions } from '../core/maintenance/pipeline'
import { installMaintenanceTask, readMaintenanceTask, removeMaintenanceTask, type MaintenanceLauncher } from '../core/maintenance/scheduledTask'
import { saveRecord } from '../core/maintenance/state'
import { maintenanceLock } from '../core/operations'
import { getSettings, updateSettings } from '../core/settings'
import { describeError } from '../core/studio/analyze'
import type { StudioService } from '../core/studio/service'
import { askClaude } from './claudeCode'

/** Argument qui lance un passage sans fenêtre (tâche planifiée). */
export const MAINTENANCE_SWITCH = '--maintenance'

/** Ce que la tâche planifiée lance : cette installation (en développement : Electron sur le dossier du projet). */
export function maintenanceLauncher(): MaintenanceLauncher {
  return {
    execute: process.execPath,
    arguments: app.isPackaged ? MAINTENANCE_SWITCH : `"${app.getAppPath()}" ${MAINTENANCE_SWITCH}`
  }
}

/** Confie à Claude Code les passages qui ont échoué ; sa conclusion est gardée avec le passage. */
async function analyzeFailures(records: MaintenanceRecord[]): Promise<void> {
  for (const record of records.filter((r) => r.outcome === 'failed')) {
    const answer = await askClaude(failurePrompt(record), ANALYSIS_TOOLS).catch(() => null)
    if (!answer) continue
    record.claude = answer
    await saveRecord(record, { replace: true })
  }
}

/** Ouvre l'application sur la vue Studio (ou la ramène au premier plan si elle tourne). */
function openStudio(): void {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const args = app.isPackaged ? ['--studio'] : [app.getAppPath(), '--studio']
  spawn(process.execPath, args, { detached: true, stdio: 'ignore', env }).unref()
}

/** Notification Windows ; un clic ouvre le Studio. Attend qu'elle soit lue ou rangée (2 minutes au plus). */
function notify(body: string): Promise<void> {
  if (!Notification.isSupported()) return Promise.resolve()
  return new Promise((resolve) => {
    const notification = new Notification({ title: 'Mises à jour des modpacks', body: body.length > 300 ? `${body.slice(0, 297)}…` : body })
    const timer = setTimeout(done, 120_000)
    function done() {
      clearTimeout(timer)
      resolve()
    }
    notification.on('click', () => {
      openStudio()
      done()
    })
    notification.on('close', done)
    notification.show()
  })
}

/** Passage de la tâche planifiée : les modpacks dont le tour est venu, puis une notification s'il y a du nouveau. */
export async function runScheduledMaintenance(): Promise<void> {
  try {
    const settings = await getSettings()
    if (settings.role !== 'publisher') return
    const holder = 'la tâche planifiée'
    const { service } = await createCommandRuntime({ holder, launcher: maintenanceLauncher() })
    const records = await runMaintenance({ due: true }, { service, lock: maintenanceLock(holder) })
    if (settings.maintenanceClaude) await analyzeFailures(records)
    const summary = summarize(records)
    if (summary) await notify(summary)
  } catch (err) {
    // Un autre passage en cours (fenêtre, ligne de commande) : rien à signaler.
    if (!/^Patiente/.test(describeError(err))) await notify(`Le passage automatique n’a pas pu se faire : ${describeError(err)}`)
  } finally {
    app.quit()
  }
}

let runController: AbortController | null = null

/** Arrête un passage lancé depuis la fenêtre (fermeture de la fenêtre). */
export function stopMaintenance(): void {
  runController?.abort()
}

/** Canaux `maintenance:*` de la vue Studio. */
export function registerMaintenanceIpc(service: () => StudioService, window: () => BrowserWindow | null): void {
  const lock = maintenanceLock('l’application')
  const send = (channel: string, payload: unknown) => {
    const win = window()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }
  const options = (signal?: AbortSignal): MaintenanceOptions => ({
    service: service(),
    lock,
    onStep: (text) => send('maintenance:progress', text),
    signal
  })
  const outcome = async <T>(run: () => Promise<T>) => {
    try {
      return { ok: true as const, ...(await run()) }
    } catch (err) {
      return { ok: false as const, error: describeError(err) }
    }
  }
  const packView = async (folder: string) => {
    const pack = (await service().overview()).packs.find((p) => p.folder === folder)
    if (!pack) throw new Error(`Le modpack ${folder} est introuvable.`)
    return pack
  }
  const task = () => (process.platform === 'win32' ? readMaintenanceTask(maintenanceLauncher()).catch(() => null) : Promise.resolve(null))

  ipcMain.handle('maintenance:status', async () => ({
    ...(await maintenanceStatus(service(), lock, await task())),
    claude: (await getSettings()).maintenanceClaude
  }))
  ipcMain.handle('maintenance:configure', (_e, folder: string, changes: Partial<PackUpdates>) =>
    outcome(async () => ({ updates: await service().updatePackUpdates(folder, changes ?? {}) }))
  )
  ipcMain.handle('maintenance:run', (_e, folders: string[]) =>
    outcome(async () => {
      runController = new AbortController()
      try {
        const records = await runMaintenance({ folders }, options(runController.signal))
        if ((await getSettings()).maintenanceClaude) await analyzeFailures(records)
        return { records }
      } finally {
        runController = null
      }
    })
  )
  ipcMain.handle('maintenance:cancel', () => runController?.abort())
  ipcMain.handle('maintenance:validate', (_e, folder: string, publish: boolean) =>
    outcome(async () => ({ record: await finishPending(await packView(folder), publish === true, options()) }))
  )
  ipcMain.handle('maintenance:discard', (_e, folder: string) =>
    outcome(async () => ({ record: await discardPending(await packView(folder), options()) }))
  )
  ipcMain.handle('maintenance:schedule', (_e, schedule: { time: string; wake: boolean } | null) =>
    outcome(async () => {
      if (schedule) await installMaintenanceTask(maintenanceLauncher(), { time: String(schedule.time), wake: schedule.wake === true })
      else await removeMaintenanceTask()
      return { task: await readMaintenanceTask(maintenanceLauncher()) }
    })
  )
  ipcMain.handle('maintenance:setClaude', async (_e, enabled: boolean) => {
    await updateSettings({ maintenanceClaude: enabled === true })
  })
}

/** Un passage tourne-t-il (dans n'importe quel processus) ? La mise à jour de l'application l'attend. */
export function maintenanceTask(): string | null {
  const info = maintenanceLock('l’application').currentSync()
  return info ? `${info.operation} (${info.holder})` : null
}
