// Les mods du Studio : un dossier par mod, qui contient ses .jar. Une version = les jars de même version déclarée
// (un par chargeur ou par version de Minecraft). Le dossier peut être lié à celui où le projet du mod dépose ses
// builds (`releases/`, `build/libs/`) : le Studio y prend les nouvelles versions.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { compareVersions } from '../../shared/releases'
import type { ModLoader } from '../../shared/content'
import { BUILTIN_IDS, readModJar, type LoaderPreference } from '../gameTests/modMetadata'
import { pathExists } from '../fsutil'
import { openEntry, openZip, readEntries } from '../zip'
import { describeError, StudioError } from './analyze'

export interface JarAnalysis {
  sha256: string
  sha1: string
  modId: string
  name: string | null
  description: string | null
  /** Version déclarée par le jar. */
  version: string
  loaders: ModLoader[]
  /** Versions de Minecraft que le jar déclare (vide si sa plage ne se résume pas à des versions précises). */
  minecraftVersions: string[]
  /** La plage telle qu'écrite dans le jar (`~26.3`, `[1.20.1,1.21)`). */
  minecraftRange: string | null
  side: 'client' | 'server' | 'both'
  /** Dépendances obligatoires, hors jeu, Java et chargeurs. */
  dependencies: string[]
}

export interface JarFile {
  fileName: string
  path: string
  size: number
  mtimeMs: number
}

export interface LocalJar extends JarFile {
  analysis: JarAnalysis | null
  error: string | null
}

export interface LocalModVersion {
  version: string
  /** Jars de cette version, analysés. */
  files: Array<LocalJar & { analysis: JarAnalysis }>
}

/** Fichiers de métadonnées de chaque chargeur, dans l'ordre où un jar multi-chargeurs est lu. */
const LOADER_FILES: Array<[ModLoader, string]> = [
  ['fabric', 'fabric.mod.json'],
  ['quilt', 'quilt.mod.json'],
  ['neoforge', 'META-INF/neoforge.mods.toml'],
  ['forge', 'META-INF/mods.toml']
]

async function hashes(file: string): Promise<{ sha256: string; sha1: string }> {
  const sha256 = createHash('sha256')
  const sha1 = createHash('sha1')
  for await (const chunk of createReadStream(file)) {
    sha256.update(chunk as Buffer)
    sha1.update(chunk as Buffer)
  }
  return { sha256: sha256.digest('hex'), sha1: sha1.digest('hex') }
}

/** Versions précises citées par une plage : `1.21.1`, `~26.3`, `^1.20`, `[1.20.1]`, `[1.20.1,1.20.2)`, ou une liste. */
export function minecraftVersionsOf(range: string | string[] | null): string[] {
  if (range === null) return []
  const parts = Array.isArray(range) ? range : [range]
  const versions: string[] = []
  for (const part of parts) {
    const text = part.trim()
    // Plage Maven de Forge : seule une plage fermée sur une version précise compte.
    const maven = /^\[([^,\]]+)(?:,\s*([^\])]*))?[\])]$/.exec(text)
    if (maven) {
      const low = maven[1].trim()
      const high = maven[2]?.trim()
      if (high === undefined || (high && nextPatch(low) === high)) versions.push(low)
      continue
    }
    for (const token of text.split(/\s+/)) {
      const match = /^[~^=]?(\d+(?:\.\d+)+)$/.exec(token)
      if (match) versions.push(match[1])
    }
  }
  return [...new Set(versions)]
}

/** `[1.20.1,1.20.2)` ne contient que la 1.20.1. */
function nextPatch(version: string): string | null {
  const parts = version.split('.').map(Number)
  if (parts.some((n) => !Number.isInteger(n))) return null
  parts[parts.length - 1]++
  return parts.join('.')
}

const memo = new Map<string, { size: number; mtimeMs: number; analysis: JarAnalysis }>()

/** Lit un jar de mod (mis en mémoire tant que sa taille et sa date ne changent pas). */
export async function analyzeJar(file: JarFile): Promise<JarAnalysis> {
  const known = memo.get(file.path)
  if (known && known.size === file.size && known.mtimeMs === file.mtimeMs) return known.analysis

  let names: Set<string>
  try {
    const zip = await openZip(file.path)
    try {
      names = new Set((await readEntries(zip)).map((e) => e.fileName))
    } finally {
      zip.close()
    }
  } catch {
    throw new StudioError('Ce fichier n’est pas un .jar lisible.')
  }
  const loaders = LOADER_FILES.filter(([, name]) => names.has(name)).map(([loader]) => loader)
  const prefer: LoaderPreference = loaders[0] === 'neoforge' ? 'neoforge' : loaders[0] === 'forge' ? 'forge' : 'fabric'
  const meta = await readModJar(file.path, prefer)
  const mod = meta?.mods[0]
  if (!meta || !mod) throw new StudioError('Ce jar ne déclare aucun mod (ni fabric.mod.json, ni mods.toml).')
  if (!mod.version) throw new StudioError(`Le mod « ${mod.id} » ne déclare pas sa version.`)
  const minecraft = mod.relations.find((r) => r.id === 'minecraft' && r.kind === 'required')?.versions ?? null
  const analysis: JarAnalysis = {
    ...(await hashes(file.path)),
    modId: mod.id,
    name: mod.name ?? null,
    description: mod.description ?? null,
    version: mod.version,
    loaders: [...new Set(loaders)],
    minecraftVersions: minecraftVersionsOf(minecraft),
    minecraftRange: minecraft === null ? null : Array.isArray(minecraft) ? minecraft.join(' || ') : minecraft,
    side: mod.side,
    dependencies: mod.requires.filter((id) => !BUILTIN_IDS.has(id))
  }
  memo.set(file.path, { size: file.size, mtimeMs: file.mtimeMs, analysis })
  return analysis
}

export async function listJars(dir: string): Promise<JarFile[]> {
  const jars: JarFile[] = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !/\.jar$/i.test(entry.name)) continue
    const path = join(dir, entry.name)
    const info = await stat(path).catch(() => null)
    if (info) jars.push({ fileName: entry.name, path, size: info.size, mtimeMs: info.mtimeMs })
  }
  return jars
}

async function analyzed(jars: JarFile[]): Promise<LocalJar[]> {
  const result: LocalJar[] = []
  for (const jar of jars) {
    try {
      result.push({ ...jar, analysis: await analyzeJar(jar), error: null })
    } catch (err) {
      result.push({ ...jar, analysis: null, error: describeError(err) })
    }
  }
  return result
}

const loaderKey = (analysis: JarAnalysis) => [...analysis.loaders].sort().join('+')

/**
 * Lit le dossier d'un mod. `modId` : identifiant attendu dans les jars (celui de pack.json), null pour l'accepter du
 * premier jar. Les erreurs bloquent la publication de tout le mod (on ne sait pas à quelle version appartient un jar
 * illisible) ; un jar en double est signalé.
 */
export async function scanModFolder(dir: string): Promise<{ versions: LocalModVersion[]; badJars: LocalJar[]; errors: string[] }> {
  const jars = await analyzed(await listJars(dir))
  const errors: string[] = []
  const badJars = jars.filter((j) => !j.analysis)
  const good = jars.filter((j): j is LocalJar & { analysis: JarAnalysis } => j.analysis !== null)

  const ids = [...new Set(good.map((j) => j.analysis.modId))]
  if (ids.length > 1) errors.push(`Ce dossier mélange plusieurs mods (${ids.join(', ')}) : un dossier par mod.`)
  if (badJars.length) errors.push(`${badJars.map((j) => j.fileName).join(', ')} : ${badJars.length > 1 ? 'illisibles' : 'illisible'} ou pas un mod. Retire ${badJars.length > 1 ? 'ces fichiers' : 'ce fichier'} du dossier.`)

  const byVersion = new Map<string, LocalModVersion>()
  for (const jar of good) {
    const entry = byVersion.get(jar.analysis.version) ?? { version: jar.analysis.version, files: [] }
    const twin = entry.files.find((f) => loaderKey(f.analysis) === loaderKey(jar.analysis) && f.analysis.minecraftVersions.join() === jar.analysis.minecraftVersions.join())
    if (twin) errors.push(`Deux jars pour la version ${jar.analysis.version} (${twin.fileName}, ${jar.fileName}) : n’en garde qu’un.`)
    else entry.files.push(jar)
    byVersion.set(jar.analysis.version, entry)
  }
  const versions = [...byVersion.values()].sort((a, b) => compareVersions(a.version, b.version))
  return { versions, badJars, errors }
}

/** Une version trouvée dans le dossier lié, pas encore dans le Studio. */
export interface SourceVersion {
  version: string
  files: Array<LocalJar & { analysis: JarAnalysis }>
}

/**
 * Versions du dossier lié, de la plus récente à la plus ancienne. Un même jar copié sous un autre nom
 * (`lma-latest.jar`) n'est compté qu'une fois, sous le nom qui cite sa version.
 */
export async function sourceVersions(sourceDir: string, modId: string | null): Promise<SourceVersion[]> {
  if (!(await pathExists(sourceDir))) throw new StudioError(`Le dossier lié ${sourceDir} est introuvable.`)
  const jars = (await analyzed(await listJars(sourceDir))).filter((j): j is LocalJar & { analysis: JarAnalysis } => j.analysis !== null)
  const bySha = new Map<string, LocalJar & { analysis: JarAnalysis }>()
  for (const jar of jars) {
    if (modId && jar.analysis.modId !== modId) continue
    const other = bySha.get(jar.analysis.sha256)
    const cites = (j: LocalJar & { analysis: JarAnalysis }) => j.fileName.includes(j.analysis.version.split('-')[0])
    if (!other || (cites(jar) && !cites(other)) || (cites(jar) === cites(other) && jar.fileName.length < other.fileName.length)) bySha.set(jar.analysis.sha256, jar)
  }
  const byVersion = new Map<string, SourceVersion>()
  for (const jar of bySha.values()) {
    const entry = byVersion.get(jar.analysis.version) ?? { version: jar.analysis.version, files: [] }
    entry.files.push(jar)
    byVersion.set(jar.analysis.version, entry)
  }
  return [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version))
}

/**
 * Icône déclarée par le jar (fabric.mod.json `icon`, mods.toml `logoFile`), écrite comme image du mod
 * (`cover.png` ou `cover.jpg`). Renvoie false si le jar n'en déclare pas de lisible.
 */
export async function extractModIcon(jarPath: string, dir: string): Promise<boolean> {
  const zip = await openZip(jarPath).catch(() => null)
  if (!zip) return false
  try {
    const entries = await readEntries(zip)
    const read = async (name: string) => {
      const entry = entries.find((e) => e.fileName === name)
      if (!entry) return null
      const chunks: Buffer[] = []
      for await (const chunk of await openEntry(zip, entry)) chunks.push(chunk as Buffer)
      return Buffer.concat(chunks)
    }
    let icon: string | null = null
    const fabric = await read('fabric.mod.json')
    if (fabric) {
      try {
        const value = (JSON.parse(fabric.toString('utf8').replace(/^﻿/, '')) as { icon?: unknown }).icon
        // Une icône par taille : la plus grande.
        if (typeof value === 'string') icon = value
        else if (value && typeof value === 'object') {
          const sizes = Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === 'string')
          icon = (sizes.sort(([a], [b]) => Number(b) - Number(a))[0]?.[1] as string | undefined) ?? null
        }
      } catch {
        // fabric.mod.json illisible : pas d'icône
      }
    } else {
      const toml = (await read('META-INF/neoforge.mods.toml')) ?? (await read('META-INF/mods.toml'))
      icon = toml ? (/^\s*logoFile\s*=\s*["']([^"']+)["']/m.exec(toml.toString('utf8'))?.[1] ?? null) : null
    }
    const ext = icon ? /\.(png|jpe?g)$/i.exec(icon)?.[1].toLowerCase() : null
    const data = icon && ext ? await read(icon.replace(/^\/+/, '')) : null
    if (!data) return false
    await writeFile(join(dir, `cover.${ext === 'png' ? 'png' : 'jpg'}`), data)
    return true
  } finally {
    zip.close()
  }
}

/** Copie dans le dossier du mod les jars de ces versions ; refuse d'écraser un autre fichier du même nom. */
export async function copyVersions(dir: string, versions: SourceVersion[]): Promise<string[]> {
  const copied: string[] = []
  for (const version of versions) {
    for (const jar of version.files) {
      const target = join(dir, jar.fileName)
      if (await pathExists(target)) throw new StudioError(`${jar.fileName} existe déjà dans le dossier du mod.`)
      await copyFile(jar.path, target)
      copied.push(jar.fileName)
    }
  }
  return copied
}
