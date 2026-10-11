import { extname } from 'node:path'
import type { Entry, ZipFile } from 'yauzl'
import { CURSEFORGE_INSTANCE_FILE } from '../../shared/config'
import type { ZipContents, ZipEntryPreview, ZipMod } from '../../shared/studio'
import { addonsByFile, MOD_PATH, type AddonInfo } from '../instanceAddons'
import { findRootPrefix, openEntry, openZip, readEntries } from '../zip'
import { StudioError } from './analyze'

/** Au-delà, l'aperçu d'un fichier texte est coupé. */
const TEXT_LIMIT = 256 * 1024
const IMAGE_LIMIT = 4 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

async function withZip<T>(file: string, run: (zip: ZipFile, entries: Entry[], prefix: string) => Promise<T>): Promise<T> {
  let zip: ZipFile
  try {
    zip = await openZip(file)
  } catch {
    throw new StudioError('Zip illisible ou incomplet (copie encore en cours ?).')
  }
  try {
    let entries: Entry[]
    try {
      entries = await readEntries(zip)
    } catch {
      throw new StudioError('Zip corrompu : son contenu est illisible.')
    }
    // Zip d'un dossier d'instance : les chemins sont affichés depuis ce dossier.
    return await run(zip, entries, findRootPrefix(entries, CURSEFORGE_INSTANCE_FILE) ?? '')
  } finally {
    zip.close()
  }
}

/** Début d'un fichier du zip, sans décompresser la suite. */
async function readStart(zip: ZipFile, entry: Entry, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of await openEntry(zip, entry)) {
    chunks.push(chunk as Buffer)
    size += (chunk as Buffer).length
    if (size >= limit) break
  }
  return Buffer.concat(chunks).subarray(0, limit)
}

/** Liste des fichiers d'un zip de modpack, et ses mods avec le nom que leur donne CurseForge. */
export function readZipContents(file: string): Promise<ZipContents> {
  return withZip(file, async (zip, entries, prefix) => {
    const files = entries
      .filter((e) => e.fileName.startsWith(prefix) && !e.fileName.endsWith('/') && !e.fileName.startsWith('__MACOSX/'))
      .map((e) => ({ path: e.fileName.slice(prefix.length), size: e.uncompressedSize }))

    const instanceEntry = entries.find((e) => e.fileName === prefix + CURSEFORGE_INSTANCE_FILE)
    let addons = new Map<string, AddonInfo>()
    if (instanceEntry) {
      try {
        const raw = await readStart(zip, instanceEntry, instanceEntry.uncompressedSize)
        addons = addonsByFile(JSON.parse(raw.toString('utf8').replace(/^﻿/, '')))
      } catch {
        // Fichier illisible : les mods sont listés sous leur seul nom de fichier.
      }
    }

    const mods: ZipMod[] = []
    for (const { path, size } of files) {
      const match = MOD_PATH.exec(path)
      if (!match) continue
      const known = addons.get(match[1].toLowerCase())
      mods.push({
        fileName: path.slice('mods/'.length),
        size,
        disabled: Boolean(match[2]),
        addonId: known?.addonId ?? null,
        name: known?.name ?? null,
        author: known?.author ?? null,
        url: known?.url ?? null
      })
    }
    return { root: prefix.replace(/\/$/, ''), files, mods }
  })
}

/** Aperçu d'un fichier du zip : texte (début seulement s'il est long), image, ou rien pour un fichier binaire. */
export function previewZipEntry(file: string, path: string): Promise<ZipEntryPreview> {
  return withZip(file, async (zip, entries, prefix) => {
    const entry = entries.find((e) => e.fileName === prefix + path)
    if (!entry || entry.fileName.endsWith('/')) throw new StudioError(`${path} est introuvable dans le zip.`)

    const type = IMAGE_TYPES[extname(path).toLowerCase()]
    if (type) {
      if (entry.uncompressedSize > IMAGE_LIMIT) return { kind: 'too-large' }
      const data = await readStart(zip, entry, entry.uncompressedSize)
      return { kind: 'image', dataUrl: `data:${type};base64,${data.toString('base64')}` }
    }

    const data = await readStart(zip, entry, TEXT_LIMIT)
    // Un octet nul dans les premiers Ko : fichier binaire (.jar, .class, .ogg, .dat…).
    if (data.subarray(0, 8192).includes(0)) return { kind: 'binary' }
    return {
      kind: 'text',
      text: data.toString('utf8').replace(/^﻿/, ''),
      truncated: entry.uncompressedSize > TEXT_LIMIT
    }
  })
}
