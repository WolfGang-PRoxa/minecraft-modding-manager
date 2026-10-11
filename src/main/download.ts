import { app } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { finished } from 'node:stream/promises'
import { removeQuietly, renameWithRetry } from '../core/fsutil'

export interface DownloadProgress {
  done: number
  total: number
  bytesPerSecond: number
}

export interface DownloadOptions {
  url: string
  destination: string
  expectedSize?: number
  signal?: AbortSignal
  onProgress?: (progress: DownloadProgress) => void
}

/** Estime le débit sur une fenêtre glissante de quelques secondes. */
export class SpeedMeter {
  private samples: Array<{ t: number; bytes: number }> = []

  push(bytes: number): number {
    const now = Date.now()
    this.samples.push({ t: now, bytes })
    while (this.samples.length > 2 && now - this.samples[0].t > 3000) this.samples.shift()
    const first = this.samples[0]
    const elapsed = (now - first.t) / 1000
    return elapsed > 0.2 ? (bytes - first.bytes) / elapsed : 0
  }
}

/**
 * Télécharge un fichier en streaming vers `destination` et renvoie son empreinte SHA-256.
 * Le fichier n'apparaît à sa place définitive qu'une fois complet.
 */
export async function downloadFile(options: DownloadOptions): Promise<{ sha256: string; size: number }> {
  const { url, destination, signal, onProgress } = options
  const partial = `${destination}.part`
  await mkdir(dirname(destination), { recursive: true })

  const res = await fetch(url, {
    headers: { 'User-Agent': `ModpackManager/${app.getVersion()}` },
    redirect: 'follow',
    signal
  })
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (HTTP ${res.status}).`)

  // Avec un encodage de transfert (gzip…), content-length ne correspond pas aux octets reçus.
  const encoded = Boolean(res.headers.get('content-encoding'))
  const total = (!encoded && Number(res.headers.get('content-length'))) || options.expectedSize || 0
  const hash = createHash('sha256')
  const out = createWriteStream(partial)
  const meter = new SpeedMeter()
  let done = 0
  let lastEmit = 0

  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done: finishedReading, value } = await reader.read()
      if (finishedReading) break
      hash.update(value)
      done += value.byteLength
      if (!out.write(value)) await new Promise<void>((resolve) => out.once('drain', () => resolve()))
      const now = Date.now()
      if (onProgress && now - lastEmit > 120) {
        lastEmit = now
        onProgress({ done, total, bytesPerSecond: meter.push(done) })
      }
    }
    out.end()
    await finished(out)
  } catch (err) {
    out.destroy()
    await removeQuietly(partial)
    throw err
  }

  if (total && !encoded && done !== total) {
    await removeQuietly(partial)
    throw new Error('Le téléchargement a été interrompu avant la fin.')
  }
  onProgress?.({ done, total: total || done, bytesPerSecond: 0 })
  await renameWithRetry(partial, destination)
  return { sha256: hash.digest('hex'), size: done }
}
