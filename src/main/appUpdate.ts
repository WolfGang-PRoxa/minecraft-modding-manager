import { app } from 'electron'
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { compareVersions } from '../shared/releases'
import type { AppUpdateProgress, AppUpdateResult } from '../shared/types'
import { downloadFile } from './download'
import { removeQuietly } from './fsutil'
import { getCatalog } from './github'
import { getSettings, updateSettings } from './settings'

const INSTALLER_PREFIX = 'Modpack-Manager-Setup-'
const downloadDir = () => join(app.getPath('temp'), 'modpack-downloader')

// Posé du clic sur « Mettre à jour » jusqu'à la fermeture de l'application (ou l'échec de la mise à jour).
let controller: AbortController | null = null
let cleaning: Promise<void> = Promise.resolve()

/** « la mise à jour de l'application » tant qu'elle est en cours : rien d'autre ne doit alors démarrer. */
export function appUpdateTask(): string | null {
  return controller ? 'la mise à jour de l’application' : null
}

export function cancelAppUpdate(): void {
  controller?.abort()
}

/**
 * À appeler une fois au démarrage : retient la version lancée et dit si l'application vient d'être mise à jour
 * (relancée par l'installeur avec --updated, ou version plus récente qu'au lancement précédent), et depuis quelle
 * version : la page Nouveautés met en avant ce qui a changé depuis.
 */
export async function noteRunningVersion(): Promise<{ justUpdated: boolean; previousVersion: string | null }> {
  try {
    const current = app.getVersion()
    const { lastRunVersion: previous } = await getSettings()
    if (previous !== current) await updateSettings({ lastRunVersion: current })
    const newer = previous !== null && compareVersions(current, previous) > 0
    return { justUpdated: process.argv.includes('--updated') || newer, previousVersion: newer ? previous : null }
  } catch {
    return { justUpdated: false, previousVersion: null }
  }
}

/**
 * Supprime, sans retarder le démarrage, les installeurs laissés par les mises à jour précédentes. Celui qui vient
 * de relancer l'application peut encore tourner : s'il reste verrouillé, il partira au lancement suivant.
 */
export function cleanAppUpdateDownloads(): void {
  cleaning = (async () => {
    const names = await readdir(downloadDir()).catch(() => [] as string[])
    // Aussi ceux d'avant le changement de nom (Modpack-Downloader-Setup-…), dont celui qui a installé cette version.
    const installers = names.filter((name) => /^Modpack-(Manager|Downloader)-Setup-.*\.exe$/i.test(name))
    await Promise.all(installers.map((name) => removeQuietly(join(downloadDir(), name))))
  })()
}

function describeError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === 'ENOSPC') return 'Espace disque insuffisant pour télécharger la mise à jour.'
  if (err instanceof TypeError) return 'Connexion à GitHub interrompue. Vérifie ta connexion internet.'
  return err instanceof Error ? err.message : String(err)
}

/** Lance l'installeur détaché de l'application (il doit lui survivre) et attend qu'il ait bien démarré. */
function launchInstaller(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (err: unknown) =>
      reject(new Error(`L’installeur n’a pas pu être lancé (${err instanceof Error ? err.message : String(err)}).`))
    try {
      // --updated : l'installeur sait qu'il s'agit d'une mise à jour demandée par l'application. Il ne pose
      // alors aucune question (application déjà installée, application en cours d'exécution) et la relance à la fin.
      const child = spawn(path, ['--updated'], { detached: true, stdio: 'ignore' })
      child.once('error', fail)
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    } catch (err) {
      // Selon l'erreur, `spawn` la signale par l'événement `error` ou la lève tout de suite.
      fail(err)
    }
  })
}

/**
 * Télécharge l'installeur de la dernière version, vérifie son empreinte, le lance puis ferme l'application.
 * La version et l'adresse viennent des releases relues ici, jamais de la fenêtre.
 */
export async function installAppUpdate(options: {
  /** Opération en cours que le redémarrage interromprait (« la publication »…), sinon null. */
  busyWith: () => string | null
  onProgress: (progress: AppUpdateProgress) => void
}): Promise<AppUpdateResult> {
  const failed = (error: string): AppUpdateResult => ({ ok: false, reason: 'failed', error })
  if (controller) return { ok: false, reason: 'busy', error: 'La mise à jour est déjà en cours.' }
  const busy = options.busyWith()
  if (busy) return { ok: false, reason: 'busy', error: `Patiente : ${busy} est en cours.` }

  controller = new AbortController()
  const { signal } = controller
  let launched = false
  try {
    // Le ménage du démarrage ne doit pas emporter le fichier qu'on s'apprête à télécharger.
    const [{ appUpdate: update }] = await Promise.all([getCatalog(), cleaning])
    if (!update) return failed('L’application est déjà à jour.')
    signal.throwIfAborted()

    // Le numéro de version vient du tag de la release : on n'en garde que ce qui convient à un nom de fichier.
    const destination = join(downloadDir(), `${INSTALLER_PREFIX}${update.version.replace(/[^\w.+-]/g, '_')}.exe`)
    const { sha256, size } = await downloadFile({
      url: update.installerUrl,
      destination,
      expectedSize: update.installerSize,
      signal,
      onProgress: ({ done, total }) => options.onProgress({ phase: 'downloading', done, total })
    })
    if (update.installerSha256 && sha256 !== update.installerSha256) {
      await removeQuietly(destination)
      return failed('L’installeur téléchargé ne correspond pas à celui publié sur GitHub. Réessaie.')
    }
    signal.throwIfAborted()

    options.onProgress({ phase: 'installing', done: size, total: size })
    await launchInstaller(destination)
    launched = true
    // Le temps d'afficher l'étape, puis l'application se ferme : l'installeur attend sa fermeture.
    setTimeout(() => app.quit(), 500)
    return { ok: true }
  } catch (err) {
    if (signal.aborted) return { ok: false, reason: 'cancelled', error: 'Mise à jour annulée.' }
    return failed(describeError(err))
  } finally {
    // Installeur lancé : l'application va se fermer, plus rien ne doit démarrer d'ici là.
    if (!launched) controller = null
  }
}
