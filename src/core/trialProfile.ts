// Copie d'essai d'un profil CurseForge : un nouveau profil, à côté de l'original dans le dossier Instances, avec sa
// propre identité (guid), où appliquer et tester des mises à jour sans jamais toucher au profil du publieur.
import { randomUUID } from 'node:crypto'
import { cp, readFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import { CURSEFORGE_INSTANCE_FILE, INSTANCE_MARKER_FILE } from '../shared/config'
import { pathExists, writeJsonAtomic } from './fsutil'
import { applyInstanceGuid, writeCurseClientFile } from './instanceIdentity'
import { StudioError } from './studio/analyze'

type Json = Record<string, unknown>

/** Données de partie inutiles à un essai (journaux, plantages, captures). */
const SKIPPED = new Set(['logs', 'crash-reports', 'screenshots', INSTANCE_MARKER_FILE])

/** CurseForge écrit le dossier d'un profil avec une barre finale. */
const asInstallPath = (dir: string) => (dir.endsWith(sep) ? dir : dir + sep)

/** Remplace le dossier d'origine par celui de la copie au début d'un chemin. */
function moved(path: unknown, from: string, to: string): unknown {
  if (typeof path !== 'string') return path
  const rel = relative(from, path)
  return rel.startsWith('..') || rel === path ? path : join(to, rel)
}

/** Le minecraftinstance.json de la copie : nouvelle identité, nouveaux chemins, jamais lancée. */
export function trialInstance(source: Json, from: string, to: string): Json {
  const copy = structuredClone(source)
  applyInstanceGuid(copy, randomUUID())
  copy.name = basename(to)
  copy.installPath = asInstallPath(to)
  copy.lastPlayed = '0001-01-01T00:00:00'
  copy.playedCount = 0
  copy.timePlayed = 0
  for (const addon of (copy.installedAddons as Json[] | undefined) ?? []) {
    addon.instanceID = randomUUID()
    addon.modFolderPath = moved(addon.modFolderPath, from, to)
    if (Array.isArray(addon.filePaths)) addon.filePaths = addon.filePaths.map((p) => moved(p, from, to))
  }
  return copy
}

/** Copie un profil sous le nom donné (dans le même dossier Instances) et renvoie le dossier de la copie. */
export async function createTrialCopy(sourcePath: string, name: string): Promise<string> {
  const target = join(dirname(sourcePath), name)
  if (await pathExists(target)) throw new StudioError(`Le profil « ${name} » existe déjà.`)
  const sourceFile = join(sourcePath, CURSEFORGE_INSTANCE_FILE)
  let source: Json
  try {
    source = JSON.parse((await readFile(sourceFile, 'utf8')).replace(/^﻿/, '')) as Json
  } catch {
    throw new StudioError(`${sourcePath} n’est pas un profil CurseForge lisible.`)
  }
  // minecraftinstance.json en dernier : CurseForge ne voit le profil qu'une fois tout en place.
  await cp(sourcePath, target, {
    recursive: true,
    filter: (path) => {
      const rel = relative(sourcePath, path)
      const top = rel.split(sep)[0]
      return !SKIPPED.has(top) && rel !== CURSEFORGE_INSTANCE_FILE
    }
  })
  const instance = trialInstance(source, sourcePath, target)
  await writeCurseClientFile(target, instance.guid as string)
  await writeJsonAtomic(join(target, CURSEFORGE_INSTANCE_FILE), instance)
  return target
}
