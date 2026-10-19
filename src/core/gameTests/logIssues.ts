// Erreurs relevées dans le journal d'un serveur ou d'un client pendant un test, même quand il démarre : un modpack en
// écrit souvent beaucoup sans gravité, donc chacune porte une clé stable (le message sans ses nombres) qui permet de
// trouver celles qu'une mise à jour fait apparaître, en comparant avec le test du profil d'origine.
import type { LogIssue } from '../../shared/studio'

/** Ligne de journal de Minecraft : « [12:34:56] [Server thread/ERROR]: … » ou, chez Forge, « … [main/ERROR] [nom/]: … ». */
const LINE = /^\[[^\]]+\] \[([^\]]*)\/(ERROR|FATAL|WARN)\](?: \[([^\]]*)\])?:? ?(.*)$/

/** Les avertissements retenus : ceux qui parlent d'un échec, pas les conseils de configuration. */
const WARNING_WORTH = /exception|error|fail|unable to|could ?n['’]?t|could not|invalid|missing|unknown|not found|crash/i

/** Première ligne d'une exception (« java.lang.NullPointerException: … », « Caused by: … »). */
const EXCEPTION = /^(?:Caused by: )?(?:[a-z_$][\w$]*\.)+[A-Z][\w$]*(?:Exception|Error|Throwable)\b/

const MAX_ISSUES = 300
const MAX_MESSAGE = 400

/** Le message sans ce qui change d'un lancement à l'autre (nombres, empreintes, identifiants, chemins temporaires). */
export function issueKey(level: string, source: string | null, message: string): string {
  const normalized = message
    .toLowerCase()
    .replace(/[a-z]:[\\/][^\s'"]*/g, '<chemin>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<id>')
    .replace(/\b0x[0-9a-f]+\b/g, '<hex>')
    .replace(/\b[0-9a-f]*\d[0-9a-f]*\b/g, (m) => (m.length >= 6 && /[a-f]/.test(m) ? '<hex>' : m))
    .replace(/-?\d+(\.\d+)*/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
  return `${level}|${source ?? ''}|${normalized}`
}

/** Regroupe les erreurs d'un journal, au fil de ses lignes. */
export class LogIssueCollector {
  private readonly issues = new Map<string, LogIssue>()
  private last: LogIssue | null = null

  add(line: string): void {
    const match = LINE.exec(line)
    if (!match) {
      if (this.last && !this.last.detail && EXCEPTION.test(line.trim())) this.last.detail = line.trim().slice(0, MAX_MESSAGE)
      if (!/^\s+at |^\s*\.\.\. \d+ more|^Caused by|^\s*$/.test(line) && !EXCEPTION.test(line.trim())) this.last = null
      return
    }
    const [, , rawLevel, logger, rawMessage] = match
    const level = rawLevel === 'WARN' ? 'warning' : 'error'
    const message = rawMessage.trim().slice(0, MAX_MESSAGE)
    if (level === 'warning' && !WARNING_WORTH.test(message)) {
      this.last = null
      return
    }
    const source = logger ? (logger.split('/')[0].split('.').pop() ?? null) || null : null
    const key = issueKey(level, source, message)
    let issue = this.issues.get(key)
    if (issue) issue.count++
    else if (this.issues.size < MAX_ISSUES) {
      issue = { level, source, message, detail: null, count: 1, key }
      this.issues.set(key, issue)
    }
    this.last = issue ?? null
  }

  /** Les erreurs d'abord, puis les plus fréquentes. */
  list(): LogIssue[] {
    return [...this.issues.values()].sort((a, b) => (a.level === b.level ? b.count - a.count : a.level === 'error' ? -1 : 1))
  }
}

/** Les erreurs de `current` absentes de `baseline` (même clé). */
export function newIssues(current: LogIssue[] | undefined, baseline: LogIssue[] | undefined): LogIssue[] {
  const known = new Set((baseline ?? []).map((i) => i.key))
  return (current ?? []).filter((i) => !known.has(i.key))
}

/** Une erreur en une ligne, pour un message ou une note. */
export const describeIssue = (issue: LogIssue) =>
  `${issue.source ? `[${issue.source}] ` : ''}${issue.message}${issue.detail ? ` — ${issue.detail}` : ''}${issue.count > 1 ? ` (×${issue.count})` : ''}`
