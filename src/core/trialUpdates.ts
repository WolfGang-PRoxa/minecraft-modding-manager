// Mise à jour d'un profil en deux temps : les mises à jour sont appliquées à une copie d'essai (« <profil> (essai) »),
// que le publieur (ou Claude) teste ; une fois validée, ses changements sont reportés dans le profil d'origine, dont
// les mondes, les réglages et les choix (mods désactivés) restent ceux du publieur.
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { CURSEFORGE_INSTANCE_FILE, TRIAL_PROFILE_SUFFIX } from '../shared/config'
import type { AddonKind, TrialResult, UpdatePlan } from '../shared/studio'
import { ADDON_FOLDERS, addAddon, replaceAddonFile, type Download } from './addonFiles'
import type { CfFile, CfMod } from './curseforgeApi'
import { pathExists, readJson, renameWithRetry, writeJsonAtomic } from './fsutil'
import { StudioError } from './studio/analyze'
import { createTrialCopy } from './trialProfile'
import { installedAddons } from './updates'

type Json = Record<string, unknown>

export const trialPathOf = (profilePath: string) => join(dirname(profilePath), `${basename(profilePath)}${TRIAL_PROFILE_SUFFIX}`)

async function readInstance(profilePath: string): Promise<Json> {
  try {
    return JSON.parse((await readFile(join(profilePath, CURSEFORGE_INSTANCE_FILE), 'utf8')).replace(/^﻿/, '')) as Json
  } catch {
    throw new StudioError(`${basename(profilePath)} n’est pas un profil CurseForge lisible.`)
  }
}

/** Ce dont l'essai a besoin de CurseForge : les fichiers, les projets ajoutés, et le téléchargement. */
export interface TrialSource {
  getFiles(ids: number[]): Promise<CfFile[]>
  getMods(ids: number[]): Promise<CfMod[]>
  download: Download
}

/**
 * Crée la copie d'essai du profil et y applique les mises à jour du plan (toutes, ou celles des projets `only`).
 * Le profil d'origine n'est pas touché.
 */
export async function applyToTrial(
  plan: UpdatePlan,
  source: TrialSource,
  options: { only?: number[]; onProgress?: (done: number, total: number, name: string) => void } = {}
): Promise<TrialResult> {
  const updates = options.only ? plan.updates.filter((u) => options.only!.includes(u.projectId)) : plan.updates
  if (!updates.length) throw new StudioError('Aucune mise à jour à appliquer.')
  const trialPath = trialPathOf(plan.profilePath)
  if (await pathExists(trialPath)) {
    throw new StudioError(`L’essai « ${basename(trialPath)} » existe déjà : valide-le ou abandonne-le avant d’en créer un autre.`)
  }
  await createTrialCopy(plan.profilePath, basename(trialPath))
  const instance = await readInstance(trialPath)
  const files = new Map((await source.getFiles(updates.map((u) => u.to.fileId))).map((f) => [f.id, f]))
  const added = updates.filter((u) => !u.from)
  const mods = new Map(added.length ? (await source.getMods(added.map((u) => u.projectId))).map((m) => [m.id, m]) : [])

  const result: TrialResult = { trialPath, applied: [], skipped: [] }
  for (const [i, update] of updates.entries()) {
    options.onProgress?.(i, updates.length, update.name)
    const file = files.get(update.to.fileId)
    try {
      if (!file) throw new StudioError('fichier introuvable sur CurseForge')
      if (!file.downloadUrl) throw new StudioError('son auteur n’autorise le téléchargement que depuis CurseForge')
      if (update.from) await replaceAddonFile(trialPath, instance, update.projectId, update.kind, file as CfFile & Json, source.download)
      else {
        const mod = mods.get(update.projectId)
        if (!mod) throw new StudioError('projet introuvable sur CurseForge')
        await addAddon(trialPath, instance, mod, update.kind, file as CfFile & Json, source.download)
      }
      result.applied.push(update)
    } catch (err) {
      result.skipped.push({ update, reason: err instanceof Error ? err.message : String(err) })
    }
  }
  options.onProgress?.(updates.length, updates.length, '')
  await writeJsonAtomic(join(trialPath, CURSEFORGE_INSTANCE_FILE), instance)
  return result
}

const kindOf = (entry: Json): AddonKind =>
  installedAddons({ installedAddons: [entry] })[0]?.kind ?? 'mod'

/** Dossier de travail du report, dans l'essai : même disque que le profil, mis à la corbeille avec l'essai. */
export const PROMOTE_WORK_DIR = '.report-en-cours'

/** Déplacement d'un fichier (remplacé dans les tests pour simuler un fichier verrouillé). */
type Move = (from: string, to: string) => Promise<void>

/**
 * Journal du report, réécrit avant chaque déplacement : un report interrompu (processus tué) est défait au report
 * suivant. `instance` : copie de `minecraftinstance.json` d'avant le report.
 */
interface PromoteLog {
  committed: boolean
  moves: Array<{ from: string; to: string }>
  instance?: string
}

/** Remet le profil comme avant le report : déplacements défaits du dernier au premier, puis l'ancien fichier d'instance. */
async function undoPromote(profilePath: string, log: PromoteLog, move: Move): Promise<void> {
  for (const { from, to } of [...log.moves].reverse()) {
    if (await pathExists(to)) await move(to, from)
  }
  if (log.instance && (await pathExists(log.instance))) await move(log.instance, join(profilePath, CURSEFORGE_INSTANCE_FILE))
}

/** Défait un report resté inachevé (journal non validé), puis efface son dossier de travail. */
async function recoverPromote(profilePath: string, work: string, move: Move): Promise<void> {
  if (!(await pathExists(work))) return
  const log = await readJson<PromoteLog>(join(work, 'journal.json'))
  if (log && !log.committed) await undoPromote(profilePath, log, move)
  await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

const isBusy = (err: unknown) => ['EBUSY', 'EPERM', 'EACCES'].includes(String((err as NodeJS.ErrnoException)?.code))

function busyMessage(err: unknown, profileName: string): string {
  const path = (err as NodeJS.ErrnoException).path
  const what = path ? `« ${basename(path)} » est utilisé par un autre programme` : 'Un fichier est utilisé par un autre programme'
  return `${what} (CurseForge, Minecraft, antivirus ?) : report annulé, ${profileName} est resté comme avant. Réessaie dans un instant.`
}

/**
 * Reporte dans le profil d'origine les fichiers que l'essai a changés ou ajoutés (pris dans l'essai, sans les
 * retélécharger), en gardant l'état actif / désactivé choisi dans l'original. À faire CurseForge fermé (l'appelant
 * s'en charge). Renvoie les noms des projets reportés.
 *
 * Tout ou rien : les fichiers sont d'abord copiés dans l'essai (l'original n'est pas touché), puis mis en place par
 * renommages (réessayés si un fichier est verrouillé un instant), les fichiers remplacés étant mis de côté dans
 * l'essai ; `minecraftinstance.json` est écrit en dernier. Au moindre échec, tout est remis comme avant.
 */
export async function promoteTrial(profilePath: string, options: { move?: Move } = {}): Promise<string[]> {
  const move: Move = options.move ?? ((from, to) => renameWithRetry(from, to))
  const trialPath = trialPathOf(profilePath)
  if (!(await pathExists(trialPath))) throw new StudioError(`Pas d’essai pour ${basename(profilePath)}.`)
  const work = join(trialPath, PROMOTE_WORK_DIR)
  await recoverPromote(profilePath, work, move)
  const [original, trial] = await Promise.all([readInstance(profilePath), readInstance(trialPath)])
  const originals = (original.installedAddons as Json[] | undefined) ?? []
  const changed: string[] = []
  const placements: Array<{ source: string; staged: string; destination: string; vacate: string[] }> = []

  for (const entry of (trial.installedAddons as Json[] | undefined) ?? []) {
    const fileId = Number((entry.installedFile as Json | undefined)?.id)
    const current = originals.find((a) => Number(a.addonID) === Number(entry.addonID))
    if (current && Number((current.installedFile as Json | undefined)?.id) === fileId) continue
    const kind = kindOf(entry)
    const folder = join(profilePath, ADDON_FOLDERS[kind])
    const fileName = String((entry.installedFile as Json).fileName)
    const enabled = current ? current.isEnabled !== false : entry.isEnabled !== false
    const onDisk = enabled ? fileName : `${fileName}.disabled`
    const previous = current && typeof current.fileNameOnDisk === 'string' ? current.fileNameOnDisk : null
    // L'ancien fichier, et ce qui occuperait déjà la place du nouveau (reste d'un report interrompu, fichier posé à la main).
    const vacate = [...new Map([previous, onDisk].filter((n): n is string => Boolean(n)).map((n) => [n.toLowerCase(), join(folder, n)])).values()]
    placements.push({
      source: join(trialPath, ADDON_FOLDERS[kind], String(entry.fileNameOnDisk)),
      staged: join(work, 'nouveaux', String(placements.length)),
      destination: join(folder, onDisk),
      vacate
    })

    const target = current ?? { ...structuredClone(entry), instanceID: randomUUID(), gameInstanceID: original.guid }
    target.installedFile = structuredClone(entry.installedFile)
    target.fileNameOnDisk = onDisk
    target.isEnabled = enabled
    target.filePaths = [join(folder, onDisk)]
    target.modFolderPath = folder
    target.dateUpdated = new Date().toISOString()
    if (!current) originals.push(target)
    changed.push(String(entry.name))
  }
  if (!placements.length) return changed
  original.installedAddons = originals
  const profileName = basename(profilePath)

  // 1. Copies dans l'essai : rien n'est encore touché dans l'original.
  try {
    await mkdir(join(work, 'nouveaux'), { recursive: true })
    await mkdir(join(work, 'anciens'), { recursive: true })
    for (const p of placements) await copyFile(p.source, p.staged)
    await writeFile(join(work, CURSEFORGE_INSTANCE_FILE), JSON.stringify(original, null, 2), 'utf8')
  } catch (err) {
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
    throw isBusy(err) ? new StudioError(busyMessage(err, profileName)) : err
  }

  // 2. Mise en place, journalisée pour être défaite.
  const log: PromoteLog = { committed: false, moves: [] }
  const saveLog = () => writeFile(join(work, 'journal.json'), JSON.stringify(log), 'utf8')
  const record = async (from: string, to: string) => {
    log.moves.push({ from, to })
    await saveLog()
    await move(from, to)
  }
  try {
    let aside = 0
    for (const p of placements) {
      for (const path of p.vacate) if (await pathExists(path)) await record(path, join(work, 'anciens', String(aside++)))
      await mkdir(dirname(p.destination), { recursive: true })
      await record(p.staged, p.destination)
    }
    const instanceFile = join(profilePath, CURSEFORGE_INSTANCE_FILE)
    log.instance = join(work, `${CURSEFORGE_INSTANCE_FILE}.avant`)
    await copyFile(instanceFile, log.instance)
    await saveLog()
    await move(join(work, CURSEFORGE_INSTANCE_FILE), instanceFile)
  } catch (err) {
    try {
      await undoPromote(profilePath, log, move)
    } catch {
      throw new StudioError(
        `Le report dans ${profileName} a échoué (${err instanceof Error ? err.message : String(err)}) et n’a pas pu être défait entièrement. Ferme CurseForge et Minecraft, puis relance le report : il remettra d’abord le profil comme avant.`
      )
    }
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
    throw isBusy(err) ? new StudioError(busyMessage(err, profileName)) : err
  }
  log.committed = true
  await saveLog()
  return changed
}
