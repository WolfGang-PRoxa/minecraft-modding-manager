import { app } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { APP_TEMP_DIR } from '../shared/config'
import { compareVersions } from '../shared/releases'
import type { AppUpdateInfo, AppUpdateProgress, AppUpdateResult } from '../shared/types'
import { downloadFile } from './download'
import { pathExists, removeQuietly, renameWithRetry } from '../core/fsutil'
import { downloadDifferential, parseBlockMap, planDifferential } from '../core/differentialDownload'
import { migrateLocalDataDir } from '../core/previousIdentity'
import { getCatalog } from './github'
import { getSettings, updateSettings } from '../core/settings'
import { BACKGROUND_SWITCH, MINIMIZED_SWITCH } from './startup'

const INSTALLER_PREFIX = 'Modding-Manager-Setup-'
/** Où les versions jusqu'à la 2.3.1 téléchargeaient l'installeur. */
const legacyDownloadDir = () => join(app.getPath('temp'), APP_TEMP_DIR)
/**
 * Les installeurs téléchargés, dans %LOCALAPPDATA%\Modding Manager\mises-a-jour. Celui de la version qui tourne y
 * reste : la mise à jour suivante en recopie tout ce qui n'a pas changé, et ne télécharge que le reste.
 */
const downloadDir = () =>
  join(migrateLocalDataDir(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')), 'mises-a-jour')
const safeVersion = (version: string) => version.replace(/[^\w.+-]/g, '_')
const installerName = (version: string) => `${INSTALLER_PREFIX}${safeVersion(version)}.exe`
/** Au-delà de cette part du nouvel installeur à télécharger, autant le télécharger en entier. */
const MAX_DIFFERENTIAL_SHARE = 0.8

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
 * La version proposée s'installe-t-elle d'elle-même à ce lancement (réglage autoUpdate) ? Pas juste après une mise à
 * jour, qui ne doit pas pouvoir se relancer en boucle. Seulement depuis l'application installée, ou en développement
 * avec un faux serveur (MM_GITHUB_API) : depuis le dépôt, le vrai installeur remplacerait l'installation réelle.
 */
export function autoUpdateOnLaunch(enabled: boolean, justUpdated: boolean): boolean {
  return enabled && !justUpdated && (app.isPackaged || Boolean(process.env.MM_GITHUB_API))
}

const isInstallerFile = (name: string) => name.startsWith(INSTALLER_PREFIX) && /\.exe(\.part)?$/i.test(name)

/**
 * Supprime, sans retarder le démarrage, les installeurs laissés par les mises à jour précédentes, sauf celui de la
 * version qui tourne, gardé pour la prochaine mise à jour différentielle. Celui qu'une version jusqu'à la 2.3.1 a
 * téléchargé dans %TEMP% est d'abord rangé avec les autres. Un installeur qui vient de relancer l'application peut
 * encore tourner : s'il reste verrouillé, il partira au lancement suivant.
 */
export function cleanAppUpdateDownloads(): void {
  cleaning = (async () => {
    const keep = installerName(app.getVersion())
    const dir = downloadDir()
    const legacy = legacyDownloadDir()
    const legacyNames = (await readdir(legacy).catch(() => [] as string[])).filter(isInstallerFile)
    if (legacyNames.includes(keep) && !(await pathExists(join(dir, keep)))) {
      await mkdir(dir, { recursive: true })
        .then(() => renameWithRetry(join(legacy, keep), join(dir, keep), 2))
        // Sur un autre disque, ou encore ouvert : recopié (il est vérifié avant de servir).
        .catch(() => copyFile(join(legacy, keep), join(dir, keep)))
        .catch(() => removeQuietly(join(dir, keep)))
    }
    await Promise.all(legacyNames.map((name) => removeQuietly(join(legacy, name))))
    const names = (await readdir(dir).catch(() => [] as string[])).filter(isInstallerFile)
    await Promise.all(names.filter((name) => name !== keep).map((name) => removeQuietly(join(dir, name))))
  })().catch(() => {})
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

async function fetchBlockMap(url: string, signal: AbortSignal) {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent() }, redirect: 'follow', signal })
  if (!res.ok) throw new Error(`Blockmap indisponible (HTTP ${res.status}).`)
  return parseBlockMap(Buffer.from(await res.arrayBuffer()))
}

const userAgent = () => `ModdingManager/${app.getVersion()}`

/**
 * Mise à jour différentielle : l'installeur gardé de la version qui tourne, vérifié, fournit tous les blocs qui
 * n'ont pas changé, et seuls les autres sont téléchargés. Renvoie false si ce n'est pas possible ou pas rentable
 * (pas d'installeur gardé, pas de blockmap, trop de changements) ; toute erreur fait télécharger l'installeur entier.
 */
async function downloadChangedBlocks(
  update: AppUpdateInfo,
  destination: string,
  signal: AbortSignal,
  onProgress: (progress: AppUpdateProgress) => void
): Promise<{ sha256: string; size: number } | null> {
  const differential = update.differential
  if (!differential || differential.baseVersion !== app.getVersion()) return null
  const baseFile = join(downloadDir(), installerName(differential.baseVersion))
  if (!(await pathExists(baseFile))) return null
  try {
    if ((await sha256Of(baseFile)) !== differential.baseSha256) {
      await removeQuietly(baseFile)
      return null
    }
    const [oldMap, newMap] = await Promise.all([
      fetchBlockMap(differential.baseBlockmapUrl, signal),
      fetchBlockMap(differential.blockmapUrl, signal)
    ])
    const plan = planDifferential(oldMap, newMap)
    if (plan.size !== update.installerSize || plan.downloadSize > plan.size * MAX_DIFFERENTIAL_SHARE) return null
    onProgress({ phase: 'downloading', done: 0, total: plan.downloadSize })
    return await downloadDifferential({
      baseFile,
      url: update.installerUrl,
      destination,
      plan,
      userAgent: userAgent(),
      signal,
      onProgress: ({ done, total }) => onProgress({ phase: 'downloading', done, total })
    })
  } catch (err) {
    if (signal.aborted) throw err
    console.warn('Mise à jour différentielle impossible, téléchargement complet :', err)
    return null
  }
}

function describeError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === 'ENOSPC') return 'Espace disque insuffisant pour télécharger la mise à jour.'
  if (err instanceof TypeError) return 'Connexion à GitHub interrompue. Vérifie ta connexion internet.'
  return err instanceof Error ? err.message : String(err)
}

/** Lance l'installeur détaché de l'application (il doit lui survivre) et attend qu'il ait bien démarré. */
function launchInstaller(path: string, relaunch: 'background' | 'minimized' | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = (err: unknown) =>
      reject(new Error(`L’installeur n’a pas pu être lancé (${err instanceof Error ? err.message : String(err)}).`))
    try {
      // --updated : l'installeur sait qu'il s'agit d'une mise à jour demandée par l'application. Il ne pose
      // alors aucune question (application déjà installée, application en cours d'exécution) et la relance à la fin.
      // --background / --minimized : elle est relancée comme elle était, en arrière-plan ou réduite.
      const state = relaunch === 'background' ? [BACKGROUND_SWITCH] : relaunch === 'minimized' ? [MINIMIZED_SWITCH] : []
      const child = spawn(path, ['--updated', ...state], { detached: true, stdio: 'ignore' })
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
  /** L'application tourne en arrière-plan ou sa fenêtre est réduite : l'installeur la relance ainsi. */
  relaunch: () => 'background' | 'minimized' | null
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

    // Sans l'empreinte publiée par GitHub, l'installeur ne pourrait pas être vérifié : il n'est pas téléchargé.
    if (!update.installerSha256) {
      return failed('Cette mise à jour ne peut pas être vérifiée (empreinte absente sur GitHub). Le bouton « Télécharger depuis GitHub » permet de l’installer à la main.')
    }
    // Le numéro de version vient du tag de la release : on n'en garde que ce qui convient à un nom de fichier.
    const destination = join(downloadDir(), installerName(update.version))
    let downloaded = await downloadChangedBlocks(update, destination, signal, options.onProgress)
    if (downloaded && downloaded.sha256 !== update.installerSha256) {
      console.warn('Installeur assemblé différent de celui publié, téléchargement complet.')
      await removeQuietly(destination)
      downloaded = null
    }
    if (!downloaded) {
      options.onProgress({ phase: 'downloading', done: 0, total: update.installerSize })
      downloaded = await downloadFile({
        url: update.installerUrl,
        destination,
        expectedSize: update.installerSize,
        signal,
        onProgress: ({ done, total }) => options.onProgress({ phase: 'downloading', done, total })
      })
    }
    const { sha256, size } = downloaded
    if (sha256 !== update.installerSha256) {
      await removeQuietly(destination)
      return failed('L’installeur téléchargé ne correspond pas à celui publié sur GitHub. Réessaie.')
    }
    signal.throwIfAborted()

    options.onProgress({ phase: 'installing', done: size, total: size })
    await launchInstaller(destination, options.relaunch())
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
