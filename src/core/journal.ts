// Journal des opérations d'écriture (création de version, publication, suppression…), quel que soit le processus qui
// les a faites : une ligne JSON par opération. L'interface et Claude le lisent pour savoir ce qui s'est passé, par
// exemple pendant un passage automatique. Au-delà de MAX_SIZE, le fichier devient `<nom>.old.jsonl` (un seul gardé).
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface JournalEntry {
  at: string
  /** « l’application », « la ligne de commande »… */
  source: string
  operation: string
  ok: boolean
  /** Résumé du résultat (« Pack_A-v3.zip », « 2 changements »…). */
  detail?: string
  error?: string
  durationMs: number
}

const MAX_SIZE = 512 * 1024

export class Journal {
  constructor(
    readonly file: string,
    private readonly source: string
  ) {}

  private get oldFile(): string {
    return this.file.replace(/\.jsonl$/, '') + '.old.jsonl'
  }

  /** N'échoue jamais : une opération réussie ne doit pas devenir une erreur parce que le journal est illisible. */
  async append(entry: Omit<JournalEntry, 'at' | 'source'>): Promise<void> {
    try {
      await mkdir(dirname(this.file), { recursive: true })
      const size = (await stat(this.file).catch(() => null))?.size ?? 0
      if (size > MAX_SIZE) await rename(this.file, this.oldFile)
      const line: JournalEntry = { at: new Date().toISOString(), source: this.source, ...entry }
      await appendFile(this.file, JSON.stringify(line) + '\n', 'utf8')
    } catch {
      // journal facultatif
    }
  }

  /** Les dernières opérations, de la plus récente à la plus ancienne. */
  async read(limit = 50): Promise<JournalEntry[]> {
    const lines: string[] = []
    for (const file of [this.oldFile, this.file]) {
      lines.push(...(await readFile(file, 'utf8').catch(() => '')).split('\n').filter(Boolean))
    }
    const entries: JournalEntry[] = []
    for (const line of lines.reverse()) {
      if (entries.length >= limit) break
      try {
        entries.push(JSON.parse(line) as JournalEntry)
      } catch {
        // ligne tronquée
      }
    }
    return entries
  }
}
