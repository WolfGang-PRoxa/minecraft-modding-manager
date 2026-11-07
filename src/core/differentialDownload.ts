import { createHash } from 'node:crypto'
import { open, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { removeQuietly, renameWithRetry } from './fsutil'

// Téléchargement différentiel d'un installeur, à partir des fichiers `.blockmap` qu'electron-builder écrit à côté
// (gzip d'un JSON `{ version: "2", files: [{ name, offset, checksums, sizes }] }`). Un blockmap découpe le fichier en
// blocs de taille variable (8 à 32 Ko, découpage selon le contenu) : un bloc du nouvel installeur dont l'empreinte
// figure dans celui de l'installeur déjà présent est recopié depuis lui, les autres sont téléchargés par requêtes
// `Range`. Le résultat est vérifié par l'appelant (SHA-256 publié par GitHub), comme un téléchargement complet.

export interface BlockMapFile {
  name: string
  offset: number
  checksums: string[]
  sizes: number[]
}

export interface BlockMap {
  version: string
  files: BlockMapFile[]
}

/** Une étape de l'assemblage : des octets recopiés depuis l'ancien fichier, ou téléchargés depuis le nouveau. */
export interface DiffOperation {
  kind: 'copy' | 'download'
  /** Position dans l'ancien fichier (`copy`) ou dans le nouveau (`download`), fin exclue. */
  start: number
  end: number
}

export interface DiffPlan {
  /** Dans l'ordre du nouveau fichier : chaque étape écrit à la suite de la précédente. */
  operations: DiffOperation[]
  /** Taille du nouveau fichier. */
  size: number
  /** Taille de l'ancien fichier, d'après son blockmap. */
  baseSize: number
  /** Octets à télécharger. */
  downloadSize: number
}

/**
 * Une petite recopie entre deux téléchargements coûte une requête de plus, plus lente que de télécharger ces octets
 * avec le reste : en dessous de cette taille, elle est téléchargée.
 */
const MIN_COPY = 512 * 1024

export function parseBlockMap(data: Buffer): BlockMap {
  let parsed: unknown
  try {
    parsed = JSON.parse(gunzipSync(data).toString('utf8'))
  } catch {
    throw new Error('Blockmap illisible.')
  }
  const map = parsed as BlockMap
  const valid =
    map !== null &&
    typeof map === 'object' &&
    Array.isArray(map.files) &&
    map.files.length > 0 &&
    map.files.every(
      (file) =>
        file !== null &&
        typeof file === 'object' &&
        Number.isSafeInteger(file.offset) &&
        file.offset >= 0 &&
        Array.isArray(file.checksums) &&
        Array.isArray(file.sizes) &&
        file.checksums.length === file.sizes.length &&
        file.checksums.every((checksum) => typeof checksum === 'string') &&
        file.sizes.every((size) => Number.isSafeInteger(size) && size > 0)
    )
  if (!valid) throw new Error('Blockmap invalide.')
  return map
}

interface Block {
  checksum: string
  offset: number
  size: number
}

function blocksOf(map: BlockMap): { blocks: Block[]; size: number } {
  const blocks: Block[] = []
  let size = 0
  for (const file of map.files) {
    let offset = file.offset
    file.checksums.forEach((checksum, i) => {
      blocks.push({ checksum, offset, size: file.sizes[i] })
      offset += file.sizes[i]
    })
    size = Math.max(size, offset)
  }
  return { blocks, size }
}

/** Ce qui peut être recopié de l'ancien fichier, et ce qui doit être téléchargé, pour obtenir le nouveau. */
export function planDifferential(oldMap: BlockMap, newMap: BlockMap): DiffPlan {
  const old = blocksOf(oldMap)
  const fresh = blocksOf(newMap)
  const known = new Map<string, number>()
  for (const block of old.blocks) {
    const key = `${block.checksum}:${block.size}`
    if (!known.has(key)) known.set(key, block.offset)
  }

  // Blocs dans l'ordre du nouveau fichier, contigus : les étapes voisines de même nature se fondent en une seule.
  const steps: DiffOperation[] = []
  const push = (kind: DiffOperation['kind'], start: number, end: number) => {
    const last = steps.at(-1)
    if (last && last.kind === kind && last.end === start) last.end = end
    else steps.push({ kind, start, end })
  }
  let position = 0
  for (const block of fresh.blocks.slice().sort((a, b) => a.offset - b.offset)) {
    if (block.offset !== position) throw new Error('Blockmap invalide : blocs non contigus.')
    const from = known.get(`${block.checksum}:${block.size}`)
    if (from === undefined) push('download', block.offset, block.offset + block.size)
    else push('copy', from, from + block.size)
    position += block.size
  }

  // Une petite recopie entre deux téléchargements est téléchargée avec eux (positions du nouveau fichier).
  const operations: DiffOperation[] = []
  let at = 0
  steps.forEach((step, i) => {
    const length = step.end - step.start
    const between =
      step.kind === 'copy' && length < MIN_COPY && steps[i - 1]?.kind === 'download' && steps[i + 1]?.kind === 'download'
    const kind = between ? 'download' : step.kind
    const start = kind === 'download' ? at : step.start
    const last = operations.at(-1)
    if (kind === 'download' && last?.kind === 'download' && last.end === at) last.end = at + length
    else operations.push({ kind, start, end: start + length })
    at += length
  })

  const downloadSize = operations.reduce((sum, op) => sum + (op.kind === 'download' ? op.end - op.start : 0), 0)
  return { operations, size: fresh.size, baseSize: old.size, downloadSize }
}

export interface DifferentialDownloadOptions {
  /** L'ancien fichier, celui que décrit le premier blockmap du plan. */
  baseFile: string
  /** Adresse du nouveau fichier (requêtes `Range`). */
  url: string
  destination: string
  plan: DiffPlan
  userAgent: string
  signal?: AbortSignal
  /** `done` / `total` : octets téléchargés sur `plan.downloadSize`. */
  onProgress?: (progress: { done: number; total: number }) => void
}

/**
 * Assemble le nouveau fichier dans `destination` (qui n'apparaît qu'une fois complet) et renvoie son SHA-256.
 * Échoue si le serveur ne répond pas exactement aux plages demandées : l'appelant télécharge alors tout le fichier.
 */
export async function downloadDifferential(options: DifferentialDownloadOptions): Promise<{ sha256: string; size: number }> {
  const { plan, signal, onProgress } = options
  const partial = `${options.destination}.part`
  await mkdir(dirname(options.destination), { recursive: true })
  const base = await open(options.baseFile, 'r')
  const out = await open(partial, 'w')
  const hash = createHash('sha256')
  let written = 0
  let done = 0
  let lastEmit = 0

  const write = async (chunk: Uint8Array) => {
    hash.update(chunk)
    await out.write(chunk, 0, chunk.byteLength, written)
    written += chunk.byteLength
  }

  try {
    if ((await base.stat()).size !== plan.baseSize) throw new Error('Le fichier de base ne correspond pas à son blockmap.')
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    for (const op of plan.operations) {
      signal?.throwIfAborted()
      if (op.kind === 'copy') {
        for (let position = op.start; position < op.end; ) {
          const length = Math.min(buffer.length, op.end - position)
          const { bytesRead } = await base.read(buffer, 0, length, position)
          if (bytesRead !== length) throw new Error('Lecture du fichier de base interrompue.')
          await write(buffer.subarray(0, length))
          position += length
        }
        continue
      }
      const expected = op.end - op.start
      const res = await fetch(options.url, {
        headers: { 'User-Agent': options.userAgent, Range: `bytes=${op.start}-${op.end - 1}` },
        redirect: 'follow',
        signal
      })
      // 200 : le serveur ignore les plages et enverrait tout le fichier.
      if (res.status !== 206 || !res.body) {
        await res.body?.cancel().catch(() => {})
        throw new Error(`Téléchargement partiel refusé (HTTP ${res.status}).`)
      }
      const range = /^bytes (\d+)-(\d+)\//.exec(res.headers.get('content-range') ?? '')
      if (!range || Number(range[1]) !== op.start || Number(range[2]) !== op.end - 1) {
        await res.body.cancel().catch(() => {})
        throw new Error('Le serveur n’a pas renvoyé la plage demandée.')
      }
      let received = 0
      const reader = res.body.getReader()
      for (;;) {
        const { done: finished, value } = await reader.read()
        if (finished) break
        received += value.byteLength
        if (received > expected) {
          await reader.cancel().catch(() => {})
          throw new Error('Le serveur a renvoyé plus que la plage demandée.')
        }
        await write(value)
        done += value.byteLength
        const now = Date.now()
        if (onProgress && now - lastEmit > 120) {
          lastEmit = now
          onProgress({ done, total: plan.downloadSize })
        }
      }
      if (received !== expected) throw new Error('Le téléchargement a été interrompu avant la fin.')
    }
    if (written !== plan.size) throw new Error('Le fichier assemblé n’a pas la taille attendue.')
  } catch (err) {
    await out.close().catch(() => {})
    await base.close().catch(() => {})
    await removeQuietly(partial)
    throw err
  }
  await out.close()
  await base.close()
  onProgress?.({ done, total: plan.downloadSize })
  await renameWithRetry(partial, options.destination)
  return { sha256: hash.digest('hex'), size: written }
}
