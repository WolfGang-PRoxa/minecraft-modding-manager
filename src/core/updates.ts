// Recherche des mises à jour d'un profil CurseForge : pour chaque mod, pack de textures ou shader installé depuis
// CurseForge, le fichier le plus récent pour la même version de Minecraft et le même chargeur, plus les dépendances
// obligatoires qui manqueraient. Lecture seule : rien n'est téléchargé ni modifié ici.
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { AddonFileRef, AddonKind, UpdateChannel, UpdatePlan } from '../shared/studio'
import { CURSEFORGE_INSTANCE_FILE } from '../shared/config'
import { CLASS_IDS, LOADER_TYPES, REQUIRED_DEPENDENCY, type CfFile, type CfMod, type CurseForgeClient } from './curseforgeApi'
import { baseModFile } from './instanceAddons'
import { StudioError } from './studio/analyze'

const KIND_BY_CLASS = new Map<number, AddonKind>(Object.entries(CLASS_IDS).map(([kind, id]) => [id, kind as AddonKind]))

export interface InstalledAddon {
  projectId: number
  name: string
  kind: AddonKind
  file: AddonFileRef
  /** Versions de Minecraft annoncées par le fichier installé. */
  gameVersions: string[]
  enabled: boolean
}

type Json = Record<string, unknown>

/** Les projets CurseForge d'un minecraftinstance.json (installedAddons), avec leur fichier installé. */
export function installedAddons(instance: unknown): InstalledAddon[] {
  const list = (instance as { installedAddons?: unknown })?.installedAddons
  if (!Array.isArray(list)) return []
  const addons: InstalledAddon[] = []
  for (const addon of list as Json[]) {
    const projectId = Number(addon?.addonID)
    const file = addon?.installedFile as Json | undefined
    const fileId = Number(file?.id)
    if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(fileId) || fileId <= 0) continue
    const classId = Number(addon.categoryClassID)
    addons.push({
      projectId,
      name: typeof addon.name === 'string' && addon.name ? addon.name : `Projet ${projectId}`,
      // Les anciennes entrées n'ont pas toujours la catégorie : ce sont des mods.
      kind: KIND_BY_CLASS.get(classId) ?? 'mod',
      file: {
        fileId,
        fileName: typeof file?.fileName === 'string' ? file.fileName : '',
        date: typeof file?.fileDate === 'string' ? file.fileDate : null,
        releaseType: Number(file?.releaseType) || 1
      },
      gameVersions: Array.isArray(file?.gameVersion) ? (file.gameVersion as unknown[]).filter((v): v is string => typeof v === 'string') : [],
      enabled: addon.isEnabled !== false
    })
  }
  return addons
}

/** ModLoaderType de l'API d'après le chargeur écrit par CurseForge (« neoforge-21.1.215 »), ou null. */
export function loaderType(modLoader: string | null): number | null {
  const name = /^(neoforge|forge|fabric|quilt)/i.exec(modLoader ?? '')?.[1].toLowerCase() as keyof typeof LOADER_TYPES | undefined
  return name ? LOADER_TYPES[name] : null
}

const maxReleaseType = (channel: UpdateChannel) => (channel === 'beta' ? 2 : 1)

/**
 * Le fichier le plus récent qui convient au profil, d'après les index de fichiers du projet (le plus grand
 * identifiant est le plus récent), ou null. Un mod doit viser la version de Minecraft et le chargeur du profil (Quilt
 * accepte aussi les mods Fabric). Packs de textures et shaders : pas de chargeur ; et comme beaucoup n'indiquent pas
 * toutes les versions qu'ils supportent, un projet dont le fichier installé ne cite pas la version du profil peut
 * passer à son dernier fichier, quelle que soit la version citée.
 */
export function bestFileIndex(
  mod: Pick<CfMod, 'latestFilesIndexes'>,
  addon: Pick<InstalledAddon, 'kind' | 'gameVersions'>,
  minecraftVersion: string,
  loader: number | null,
  channel: UpdateChannel
): { fileId: number; filename: string; releaseType: number } | null {
  const allowed = mod.latestFilesIndexes.filter((index) => index.releaseType <= maxReleaseType(channel))
  let candidates = allowed.filter((index) => index.gameVersion === minecraftVersion)
  if (addon.kind === 'mod') {
    const loaders = loader === LOADER_TYPES.quilt ? [LOADER_TYPES.quilt, LOADER_TYPES.fabric] : [loader]
    candidates = candidates.filter((index) => loaders.includes(index.modLoader ?? -1))
  } else if (!candidates.length && !addon.gameVersions.includes(minecraftVersion)) {
    candidates = allowed
  }
  return candidates.reduce<CfFileIndex | null>((best, index) => (!best || index.fileId > best.fileId ? index : best), null)
}

type CfFileIndex = CfMod['latestFilesIndexes'][number]

const fileRef = (file: CfFile): AddonFileRef => ({
  fileId: file.id,
  fileName: file.fileName,
  date: file.fileDate ?? null,
  releaseType: file.releaseType
})

/** Fichiers du dossier mods qu'aucun projet CurseForge du profil ne décrit (posés à la main). */
async function untrackedMods(profilePath: string, instance: unknown): Promise<string[]> {
  const known = new Set<string>()
  for (const addon of ((instance as { installedAddons?: Json[] })?.installedAddons ?? []) as Json[]) {
    const file = addon?.installedFile as Json | undefined
    for (const name of [addon?.fileNameOnDisk, file?.fileName, file?.fileNameOnDisk]) {
      if (typeof name === 'string') known.add(baseModFile(name).toLowerCase())
    }
  }
  const names = await readdir(join(profilePath, 'mods')).catch(() => [] as string[])
  return names.filter((n) => /\.jar(\.disabled)?$/i.test(n) && !known.has(baseModFile(n).toLowerCase())).sort()
}

export interface CheckOptions {
  channel?: UpdateChannel
  /** Projets CurseForge à ne jamais mettre à jour. */
  pinned?: number[]
}

/** Ce qu'une mise à jour du profil changerait. */
export async function checkUpdates(profilePath: string, client: CurseForgeClient, options: CheckOptions = {}): Promise<UpdatePlan> {
  const channel = options.channel ?? 'release'
  const pinned = new Set(options.pinned ?? [])
  let instance: Json
  try {
    instance = JSON.parse((await readFile(join(profilePath, CURSEFORGE_INSTANCE_FILE), 'utf8')).replace(/^﻿/, '')) as Json
  } catch {
    throw new StudioError(`${profilePath} n’est pas un profil CurseForge lisible.`)
  }
  const minecraftVersion = typeof instance.gameVersion === 'string' ? instance.gameVersion : null
  if (!minecraftVersion) throw new StudioError('Ce profil n’indique pas sa version de Minecraft.')
  const modLoader = ((instance.baseModLoader as Json | null)?.name as string | undefined) ?? null
  const loader = loaderType(modLoader)

  const addons = installedAddons(instance)
  const plan: UpdatePlan = {
    profile: basename(profilePath),
    profilePath,
    minecraftVersion,
    modLoader,
    channel,
    checked: 0,
    updates: [],
    pinned: addons.filter((a) => pinned.has(a.projectId)).map((a) => a.name),
    untracked: await untrackedMods(profilePath, instance),
    warnings: []
  }
  const tracked = addons.filter((a) => !pinned.has(a.projectId))
  if (!tracked.length) return plan
  if (loader === null && tracked.some((a) => a.kind === 'mod')) {
    plan.warnings.push(`Chargeur inconnu (${modLoader ?? 'aucun'}) : les mods ne sont pas vérifiés.`)
  }

  const mods = new Map((await client.getMods(tracked.map((a) => a.projectId))).map((m) => [m.id, m]))
  plan.checked = tracked.length
  const chosen = new Map<number, { addon: InstalledAddon | null; mod: CfMod; fileId: number; requiredBy: Set<string> }>()
  for (const addon of tracked) {
    const mod = mods.get(addon.projectId)
    if (!mod || !mod.isAvailable) {
      plan.warnings.push(`${addon.name} n’est plus disponible sur CurseForge : il reste tel quel.`)
      continue
    }
    if (addon.kind === 'mod' && loader === null) continue
    const best = bestFileIndex(mod, addon, minecraftVersion, loader, channel)
    if (best && best.fileId > addon.file.fileId) chosen.set(addon.projectId, { addon, mod, fileId: best.fileId, requiredBy: new Set() })
  }

  // Dépendances obligatoires des nouveaux fichiers, absentes du profil : ajoutées, en remontant leurs propres
  // dépendances (quelques tours suffisent).
  const present = new Set(addons.map((a) => a.projectId))
  const files = new Map<number, CfFile>()
  for (let round = 0; round < 4; round++) {
    const pending = [...chosen.values()].filter((c) => !files.has(c.fileId))
    if (!pending.length) break
    for (const file of await client.getFiles(pending.map((c) => c.fileId))) files.set(file.id, file)
    const missing = new Map<number, Set<string>>()
    for (const c of pending) {
      for (const dep of files.get(c.fileId)?.dependencies ?? []) {
        if (dep.relationType !== REQUIRED_DEPENDENCY || present.has(dep.modId) || chosen.has(dep.modId)) continue
        missing.set(dep.modId, (missing.get(dep.modId) ?? new Set()).add(c.mod.name))
      }
    }
    if (!missing.size) break
    for (const mod of await client.getMods([...missing.keys()])) {
      const requiredBy = missing.get(mod.id)!
      const best = mod.isAvailable ? bestFileIndex(mod, { kind: 'mod', gameVersions: [] }, minecraftVersion, loader, channel) : null
      if (!best) {
        plan.warnings.push(`${[...requiredBy].join(', ')} demande ${mod.name}, introuvable pour Minecraft ${minecraftVersion} : la mise à jour de ${[...requiredBy].join(', ')} est déconseillée.`)
        continue
      }
      chosen.set(mod.id, { addon: null, mod, fileId: best.fileId, requiredBy })
    }
  }

  const unfetched = [...chosen.values()].filter((c) => !files.has(c.fileId)).map((c) => c.fileId)
  if (unfetched.length) for (const file of await client.getFiles(unfetched)) files.set(file.id, file)

  for (const c of chosen.values()) {
    const file = files.get(c.fileId)
    if (!file) continue
    if (!file.isAvailable || !file.downloadUrl) {
      plan.warnings.push(`${c.mod.name} : le fichier ${file.fileName} ne peut pas être téléchargé hors de CurseForge.`)
    }
    plan.updates.push({
      projectId: c.mod.id,
      name: c.mod.name,
      kind: c.addon?.kind ?? 'mod',
      from: c.addon?.file ?? null,
      to: fileRef(file),
      requiredBy: [...c.requiredBy].sort(),
      url: c.mod.links?.websiteUrl ?? null
    })
  }
  plan.updates.sort((a, b) => Number(a.from === null) - Number(b.from === null) || a.name.localeCompare(b.name, 'fr'))
  return plan
}
