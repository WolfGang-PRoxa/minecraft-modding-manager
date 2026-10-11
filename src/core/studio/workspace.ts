import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { normalizeExclusions } from '../../shared/exclusions'
import { isValidModpackId, slugify } from '../../shared/releases'
import type { DisabledMod, PackSettings, RangerOrders, RangerPackPlan, RangerPlan } from '../../shared/studio'
import { pathExists, renameWithRetry, writeJsonAtomic } from '../fsutil'
import { AnalysisCache, analyzeZip, describeError, sha256File, StudioError, type CachedAnalysis } from './analyze'

/** Métadonnées d'un modpack, gérées par le studio dans son dossier. */
export const PACK_FILE = 'pack.json'
export const COVER_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

/** « Hardcore_Endgame-v12.zip » : un zip déjà rangé. */
const NUMBERED_ZIP = /^(.*)-v(\d{1,6})\.zip$/i

/** Contenu de pack.json. Les réglages des versions n'y figurent que s'ils sont utilisés. */
export interface PackFile extends PackSettings {
  /** Identifiant publié (tags GitHub, suivi des installations) : ne change plus une fois créé. */
  id: string
  name: string
  description: string
  /** Plus grand numéro déjà attribué : un numéro n'est jamais réutilisé, même si son zip est supprimé. */
  lastVersion: number
  /** Notes de version en Markdown, par numéro de version. */
  notes: Record<string, string>
}

export interface LocalFile {
  fileName: string
  path: string
  size: number
  mtimeMs: number
}

export interface LocalZip extends LocalFile {
  analysis: CachedAnalysis | null
  /** Zip inutilisable (pas une instance CurseForge, copie en cours…). */
  error: string | null
}

export interface LocalVersion extends LocalZip {
  number: number
}

export interface LocalCover extends LocalFile {
  sha256: string
}

export interface LocalPack {
  folder: string
  dir: string
  meta: PackFile
  hasPackFile: boolean
  /** pack.json existe mais est inutilisable : on n'y touche pas. */
  packFileError: string | null
  cover: LocalCover | null
  /** Versions numérotées, de la plus ancienne à la plus récente. */
  versions: LocalVersion[]
  /** Zips pas encore numérotés, du plus ancien au plus récent. */
  pending: LocalZip[]
  /** Plus grand numéro trouvé dans les noms de fichiers (doublons compris). */
  maxNumber: number
  /** Erreurs qui bloquent la publication de ce modpack. */
  errors: string[]
}

export interface LocalWorkspace {
  dir: string
  exists: boolean
  packs: LocalPack[]
  strayZips: string[]
}

export function parseVersionNumber(fileName: string): number | null {
  const match = NUMBERED_ZIP.exec(fileName)
  const number = match ? Number(match[2]) : 0
  return number >= 1 ? number : null
}

export function versionFileName(folder: string, number: number): string {
  return `${folder}-v${number}.zip`
}

export function nextVersionNumber(pack: LocalPack): number {
  return Math.max(pack.meta.lastVersion, pack.maxNumber) + 1
}

function defaultPackFile(folder: string): PackFile {
  const name = folder.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim() || folder
  return {
    id: slugify(name).slice(0, 64).replace(/-+$/, '') || 'modpack',
    name,
    description: '',
    lastVersion: 0,
    notes: {},
    exclude: [],
    disabledMods: [],
    keepPlayerConfigs: false
  }
}

/** Mods désactivés valides et dédoublonnés (un même projet CurseForge, ou un même fichier, une seule fois). */
export function normalizeDisabledMods(value: unknown): DisabledMod[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const mods: DisabledMod[] = []
  for (const item of value as Array<Record<string, unknown>>) {
    const file = typeof item?.file === 'string' ? item.file.trim() : ''
    if (!file || /[\\/]/.test(file)) continue
    const addonId = Number.isInteger(item.addonId) && (item.addonId as number) > 0 ? (item.addonId as number) : null
    const key = addonId !== null ? `addon:${addonId}` : `file:${file.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null
    mods.push({ addonId, file, name })
  }
  return mods
}

/** Réglages des versions lus dans pack.json (ou reçus de la fenêtre), remis au propre. */
export function normalizePackSettings(data: Partial<Record<keyof PackSettings, unknown>>): PackSettings {
  return {
    exclude: Array.isArray(data.exclude) ? normalizeExclusions(data.exclude.filter((e): e is string => typeof e === 'string')) : [],
    disabledMods: normalizeDisabledMods(data.disabledMods),
    keepPlayerConfigs: data.keepPlayerConfigs === true
  }
}

async function readPackFile(
  dir: string,
  folder: string
): Promise<{ meta: PackFile; exists: boolean; error: string | null }> {
  const defaults = defaultPackFile(folder)
  let raw: string
  try {
    raw = await readFile(join(dir, PACK_FILE), 'utf8')
  } catch {
    return { meta: defaults, exists: false, error: null }
  }
  try {
    const data = JSON.parse(raw.replace(/^﻿/, '')) as Partial<PackFile>
    const notes: Record<string, string> = {}
    if (data.notes && typeof data.notes === 'object') {
      for (const [key, value] of Object.entries(data.notes)) if (typeof value === 'string') notes[key] = value
    }
    const meta: PackFile = {
      id: typeof data.id === 'string' && data.id ? data.id : defaults.id,
      name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : defaults.name,
      description: typeof data.description === 'string' ? data.description : '',
      lastVersion: Number.isInteger(data.lastVersion) && data.lastVersion! > 0 ? data.lastVersion! : 0,
      notes,
      ...normalizePackSettings(data)
    }
    const error = isValidModpackId(meta.id)
      ? null
      : `Identifiant « ${meta.id} » invalide dans pack.json (lettres minuscules, chiffres et tirets).`
    return { meta, exists: true, error }
  } catch {
    return { meta: defaults, exists: true, error: 'pack.json est illisible (JSON invalide) : corrige-le ou supprime-le.' }
  }
}

export async function writePackFile(dir: string, meta: PackFile): Promise<void> {
  const { exclude, disabledMods, keepPlayerConfigs, ...info } = meta
  const notes = Object.fromEntries(
    Object.entries(meta.notes)
      .filter(([, text]) => text.trim())
      .sort(([a], [b]) => Number(a) - Number(b))
  )
  await writeJsonAtomic(join(dir, PACK_FILE), {
    ...info,
    notes,
    ...(exclude.length ? { exclude } : {}),
    ...(disabledMods.length ? { disabledMods } : {}),
    ...(keepPlayerConfigs ? { keepPlayerConfigs } : {})
  })
}

async function listFiles(dir: string): Promise<LocalFile[]> {
  const files: LocalFile[] = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile()) continue
    const path = join(dir, entry.name)
    const info = await stat(path).catch(() => null)
    if (info) files.push({ fileName: entry.name, path, size: info.size, mtimeMs: info.mtimeMs })
  }
  return files
}

function findCover(files: LocalFile[]): LocalFile | null {
  for (const ext of COVER_EXTENSIONS) {
    const file = files.find((f) => f.fileName.toLowerCase() === `cover${ext}`)
    if (file) return file
  }
  return null
}

const byDate = (a: LocalFile, b: LocalFile) =>
  a.mtimeMs - b.mtimeMs || a.fileName.localeCompare(b.fileName, 'fr', { numeric: true })

async function analyze(
  folder: string,
  file: LocalFile,
  cache: AnalysisCache | null,
  onAnalyze?: (fileName: string | null) => void
): Promise<LocalZip> {
  const key = AnalysisCache.key(folder, file.size, file.mtimeMs)
  const cached = cache?.get(key)
  if (cached) return { ...file, analysis: cached, error: null }
  onAnalyze?.(file.fileName)
  try {
    const analysis = await analyzeZip(file.path, file.size)
    cache?.set(key, analysis)
    return { ...file, analysis, error: null }
  } catch (err) {
    return { ...file, analysis: null, error: describeError(err) }
  }
}

async function scanPack(
  root: string,
  folder: string,
  cache: AnalysisCache | null,
  onAnalyze?: (fileName: string | null) => void
): Promise<LocalPack> {
  const dir = join(root, folder)
  const { meta, exists, error } = await readPackFile(dir, folder)
  const errors = error ? [error] : []
  const files = await listFiles(dir)

  const byNumber = new Map<number, LocalFile[]>()
  const unnumbered: LocalFile[] = []
  for (const file of files) {
    if (!/\.zip$/i.test(file.fileName)) continue
    const number = parseVersionNumber(file.fileName)
    if (number === null) unnumbered.push(file)
    else byNumber.set(number, [...(byNumber.get(number) ?? []), file])
  }

  const versions: LocalVersion[] = []
  for (const [number, list] of [...byNumber].sort(([a], [b]) => a - b)) {
    if (list.length > 1) {
      errors.push(`Plusieurs zips pour la v${number} (${list.map((f) => f.fileName).join(', ')}) : n’en garde qu’un.`)
      continue
    }
    versions.push({ ...(await analyze(folder, list[0], cache, onAnalyze)), number })
  }
  // Analysés dès maintenant : le rangement écarte les zips invalides, et l'empreinte reste en cache après renommage.
  const pending: LocalZip[] = []
  for (const file of unnumbered.sort(byDate)) pending.push(await analyze(folder, file, cache, onAnalyze))

  const coverFile = findCover(files)
  const coverSha = coverFile ? await sha256File(coverFile.path).catch(() => null) : null

  return {
    folder,
    dir,
    meta,
    hasPackFile: exists,
    packFileError: error,
    cover: coverFile && coverSha ? { ...coverFile, sha256: coverSha } : null,
    versions,
    pending,
    maxNumber: Math.max(0, ...byNumber.keys()),
    errors
  }
}

/** Lit le dossier de travail : un sous-dossier par modpack, ses zips, son image et son pack.json. */
export async function scanWorkspace(
  dir: string,
  cache: AnalysisCache | null,
  onAnalyze?: (fileName: string | null) => void
): Promise<LocalWorkspace> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return { dir, exists: false, packs: [], strayZips: [] }
  }

  cache?.beginScan()
  const packs: LocalPack[] = []
  const strayZips: string[] = []
  const sorted = entries.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))
  try {
    for (const entry of sorted) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) packs.push(await scanPack(dir, entry.name, cache, onAnalyze))
      else if (entry.isFile() && /\.zip$/i.test(entry.name)) strayZips.push(entry.name)
    }
  } finally {
    onAnalyze?.(null)
  }
  await cache?.endScan()

  // Deux dossiers ne peuvent pas publier sous le même identifiant.
  const byId = new Map<string, LocalPack[]>()
  for (const pack of packs) byId.set(pack.meta.id, [...(byId.get(pack.meta.id) ?? []), pack])
  for (const [id, list] of byId) {
    if (list.length < 2) continue
    for (const pack of list) {
      const others = list.filter((p) => p !== pack).map((p) => p.folder)
      pack.errors.push(`Identifiant « ${id} » déjà utilisé par ${others.join(', ')} : change « id » dans pack.json.`)
    }
  }

  return { dir, exists: true, packs, strayZips }
}

// ---------------------------------------------------------------------------------------------
// Rangement

function orderPending(pending: LocalZip[], order: string[] | undefined): LocalZip[] {
  if (!order) return pending
  const byName = new Map(pending.map((f) => [f.fileName, f]))
  const chosen = order.map((name) => byName.get(name)).filter((f): f is LocalZip => Boolean(f))
  return [...chosen, ...pending.filter((f) => !chosen.includes(f))]
}

/**
 * Numérote les zips déposés à la suite des versions existantes (du plus ancien au plus récent,
 * sauf ordre choisi), et renomme au nom du dossier les zips déjà numérotés qui ne le sont pas.
 */
export function planRanger(workspace: LocalWorkspace, orders: RangerOrders = {}): RangerPlan {
  const packs: RangerPackPlan[] = []
  for (const pack of workspace.packs) {
    if (pack.packFileError) {
      if (pack.pending.length) packs.push({ folder: pack.folder, name: pack.meta.name, renames: [], errors: [pack.packFileError] })
      continue
    }
    const plan: RangerPackPlan = { folder: pack.folder, name: pack.meta.name, renames: [], errors: [] }

    for (const version of pack.versions) {
      const wanted = versionFileName(pack.folder, version.number)
      if (version.fileName !== wanted) {
        plan.renames.push({ from: version.fileName, to: wanted, number: version.number, kind: 'rename', warning: null })
      }
    }

    const newest = pack.versions.reduce<LocalVersion | null>((a, b) => (!a || b.mtimeMs > a.mtimeMs ? b : a), null)
    let next = nextVersionNumber(pack)
    for (const file of orderPending(pack.pending, orders[pack.folder])) {
      if (file.error) {
        plan.errors.push(`${file.fileName} n’est pas rangé : ${file.error}`)
        continue
      }
      const number = next++
      const older = newest && file.mtimeMs < newest.mtimeMs
      plan.renames.push({
        from: file.fileName,
        to: versionFileName(pack.folder, number),
        number,
        kind: 'new',
        warning: older ? `Plus ancien que la v${newest.number} : il deviendra quand même la v${number}.` : null
      })
    }
    if (plan.renames.length || plan.errors.length) packs.push(plan)
  }
  return { packs, total: packs.reduce((sum, p) => sum + p.renames.length, 0) }
}

export async function applyRanger(workspace: LocalWorkspace, plan: RangerPlan): Promise<number> {
  let renamed = 0
  for (const packPlan of plan.packs) {
    const pack = workspace.packs.find((p) => p.folder === packPlan.folder)
    if (!pack || pack.packFileError || packPlan.renames.length === 0) continue
    for (const rename of packPlan.renames) {
      const to = join(pack.dir, rename.to)
      const caseOnly = rename.from.toLowerCase() === rename.to.toLowerCase()
      if (!caseOnly && (await pathExists(to))) throw new StudioError(`${pack.folder}\\${rename.to} existe déjà.`)
      try {
        await renameWithRetry(join(pack.dir, rename.from), to)
      } catch (err) {
        throw new StudioError(`Impossible de renommer ${rename.from} : ${describeError(err)}`)
      }
      renamed++
    }
    const highest = Math.max(pack.meta.lastVersion, pack.maxNumber, ...packPlan.renames.map((r) => r.number))
    await writePackFile(pack.dir, { ...pack.meta, lastVersion: highest })
  }
  return renamed
}

// ---------------------------------------------------------------------------------------------
// Modifications d'un modpack

/** Lit un modpack sans analyser ses zips (pour modifier ses infos). */
export async function loadPackMeta(root: string, folder: string): Promise<{ dir: string; meta: PackFile }> {
  const dir = resolve(root, folder)
  if (dirname(dir) !== resolve(root) || !(await pathExists(dir))) throw new StudioError(`Le dossier ${folder} est introuvable.`)
  const { meta, error, exists } = await readPackFile(dir, folder)
  if (exists && error) throw new StudioError(error)
  return { dir, meta }
}

function folderNameFor(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/, '')
    .trim()
    .replace(/\s+/g, '_')
}

export async function createPack(workspace: LocalWorkspace, name: string): Promise<string> {
  const display = name.trim().replace(/\s+/g, ' ')
  const folder = folderNameFor(display)
  if (!folder || folder.startsWith('.')) throw new StudioError('Donne un nom au modpack.')
  const dir = join(workspace.dir, folder)
  if (await pathExists(dir)) throw new StudioError(`Le dossier ${folder} existe déjà.`)

  const taken = new Set(workspace.packs.map((p) => p.meta.id))
  const base = defaultPackFile(folder).id
  let id = base
  for (let i = 2; taken.has(id); i++) id = `${base.slice(0, 60)}-${i}`

  await mkdir(dir, { recursive: true })
  await writePackFile(dir, { ...defaultPackFile(folder), id, name: display })
  return folder
}

async function removeCoverFiles(dir: string): Promise<void> {
  for (const file of await listFiles(dir)) {
    if (COVER_EXTENSIONS.some((ext) => file.fileName.toLowerCase() === `cover${ext}`)) await rm(file.path, { force: true })
  }
}

export async function setCover(dir: string, source: string | null): Promise<void> {
  if (source) {
    const ext = extname(source).toLowerCase()
    if (!COVER_EXTENSIONS.includes(ext)) throw new StudioError('Image non prise en charge : utilise un PNG, un JPG ou un WebP.')
    const target = join(dir, `cover${ext}`)
    if (resolve(source).toLowerCase() === target.toLowerCase()) return
    await removeCoverFiles(dir)
    await copyFile(source, target)
  } else {
    await removeCoverFiles(dir)
  }
}

async function uniqueTarget(dir: string, fileName: string): Promise<string> {
  const ext = extname(fileName)
  const stem = basename(fileName, ext)
  let candidate = join(dir, fileName)
  for (let i = 2; await pathExists(candidate); i++) candidate = join(dir, `${stem} (${i})${ext}`)
  return candidate
}

/** Copie dans le dossier du modpack les zips (et l'image) glissés dans le studio. */
export async function importFiles(
  dir: string,
  paths: string[]
): Promise<{ zips: number; cover: boolean; ignored: string[] }> {
  let zips = 0
  let cover: string | null = null
  const ignored: string[] = []
  for (const path of paths) {
    const ext = extname(path).toLowerCase()
    if (ext === '.zip') {
      if (resolve(dirname(path)).toLowerCase() === resolve(dir).toLowerCase()) continue
      await copyFile(path, await uniqueTarget(dir, basename(path)))
      zips++
    } else if (COVER_EXTENSIONS.includes(ext)) {
      cover = path
    } else {
      ignored.push(basename(path))
    }
  }
  if (cover) await setCover(dir, cover)
  return { zips, cover: cover !== null, ignored }
}
