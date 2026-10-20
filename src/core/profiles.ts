// Les profils du dossier Instances de CurseForge et les dossiers où l'utilisateur les range. Seule lecture des
// minecraftinstance.json pour lister les profils : la bibliothèque (versions présentes), le Studio et les commandes
// passent par ici. Lecture seule : l'application n'écrit jamais dans ces fichiers de CurseForge.
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { CURSEFORGE_INSTANCE_FILE } from '../shared/config'
import type { CurseForgeGroup, CurseForgeProfile } from '../shared/types'
import { readJson } from './fsutil'
import { readInstanceMarker } from './previousIdentity'
import { isModJar, modsSignature } from './modsSignature'

/** Identifiant de Minecraft chez CurseForge (champ gameId des dossiers). */
const MINECRAFT_GAME_ID = 432

type InstanceFields = Pick<
  CurseForgeProfile,
  'guid' | 'groupId' | 'minecraftVersion' | 'modLoader' | 'lastPlayed' | 'curseforgeProjectId'
>

/**
 * minecraftinstance.json peut peser plusieurs Mo (un modpack de 500 mods) : on garde les champs utiles tant que le
 * fichier ne change pas (date et taille).
 */
const instanceCache = new Map<string, { key: string; fields: InstanceFields | null }>()

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)

async function instanceFields(dir: string): Promise<InstanceFields | null> {
  const file = join(dir, CURSEFORGE_INSTANCE_FILE)
  const info = await stat(file).catch(() => null)
  if (!info) return null
  const key = `${info.mtimeMs}|${info.size}`
  const cached = instanceCache.get(file)
  if (cached?.key === key) return cached.fields
  let fields: InstanceFields | null = null
  try {
    const json = JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, '')) as Record<string, unknown>
    const loader = json.baseModLoader as { name?: unknown } | null | undefined
    const lastPlayed = text(json.lastPlayed)
    const projectId = Number(json.projectID)
    fields = {
      guid: text(json.guid),
      groupId: text(json.groupId),
      minecraftVersion: text(json.gameVersion),
      modLoader: text(loader?.name),
      // CurseForge écrit 0001-01-01 pour un profil jamais lancé.
      lastPlayed: lastPlayed && !lastPlayed.startsWith('0001') ? lastPlayed : null,
      curseforgeProjectId: Number.isInteger(projectId) && projectId > 0 ? projectId : null
    }
  } catch {
    fields = null
  }
  instanceCache.set(file, { key, fields })
  return fields
}

/** Nombre de mods du profil et leur empreinte (modsSignature), null sans dossier mods. */
export async function modsOf(dir: string): Promise<{ count: number; signature: string | null } | null> {
  const modsDir = join(dir, 'mods')
  const entries = await readdir(modsDir, { withFileTypes: true }).catch(() => null)
  if (!entries) return null
  const jars = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isModJar(entry.name))
      .map(async (entry) => {
        const info = await stat(join(modsDir, entry.name)).catch(() => null)
        return info ? { name: entry.name, size: info.size } : null
      })
  )
  const found = jars.filter((jar) => jar !== null)
  return { count: found.length, signature: modsSignature(found) }
}

async function installedPack(dir: string): Promise<CurseForgeProfile['installedPack']> {
  const marker = await readInstanceMarker<{ id?: unknown; version?: unknown }>(dir)
  return typeof marker?.id === 'string' && typeof marker.version === 'string' ? { id: marker.id, version: marker.version } : null
}

/** Le profil CurseForge d'un dossier, ou null si ce n'en est pas un (pas de minecraftinstance.json lisible). */
export async function readProfile(path: string): Promise<CurseForgeProfile | null> {
  const fields = await instanceFields(path)
  if (!fields) return null
  const [mods, pack] = await Promise.all([modsOf(path), installedPack(path)])
  return {
    name: basename(path),
    path,
    modsSignature: mods?.signature ?? null,
    modCount: mods?.count ?? null,
    installedPack: pack,
    ...fields
  }
}

/**
 * Profils du dossier Instances (ceux qui ont un minecraftinstance.json), le plus récemment joué en premier. Relu à
 * chaque fois : hors premier passage, il ne s'agit que de lister des dossiers.
 */
export async function listProfiles(instancesDir: string): Promise<CurseForgeProfile[]> {
  const entries = await readdir(instancesDir, { withFileTypes: true }).catch(() => [])
  const profiles = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readProfile(join(instancesDir, entry.name)))
  )
  return profiles
    .filter((p): p is CurseForgeProfile => p !== null)
    .sort((a, b) => (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? '') || a.name.localeCompare(b.name, 'fr'))
}

/**
 * Où CurseForge garde ses dossiers de profils. Version Overwolf : constaté sur le PC du propriétaire. Application
 * autonome : emplacement supposé, à confirmer.
 */
export function groupsFiles(): string[] {
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const roaming = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  return [
    join(local, 'Overwolf', 'Curse', 'GameInstances', 'groups.json'),
    join(roaming, 'CurseForge', 'GameInstances', 'groups.json')
  ]
}

/** Les dossiers de profils Minecraft de CurseForge, par ordre alphabétique (aucun si le fichier est introuvable). */
export async function listGroups(files = groupsFiles()): Promise<CurseForgeGroup[]> {
  for (const file of files) {
    const data = await readJson<unknown>(file)
    if (!Array.isArray(data)) continue
    return data
      .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === 'object')
      .filter((g) => g.gameId === undefined || g.gameId === MINECRAFT_GAME_ID)
      .map((g) => ({ id: text(g.id), name: text(g.name) }))
      .filter((g): g is CurseForgeGroup => g.id !== null && g.name !== null)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  }
  return []
}
