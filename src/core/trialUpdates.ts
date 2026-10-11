// Mise à jour d'un profil en deux temps : les mises à jour sont appliquées à une copie d'essai (« <profil> (essai) »),
// que le publieur (ou Claude) teste ; une fois validée, ses changements sont reportés dans le profil d'origine, dont
// les mondes, les réglages et les choix (mods désactivés) restent ceux du publieur.
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { CURSEFORGE_INSTANCE_FILE, TRIAL_PROFILE_SUFFIX } from '../shared/config'
import type { AddonKind, TrialResult, UpdatePlan } from '../shared/studio'
import { ADDON_FOLDERS, addAddon, replaceAddonFile, type Download } from './addonFiles'
import type { CfFile, CfMod } from './curseforgeApi'
import { pathExists, writeJsonAtomic } from './fsutil'
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

/**
 * Reporte dans le profil d'origine les fichiers que l'essai a changés ou ajoutés (pris dans l'essai, sans les
 * retélécharger), en gardant l'état actif / désactivé choisi dans l'original. À faire CurseForge fermé (l'appelant
 * s'en charge). Renvoie les noms des projets reportés.
 */
export async function promoteTrial(profilePath: string): Promise<string[]> {
  const trialPath = trialPathOf(profilePath)
  if (!(await pathExists(trialPath))) throw new StudioError(`Pas d’essai pour ${basename(profilePath)}.`)
  const [original, trial] = await Promise.all([readInstance(profilePath), readInstance(trialPath)])
  const originals = (original.installedAddons as Json[] | undefined) ?? []
  const changed: string[] = []

  for (const entry of (trial.installedAddons as Json[] | undefined) ?? []) {
    const fileId = Number((entry.installedFile as Json | undefined)?.id)
    const current = originals.find((a) => Number(a.addonID) === Number(entry.addonID))
    if (current && Number((current.installedFile as Json | undefined)?.id) === fileId) continue
    const kind = kindOf(entry)
    const folder = join(profilePath, ADDON_FOLDERS[kind])
    const fileName = String((entry.installedFile as Json).fileName)
    const enabled = current ? current.isEnabled !== false : entry.isEnabled !== false
    const onDisk = enabled ? fileName : `${fileName}.disabled`
    await mkdir(folder, { recursive: true })
    await copyFile(join(trialPath, ADDON_FOLDERS[kind], String(entry.fileNameOnDisk)), join(folder, onDisk))

    const target = current ?? { ...structuredClone(entry), instanceID: randomUUID(), gameInstanceID: original.guid }
    const previous = current && typeof current.fileNameOnDisk === 'string' ? current.fileNameOnDisk : null
    if (previous && previous.toLowerCase() !== onDisk.toLowerCase()) await rm(join(folder, previous), { force: true })
    target.installedFile = structuredClone(entry.installedFile)
    target.fileNameOnDisk = onDisk
    target.isEnabled = enabled
    target.filePaths = [join(folder, onDisk)]
    target.modFolderPath = folder
    target.dateUpdated = new Date().toISOString()
    if (!current) originals.push(target)
    changed.push(String(entry.name))
  }
  original.installedAddons = originals
  await writeJsonAtomic(join(profilePath, CURSEFORGE_INSTANCE_FILE), original)
  return changed
}
