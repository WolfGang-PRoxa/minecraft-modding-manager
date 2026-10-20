import type { RelayConfig } from './config.mts'
import { branchHead, deleteBranch, getCommit, listRecentIssues, type Issue } from './github.mts'
import { truncate } from './text.mts'

// Évaluation du risque d'une issue, faite par une session Claude Code (la routine « évaluation », sur l'abonnement du
// propriétaire) et jointe aux mails. Une issue vient de n'importe qui, et son texte pilote une session qui écrit du
// code : l'évaluation signale ce qui ressemble à une tentative de détourner cette session. Elle reste indicative (le
// texte évalué peut chercher à la tromper aussi) ; le blocage des fichiers sensibles, lui, ne dépend pas d'elle.
//
// La session livre son évaluation dans le message d'un commit vide, poussé sur la branche `evaluation/issue-<N>` :
// rien n'entre dans le code du dépôt, et ce push réveille le relais, qui envoie alors le mail.

export type RiskLevel = 'faible' | 'moyen' | 'eleve'

export type RiskAssessment =
  | { status: 'ok'; level: RiskLevel; summary: string; points: string[] }
  /** Pas d'évaluation : la raison est montrée telle quelle dans le mail. */
  | { status: 'unavailable'; reason: string }

/** Branche où la routine pousse l'évaluation d'une issue. */
export const evaluationBranch = (issue: number) => `evaluation/issue-${issue}`

/** Branches possibles d'une évaluation : la session se replie sur la seconde si la première lui est refusée. */
const evaluationBranches = (issue: number) => [evaluationBranch(issue), `claude/evaluation-issue-${issue}`]

const EVALUATION_BRANCH = /^(?:evaluation\/|claude\/evaluation-)issue-(\d+)$/

export function issueOfEvaluationBranch(branch: string): number | null {
  const match = EVALUATION_BRANCH.exec(branch)
  return match ? Number(match[1]) : null
}

/** Étiquette posée sur l'issue tant que son évaluation est attendue (voir `relance.mts`). */
export const LABEL_EVALUATING = 'evaluation-en-cours'

/** Étiquette d'une évaluation attendue dont le mail est déjà parti sans elle, faute de réponse à temps. */
export const LABEL_EVALUATION_LATE = 'evaluation-en-retard'

/** L'évaluation écrite dans un message de commit : un objet JSON `{ niveau, resume, points }` dans son corps. */
export function parseEvaluation(message: string): RiskAssessment {
  const start = message.indexOf('{')
  const end = message.lastIndexOf('}')
  try {
    if (start < 0 || end <= start) throw new Error('json')
    const parsed = JSON.parse(message.slice(start, end + 1)) as { niveau?: unknown; resume?: unknown; points?: unknown }
    const level = parsed.niveau
    if (level !== 'faible' && level !== 'moyen' && level !== 'eleve') throw new Error('niveau')
    const points = Array.isArray(parsed.points) ? parsed.points.map((point) => truncate(String(point), 400)).slice(0, 8) : []
    return { status: 'ok', level, summary: truncate(String(parsed.resume ?? ''), 800), points }
  } catch {
    return { status: 'unavailable', reason: 'la session d’évaluation a laissé une réponse illisible.' }
  }
}

/** L'évaluation déjà poussée pour une issue, ou la raison de son absence. */
export async function readEvaluation(config: RelayConfig, issue: number): Promise<RiskAssessment> {
  for (const branch of evaluationBranches(issue)) {
    const head = await branchHead(config, branch).catch(() => null)
    if (head) return parseEvaluation((await getCommit(config, head)).message)
  }
  return { status: 'unavailable', reason: 'aucune évaluation n’a été faite pour cette issue.' }
}

/** Retire l'évaluation d'une issue (issue réglée, ou nouvelle évaluation demandée). */
export async function deleteEvaluation(config: RelayConfig, issue: number): Promise<void> {
  await Promise.all(evaluationBranches(issue).map((branch) => deleteBranch(config, branch).catch(() => {})))
}

/**
 * Une évaluation automatique est-elle permise pour cette issue ? N'importe qui peut ouvrir des issues : seules les
 * `evalDailyMax` premières ouvertes en 24 h sont évaluées d'office, pour ne pas épuiser l'abonnement du propriétaire.
 * Les autres se font évaluer depuis le bouton du mail.
 */
export async function autoEvaluationAllowed(config: RelayConfig, issue: Issue, now = Date.now()): Promise<boolean> {
  if (!config.evalRoutineUrl || !config.evalRoutineToken || config.evalDailyMax <= 0) return false
  const since = new Date(now - 24 * 3600 * 1000).toISOString()
  const recent = (await listRecentIssues(config, since)).filter((other) => other.created_at >= since)
  const earlier = recent.filter((other) => other.created_at < issue.created_at || (other.created_at === issue.created_at && other.number < issue.number))
  return earlier.length < config.evalDailyMax
}
