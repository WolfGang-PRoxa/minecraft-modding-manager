// Verrou des opérations d'écriture, partagé par tous les processus (fenêtre, ligne de commande, serveur MCP) : un
// fichier créé de façon exclusive, qui dit qui travaille et sur quoi. Un verrou laissé par un processus disparu (ou
// trop vieux) est ignoré : il ne bloque jamais l'application.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, open, readFile, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { StudioError } from './studio/analyze'

export interface LockInfo {
  /** « la publication »… */
  operation: string
  /** « l’application », « la ligne de commande »… */
  holder: string
  pid: number
  startedAt: string
  token: string
}

/** Au-delà, un verrou est considéré comme abandonné, même si son processus existe encore (numéro réutilisé). */
const MAX_AGE_MS = 24 * 3600 * 1000

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM : le processus existe mais appartient à un autre utilisateur.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function parse(text: string): LockInfo | null {
  try {
    const info = JSON.parse(text) as LockInfo
    return typeof info.pid === 'number' && typeof info.operation === 'string' ? info : null
  } catch {
    return null
  }
}

const isLive = (info: LockInfo | null): info is LockInfo =>
  info !== null && isAlive(info.pid) && Date.now() - Date.parse(info.startedAt) < MAX_AGE_MS

export class OperationLock {
  constructor(
    readonly file: string,
    /** Qui prend le verrou, tel qu'un autre processus l'affichera. */
    private readonly holder: string
  ) {}

  /** Opération en cours dans un processus vivant, sinon null. Synchrone : appelée pour griser un bouton. */
  currentSync(): LockInfo | null {
    try {
      const info = parse(readFileSync(this.file, 'utf8'))
      return isLive(info) ? info : null
    } catch {
      return null
    }
  }

  /** Prend le verrou, ou explique qui le tient. Renvoie la fonction qui le rend. */
  async acquire(operation: string): Promise<() => Promise<void>> {
    await mkdir(dirname(this.file), { recursive: true })
    const info: LockInfo = {
      operation,
      holder: this.holder,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      token: randomUUID()
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(this.file, 'wx')
        try {
          await handle.writeFile(JSON.stringify(info))
        } finally {
          await handle.close()
        }
        return () => this.release(info.token)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        const other = parse(await readFile(this.file, 'utf8').catch(() => ''))
        if (isLive(other)) {
          const where = other.pid === process.pid ? '' : ` (${other.holder})`
          throw new StudioError(`Patiente : ${other.operation}${where} est en cours.`)
        }
        // Verrou abandonné (processus arrêté net) : on le retire et on réessaie une fois.
        await rm(this.file, { force: true })
      }
    }
    throw new StudioError('Impossible de prendre le verrou des opérations : réessaie dans un instant.')
  }

  private async release(token: string): Promise<void> {
    const current = parse(await readFile(this.file, 'utf8').catch(() => ''))
    if (current?.token === token) await rm(this.file, { force: true })
  }
}
