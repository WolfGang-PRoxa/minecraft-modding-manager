import { ZipArchive, type ProgressData, type ZipEntryData } from 'archiver'
import { createWriteStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { CURSEFORGE_INSTANCE_FILE } from '../../shared/config'
import { DEFAULT_EXCLUSIONS, exclusionMatcher } from '../../shared/exclusions'
import type { ExcludedInZip } from '../../shared/studio'
import { removeQuietly, renameWithRetry } from '../fsutil'
import { findRootPrefix, openEntry, openZip, readEntries } from '../zip'
import { StudioError } from './analyze'

/** Fichiers déjà compressés : on les stocke tels quels pour aller plus vite. */
const STORED_EXTENSIONS = new Set(['.jar', '.zip', '.png', '.jpg', '.jpeg', '.ogg', '.gz', '.7z'])

const stored = (path: string) => STORED_EXTENSIONS.has(extname(path).toLowerCase())

const TOO_LARGE =
  'Le zip dépasse 2 Go, la limite de GitHub. Retire des fichiers de l’instance (shaders, packs de ressources…), ou publie ce modpack seulement sur CurseForge.'

async function collectFiles(root: string, excludes: string[]): Promise<Array<{ path: string; rel: string; size: number }>> {
  const isExcluded = exclusionMatcher(excludes)
  const files: Array<{ path: string; rel: string; size: number }> = []
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      const rel = relative(root, path).replace(/\\/g, '/')
      // Un dossier exclu est sauté d'un bloc, sans être parcouru.
      if (isExcluded(rel)) continue
      // Image du profil déposée par l'application des joueurs.
      if (/^\.modpack-cover\./i.test(rel)) continue
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) files.push({ path, rel, size: (await stat(path)).size })
    }
  }
  await walk(root)
  return files
}

export interface ZipInstanceOptions {
  includeSaves: boolean
  /** Fichiers exclus dans les réglages du modpack, en plus des données propres à la partie. */
  exclude: string[]
  /** Taille maximale du zip (modpack publié sur GitHub : sa limite, `MAX_ASSET_SIZE`) ; aucune par défaut. */
  maxSize?: number
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/** Zippe une instance CurseForge (sans les données du joueur) ; le zip n'apparaît qu'une fois complet. */
export async function zipInstance(instanceDir: string, destination: string, options: ZipInstanceOptions): Promise<void> {
  const excludes = [...DEFAULT_EXCLUSIONS.filter((e) => !(options.includeSaves && e === 'saves')), ...options.exclude]
  const files = await collectFiles(instanceDir, excludes)
  if (!files.some((f) => f.rel === CURSEFORGE_INSTANCE_FILE)) {
    throw new StudioError(`${CURSEFORGE_INSTANCE_FILE} introuvable : ce dossier n’est pas une instance CurseForge.`)
  }
  await writeZip(files, destination, options)
}

/**
 * Zippe un dossier tel quel (pack de ressources, shader en cours de création), sauf les fichiers cachés ; `marker` :
 * fichier qui doit s'y trouver (pack.mcmeta, dossier shaders/…), sans quoi le dossier n'est pas ce qu'on croit.
 */
export async function zipFolder(dir: string, destination: string, options: { marker: (rel: string) => boolean; markerLabel: string; signal?: AbortSignal }): Promise<void> {
  const files = (await collectFiles(dir, [])).filter((f) => !f.rel.split('/').some((part) => part.startsWith('.')))
  if (!files.some((f) => options.marker(f.rel))) throw new StudioError(`${options.markerLabel} introuvable dans ${dir}.`)
  await writeZip(files, destination, { signal: options.signal })
}

async function writeZip(
  files: Array<{ path: string; rel: string; size: number }>,
  destination: string,
  options: Pick<ZipInstanceOptions, 'maxSize' | 'onProgress' | 'signal'>
): Promise<void> {
  const total = files.reduce((sum, f) => sum + f.size, 0)
  const partial = `${destination}.part`
  const out = createWriteStream(partial)
  // Le fichier n'est supprimable qu'une fois fermé, même quand on abandonne avant qu'il soit ouvert.
  const closed = new Promise<void>((resolvePromise) => out.once('close', () => resolvePromise()))
  const zip = new ZipArchive({ zlib: { level: 6 }, forceZip64: total > 3.5 * 1024 ** 3 })

  const finished = new Promise<void>((resolvePromise, reject) => {
    out.on('close', () => resolvePromise())
    out.on('error', reject)
    zip.on('error', reject)
  })
  const onAbort = () => {
    zip.abort()
    out.destroy(new StudioError('Création du zip annulée.'))
  }
  options.signal?.addEventListener('abort', onAbort, { once: true })
  zip.on('progress', (p: ProgressData) => options.onProgress?.(p.fs.processedBytes, total))

  try {
    zip.pipe(out)
    for (const file of files) {
      const entry: ZipEntryData = { name: file.rel, store: stored(file.rel) }
      zip.file(file.path, entry)
    }
    await Promise.all([zip.finalize(), finished])
    options.signal?.throwIfAborted()
    if (options.maxSize !== undefined && (await stat(partial)).size > options.maxSize) throw new StudioError(TOO_LARGE)
    await renameWithRetry(partial, destination)
  } catch (err) {
    zip.abort()
    out.destroy()
    await closed
    await removeQuietly(partial)
    if (options.signal?.aborted) throw new StudioError('Création du zip annulée.')
    throw err
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
  }
}

// ---------------------------------------------------------------------------------------------
// Fichiers exclus dans un zip déjà fait (zip déposé, version créée avant l'exclusion)

/** Fichiers d'un zip de modpack que ses réglages excluent (chemins depuis le dossier de l'instance). */
export async function findExcludedInZip(file: string, patterns: string[]): Promise<ExcludedInZip | null> {
  const isExcluded = exclusionMatcher(patterns)
  let zip
  try {
    zip = await openZip(file)
  } catch {
    return null
  }
  try {
    const entries = await readEntries(zip)
    const prefix = findRootPrefix(entries, CURSEFORGE_INSTANCE_FILE)
    if (prefix === null) return null
    let files = 0
    const paths = new Map<string, string>()
    for (const entry of entries) {
      if (!entry.fileName.startsWith(prefix) || entry.fileName.endsWith('/')) continue
      const root = isExcluded(entry.fileName.slice(prefix.length))
      if (!root) continue
      files++
      if (!paths.has(root.toLowerCase())) paths.set(root.toLowerCase(), root)
    }
    return files ? { files, paths: [...paths.values()] } : null
  } catch {
    return null
  } finally {
    zip.close()
  }
}

export interface StripOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/**
 * Réécrit un zip de modpack sans les fichiers que ses réglages excluent ; renvoie le nombre de fichiers retirés.
 * Le zip d'origine n'est remplacé qu'une fois le nouveau complet.
 */
export async function stripExcludedFromZip(file: string, patterns: string[], options: StripOptions = {}): Promise<number> {
  const isExcluded = exclusionMatcher(patterns)
  const partial = `${file}.part`
  const source = await openZip(file).catch(() => {
    throw new StudioError('Zip illisible ou incomplet (copie encore en cours ?).')
  })
  let removed = 0
  try {
    const entries = await readEntries(source)
    const prefix = findRootPrefix(entries, CURSEFORGE_INSTANCE_FILE)
    if (prefix === null) throw new StudioError(`${CURSEFORGE_INSTANCE_FILE} introuvable : ce zip ne contient pas une instance CurseForge.`)
    // Les dossiers n'ont pas besoin d'entrée propre : ils sont recréés à partir des chemins des fichiers.
    const kept = entries.filter((entry) => {
      if (entry.fileName.endsWith('/')) return false
      const excluded = entry.fileName.startsWith(prefix) && isExcluded(entry.fileName.slice(prefix.length)) !== null
      if (excluded) removed++
      return !excluded
    })
    if (removed === 0) return 0

    const total = kept.reduce((sum, entry) => sum + entry.uncompressedSize, 0)
    const out = createWriteStream(partial)
    // Le fichier n'est supprimable qu'une fois fermé, même quand on abandonne avant qu'il soit ouvert.
    const closed = new Promise<void>((resolvePromise) => out.once('close', () => resolvePromise()))
    const zip = new ZipArchive({ zlib: { level: 6 }, forceZip64: total > 3.5 * 1024 ** 3 })
    let failure: unknown = null
    let onEntry: (() => void) | null = null
    let onFailure: ((err: unknown) => void) | null = null
    const fail = (err: unknown) => {
      failure ??= err
      onFailure?.(err)
    }
    zip.on('error', fail)
    out.on('error', fail)
    zip.on('entry', () => onEntry?.())
    zip.pipe(out)

    try {
      let done = 0
      // Un fichier à la fois : le zip d'origine n'est lu qu'au rythme de l'écriture du nouveau.
      for (const entry of kept) {
        options.signal?.throwIfAborted()
        if (failure) throw failure
        const stream = await openEntry(source, entry)
        await new Promise<void>((resolvePromise, reject) => {
          onEntry = resolvePromise
          onFailure = reject
          stream.once('error', reject)
          zip.append(stream, { name: entry.fileName, date: entry.getLastModDate(), store: stored(entry.fileName) })
        })
        done += entry.uncompressedSize
        options.onProgress?.(done, total)
      }
      await zip.finalize()
      await closed
      if (failure) throw failure
    } catch (err) {
      zip.abort()
      out.destroy()
      await closed
      throw err
    }
  } catch (err) {
    await removeQuietly(partial)
    if (options.signal?.aborted) throw new StudioError('Nettoyage du zip annulé.')
    throw err
  } finally {
    source.close()
  }
  await renameWithRetry(partial, file)
  return removed
}
