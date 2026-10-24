// Packs de ressources et shaders du Studio : un dossier par pack, qui contient ses versions numérotées
// (`<Dossier>-v<N>.zip`, comme les modpacks). Un pack de ressources dit pour quelles versions de Minecraft il est fait
// (pack.mcmeta) ; un shader ne le dit pas : le publieur les donne dans pack.json (`minecraftVersions`).
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ContentKind } from '../../shared/content'
import { findRootPrefix, openEntry, openZip, readEntries } from '../zip'
import { describeError, StudioError } from './analyze'
import type { ContentAnalysis, LocalContentVersion, LocalJar } from './mods'

/**
 * Formats des packs de ressources et versions de Minecraft (sorties, pas les snapshots) qui les lisent, d'après
 * minecraft.wiki/w/Pack_format (relevé le 2026-10-24).
 */
export const RESOURCE_PACK_FORMATS: Array<[number, string[]]> = [
  [4, ['1.13', '1.13.1', '1.13.2', '1.14', '1.14.1', '1.14.2', '1.14.3', '1.14.4']],
  [5, ['1.15', '1.15.1', '1.15.2', '1.16', '1.16.1']],
  [6, ['1.16.2', '1.16.3', '1.16.4', '1.16.5']],
  [7, ['1.17', '1.17.1']],
  [8, ['1.18', '1.18.1', '1.18.2']],
  [9, ['1.19', '1.19.1', '1.19.2']],
  [12, ['1.19.3']],
  [13, ['1.19.4']],
  [15, ['1.20', '1.20.1']],
  [18, ['1.20.2']],
  [22, ['1.20.3', '1.20.4']],
  [32, ['1.20.5', '1.20.6']],
  [34, ['1.21', '1.21.1']],
  [42, ['1.21.2', '1.21.3']],
  [46, ['1.21.4']],
  [55, ['1.21.5']],
  [63, ['1.21.6']],
  [64, ['1.21.7', '1.21.8']],
  [69, ['1.21.9', '1.21.10']],
  [75, ['1.21.11']],
  [84, ['26.1', '26.1.1', '26.1.2']],
  [88, ['26.2']],
  [97, ['26.3']]
]

/** Versions de Minecraft d'une plage de formats (bornes comprises, partie mineure ignorée : 97.1 → 97). */
export function minecraftVersionsForFormats(min: number, max: number): string[] {
  return RESOURCE_PACK_FORMATS.filter(([format]) => format >= Math.floor(min) && format <= Math.floor(max)).flatMap(([, versions]) => versions)
}

/** Format : nombre, ou [majeur, mineur] (min_format / max_format depuis 1.21.9). */
const formatOf = (value: unknown): number | null =>
  typeof value === 'number' ? value : Array.isArray(value) && typeof value[0] === 'number' ? value[0] : null

/** Plage de formats déclarée par pack.mcmeta : min_format / max_format, supported_formats, sinon pack_format. */
export function packFormats(pack: Record<string, unknown>): { min: number; max: number } | null {
  const min = formatOf(pack.min_format)
  const max = formatOf(pack.max_format)
  if (min !== null || max !== null) return { min: min ?? max!, max: max ?? min! }
  const supported = pack.supported_formats
  if (typeof supported === 'number') return { min: supported, max: supported }
  if (Array.isArray(supported) && typeof supported[0] === 'number' && typeof supported[1] === 'number') return { min: supported[0], max: supported[1] }
  if (supported && typeof supported === 'object') {
    const range = supported as { min_inclusive?: unknown; max_inclusive?: unknown }
    if (typeof range.min_inclusive === 'number' && typeof range.max_inclusive === 'number') return { min: range.min_inclusive, max: range.max_inclusive }
  }
  const format = formatOf(pack.pack_format)
  return format === null ? null : { min: format, max: format }
}

/** Texte d'une description de pack.mcmeta : chaîne, composant de texte, ou liste de composants. */
function plainText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(plainText).join('')
  if (value && typeof value === 'object') {
    const component = value as { text?: unknown; extra?: unknown }
    return plainText(component.text ?? '') + plainText(component.extra ?? '')
  }
  return ''
}

/** Retire les codes de couleur (§a…) d'une description. */
const stripCodes = (text: string) => text.replace(/§./g, '').trim()

async function hashes(file: string): Promise<{ sha256: string; sha1: string }> {
  const sha256 = createHash('sha256')
  const sha1 = createHash('sha1')
  for await (const chunk of createReadStream(file)) {
    sha256.update(chunk as Buffer)
    sha1.update(chunk as Buffer)
  }
  return { sha256: sha256.digest('hex'), sha1: sha1.digest('hex') }
}

/** Ce qu'un zip déclare de lui-même, et son icône (pack.png) s'il en a une. */
export interface PackZipInfo {
  description: string | null
  minecraftVersions: string[]
  /** La plage telle qu'écrite (« formats 88 à 97 »), null pour un shader. */
  range: string | null
  icon: Buffer | null
}

/** Lit un zip de pack de ressources (pack.mcmeta) ou de shader (dossier shaders/), à la racine ou sous un dossier. */
export async function readPackZip(file: string, kind: 'resourcepack' | 'shader'): Promise<PackZipInfo> {
  let zip
  try {
    zip = await openZip(file)
  } catch {
    throw new StudioError('Ce fichier n’est pas un zip lisible.')
  }
  try {
    const entries = await readEntries(zip)
    const read = async (name: string) => {
      const entry = entries.find((e) => e.fileName === name)
      if (!entry) return null
      const chunks: Buffer[] = []
      for await (const chunk of await openEntry(zip, entry)) chunks.push(chunk as Buffer)
      return Buffer.concat(chunks)
    }
    if (kind === 'shader') {
      const root = entries.map((e) => /^(?:([^/]+)\/)?shaders\//.exec(e.fileName)).find(Boolean)
      if (!root) throw new StudioError('Pas de dossier shaders/ : ce zip n’est pas un pack de shaders.')
      return { description: null, minecraftVersions: [], range: null, icon: null }
    }
    const prefix = findRootPrefix(entries, 'pack.mcmeta')
    if (prefix === null) throw new StudioError('Pas de pack.mcmeta : ce zip n’est pas un pack de ressources.')
    let mcmeta: { pack?: Record<string, unknown> }
    try {
      mcmeta = JSON.parse((await read(`${prefix}pack.mcmeta`))!.toString('utf8').replace(/^﻿/, '')) as typeof mcmeta
    } catch {
      throw new StudioError('pack.mcmeta est illisible (JSON invalide).')
    }
    const formats = packFormats(mcmeta.pack ?? {})
    const description = stripCodes(plainText(mcmeta.pack?.description))
    return {
      description: description || null,
      minecraftVersions: formats ? minecraftVersionsForFormats(formats.min, formats.max) : [],
      range: formats ? (formats.min === formats.max ? `format ${formats.min}` : `formats ${formats.min} à ${formats.max}`) : null,
      icon: await read(`${prefix}pack.png`)
    }
  } finally {
    zip.close()
  }
}

const memo = new Map<string, { size: number; mtimeMs: number; analysis: ContentAnalysis }>()

/** Analyse d'un zip de pack (mise en mémoire tant que sa taille et sa date ne changent pas). */
export async function analyzePackZip(file: { path: string; size: number; mtimeMs: number }, kind: 'resourcepack' | 'shader'): Promise<ContentAnalysis> {
  const known = memo.get(file.path)
  if (known && known.size === file.size && known.mtimeMs === file.mtimeMs) return known.analysis
  const info = await readPackZip(file.path, kind)
  const analysis: ContentAnalysis = {
    ...(await hashes(file.path)),
    contentId: '',
    name: null,
    description: info.description,
    version: '',
    // Un shader se charge avec Iris ou OptiFine ; un pack de ressources, par le jeu lui-même.
    loaders: kind === 'shader' ? ['iris', 'optifine'] : [],
    minecraftVersions: info.minecraftVersions,
    minecraftRange: info.range,
    side: 'client',
    dependencies: []
  }
  memo.set(file.path, { size: file.size, mtimeMs: file.mtimeMs, analysis })
  return analysis
}

/** « Mon_Pack-v3.zip » : une version déjà numérotée. */
const NUMBERED = /^(.*)-v(\d{1,6})\.zip$/i

export interface PackFolderScan {
  versions: LocalContentVersion[]
  /** Zips pas encore numérotés (à ranger), du plus ancien au plus récent. */
  pending: LocalJar[]
  badFiles: LocalJar[]
  maxNumber: number
  errors: string[]
}

/**
 * Lit le dossier d'un pack. `minecraftVersions` (pack.json) remplace celles du zip : obligatoire pour un shader, qui
 * ne les déclare pas. Un zip numéroté illisible bloque le pack (sa release ne doit pas être retirée par erreur).
 */
export async function scanPackFolder(dir: string, kind: 'resourcepack' | 'shader', minecraftVersions: string[]): Promise<PackFolderScan> {
  const zips: LocalJar[] = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !/\.zip$/i.test(entry.name)) continue
    const path = join(dir, entry.name)
    const info = await stat(path).catch(() => null)
    if (!info) continue
    const file = { fileName: entry.name, path, size: info.size, mtimeMs: info.mtimeMs }
    try {
      const analysis = await analyzePackZip(file, kind)
      zips.push({ ...file, analysis: minecraftVersions.length ? { ...analysis, minecraftVersions } : analysis, error: null })
    } catch (err) {
      zips.push({ ...file, analysis: null, error: describeError(err) })
    }
  }
  const errors: string[] = []
  const byNumber = new Map<number, LocalJar[]>()
  const pending: LocalJar[] = []
  for (const zip of zips) {
    const number = Number(NUMBERED.exec(zip.fileName)?.[2] ?? 0)
    if (number >= 1) byNumber.set(number, [...(byNumber.get(number) ?? []), zip])
    else pending.push(zip)
  }
  const versions: LocalContentVersion[] = []
  const badFiles: LocalJar[] = []
  for (const [number, list] of [...byNumber].sort(([a], [b]) => a - b)) {
    if (list.length > 1) {
      errors.push(`Plusieurs zips pour la v${number} (${list.map((f) => f.fileName).join(', ')}) : n’en garde qu’un.`)
      continue
    }
    const [zip] = list
    if (!zip.analysis) {
      badFiles.push(zip)
      errors.push(`${zip.fileName} : ${zip.error}`)
      continue
    }
    versions.push({ version: String(number), files: [{ ...zip, analysis: { ...zip.analysis, version: String(number) } }] })
  }
  pending.sort((a, b) => a.mtimeMs - b.mtimeMs || a.fileName.localeCompare(b.fileName, 'fr', { numeric: true }))
  return { versions, pending, badFiles, maxNumber: Math.max(0, ...byNumber.keys()), errors }
}

/** Écrit l'icône d'un pack de ressources (pack.png) comme image du pack ; false s'il n'en a pas. */
export async function extractPackIcon(zipPath: string, dir: string): Promise<boolean> {
  const info = await readPackZip(zipPath, 'resourcepack').catch(() => null)
  if (!info?.icon) return false
  await writeFile(join(dir, 'cover.png'), info.icon)
  return true
}

/** Ce qu'un dossier source doit contenir pour être un pack de ce type. */
export function packMarker(kind: Extract<ContentKind, 'resourcepack' | 'shader'>): { marker: (rel: string) => boolean; markerLabel: string } {
  return kind === 'shader'
    ? { marker: (rel) => rel.startsWith('shaders/'), markerLabel: 'Le dossier shaders/' }
    : { marker: (rel) => rel === 'pack.mcmeta', markerLabel: 'pack.mcmeta' }
}
