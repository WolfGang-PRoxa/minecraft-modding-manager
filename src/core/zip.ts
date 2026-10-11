import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'

export function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolvePromise, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => (err ? reject(err) : resolvePromise(zip)))
  })
}

export function readEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolvePromise, reject) => {
    const entries: yauzl.Entry[] = []
    zip.on('entry', (entry: yauzl.Entry) => {
      entries.push(entry)
      zip.readEntry()
    })
    zip.once('end', () => resolvePromise(entries))
    zip.once('error', reject)
    zip.readEntry()
  })
}

export function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolvePromise, reject) => {
    zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolvePromise(stream)))
  })
}

/** Refuse les chemins qui sortiraient du dossier cible (zip-slip) ou invalides sous Windows. */
function safeTarget(root: string, relative: string): string {
  const segments = relative.split('/').filter(Boolean)
  const invalid = segments.some((s) => s === '..' || s.includes(':') || /[<>"|?*]/.test(s))
  if (invalid || isAbsolute(relative)) throw new Error(`Chemin invalide dans l'archive : ${relative}`)
  const target = resolve(root, ...segments)
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Chemin invalide dans l'archive : ${relative}`)
  }
  return target
}

/**
 * Détermine le préfixe à retirer pour que `marker` (ex. minecraftinstance.json)
 * se retrouve à la racine : accepte un zip du contenu comme un zip du dossier.
 */
export function findRootPrefix(entries: yauzl.Entry[], marker: string): string | null {
  let best: string | null = null
  for (const { fileName } of entries) {
    if (fileName === marker) return ''
    if (fileName.endsWith(`/${marker}`) && !fileName.startsWith('__MACOSX/')) {
      const prefix = fileName.slice(0, -marker.length)
      if (best === null || prefix.length < best.length) best = prefix
    }
  }
  return best
}

export interface ExtractOptions {
  /** Fichier qui doit se trouver à la racine une fois extrait. */
  rootMarker: string
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export async function extractZip(file: string, destination: string, options: ExtractOptions): Promise<void> {
  const zip = await openZip(file)
  try {
    const entries = await readEntries(zip)
    const prefix = findRootPrefix(entries, options.rootMarker)
    if (prefix === null) {
      throw new Error(`Archive invalide : ${options.rootMarker} est introuvable.`)
    }

    const root = resolve(destination)
    const selected = entries.filter((e) => e.fileName.startsWith(prefix) && e.fileName.length > prefix.length)
    const total = selected.reduce((sum, e) => sum + e.uncompressedSize, 0)
    let done = 0
    let lastEmit = 0
    await mkdir(root, { recursive: true })

    for (const entry of selected) {
      options.signal?.throwIfAborted()
      const relative = entry.fileName.slice(prefix.length)
      const target = safeTarget(root, relative)
      if (relative.endsWith('/')) {
        await mkdir(target, { recursive: true })
        continue
      }
      await mkdir(dirname(target), { recursive: true })
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          done += chunk.length
          const now = Date.now()
          if (options.onProgress && now - lastEmit > 120) {
            lastEmit = now
            options.onProgress(done, total)
          }
          callback(null, chunk)
        }
      })
      await pipeline(await openEntry(zip, entry), counter, createWriteStream(target), { signal: options.signal })
    }
    options.onProgress?.(total, total)
  } finally {
    zip.close()
  }
}
