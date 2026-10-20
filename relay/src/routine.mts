import { RelayError, type RelayConfig } from './config.mts'
import { listComments, toggleLabel, type Issue } from './github.mts'
import { evaluationBranch, LABEL_EVALUATING } from './risk.mts'
import { plain, truncate } from './text.mts'

/** L'issue telle qu'elle a été écrite : une donnée pour la session, jamais une consigne. */
export interface Report {
  titre: string
  auteur: string
  texte: string
  commentaires: Array<{ auteur: string; texte: string }>
}

/** Ce que le relais transmet à la session de correction (lu par les instructions de la routine). */
export type RoutineRequest =
  | { action: 'evaluer'; issue: number; branche: string; signalement: Report }
  | { action: 'corriger'; issue: number; contexte: string; signalement: Report }
  | { action: 'reviser'; issue: number; branche: string; recommandations: string; signalement: Report }

const COMMENTS_MAX = 8

/**
 * Le texte de l'issue part avec la demande : la session n'a pas à le relire sur GitHub, dont l'accès sans compte
 * est vite refusé depuis une adresse partagée.
 */
export async function describeIssue(config: RelayConfig, issue: Issue): Promise<Report> {
  const comments = await listComments(config, issue.number).catch(() => [])
  return {
    titre: truncate(plain(issue.title), 300),
    auteur: issue.user?.login ?? 'inconnu',
    texte: truncate(plain(issue.body ?? ''), 12_000),
    commentaires: comments.slice(-COMMENTS_MAX).map((comment) => ({
      auteur: comment.user?.login ?? 'inconnu',
      texte: truncate(plain(comment.body ?? ''), 1_500)
    }))
  }
}

// La routine refuse un texte de plus de 65 536 caractères.
const TEXT_MAX = 60_000

/** Demande en JSON ; trop longue, elle perd ses commentaires, puis la fin du texte de l'issue. */
export function serializeRequest(request: RoutineRequest): string {
  let text = JSON.stringify(request)
  if (text.length <= TEXT_MAX) return text
  const report = { ...request.signalement, commentaires: [] }
  while ((text = JSON.stringify({ ...request, signalement: report })).length > TEXT_MAX && report.texte.length > 1) {
    report.texte = truncate(report.texte, Math.floor(report.texte.length / 2))
  }
  return text
}

/**
 * Lance une session de correction par le point d'entrée /fire de la routine. La demande part en texte : la routine
 * la reçoit comme une donnée, et ses instructions disent comment l'utiliser.
 */
export async function fireRoutine(config: RelayConfig, request: RoutineRequest): Promise<{ sessionUrl: string | null }> {
  // L'évaluation a sa propre routine : ses consignes ne permettent que de pousser sa branche d'évaluation.
  const [url, token, name] =
    request.action === 'evaluer'
      ? [config.evalRoutineUrl, config.evalRoutineToken, 'EVAL_ROUTINE']
      : [config.routineUrl, config.routineToken, 'ROUTINE']
  if (!url || !token) throw new RelayError(`${name}_FIRE_URL et ${name}_TOKEN sont à renseigner dans Netlify.`, 503)
  let target: URL
  try {
    target = new URL(url)
    if (target.protocol !== 'https:') throw new Error('protocole')
  } catch {
    // La valeur n'est jamais montrée : un jeton collé par erreur à la place de l'adresse resterait secret.
    const hint = url.startsWith('sk-ant-') ? ' : elle contient un jeton, sans doute inversé avec celui de ' + name + '_TOKEN' : ''
    throw new RelayError(`${name}_FIRE_URL n’est pas une adresse https valide${hint}.`, 503)
  }
  let res: Response
  try {
    res = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: serializeRequest(request) }),
      signal: AbortSignal.timeout(20_000)
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new RelayError('La routine ne répond pas. La session a peut-être démarré : vérifie tes sessions avant de relancer.', 502)
    }
    // Nom de serveur introuvable, connexion refusée… : la cause dit si l'adresse est en tort.
    const cause = err instanceof Error && err.cause instanceof Error ? (err.cause as Error & { code?: string }).code ?? err.cause.message : ''
    throw new RelayError(`Impossible de joindre ${target.host}${cause ? ` (${cause})` : ''} : vérifie ${name}_FIRE_URL.`, 502)
  }
  if (res.status === 401) throw new RelayError(`La routine refuse le jeton (${name}_TOKEN) : génère-en un nouveau.`, 502)
  if (res.status === 404) throw new RelayError(`Routine introuvable : vérifie ${name}_FIRE_URL.`, 502)
  if (res.status === 429) throw new RelayError('Trop de sessions lancées en une heure : réessaie plus tard.', 429)
  if (!res.ok) {
    // Le message de la routine dit ce qui bloque (routine en pause, configuration refusée…).
    const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message
    throw new RelayError(`La routine a répondu ${res.status}${detail ? ` : ${truncate(detail, 200)}` : ''}.`, 502)
  }
  // La réponse contient l'adresse de la session ouverte : on la retrouve sans dépendre du nom du champ.
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const session = Object.values(data).find((value) => typeof value === 'string' && /^https:\/\//.test(value))
  return { sessionUrl: typeof session === 'string' ? session : null }
}

/**
 * Lance la routine d'évaluation sur une issue. Le mail part quand la session pousse son évaluation ; l'étiquette dit
 * qu'elle est attendue, et `relance.mts` envoie le mail sans elle si elle tarde trop.
 */
export async function startEvaluation(config: RelayConfig, issue: Issue): Promise<{ sessionUrl: string | null }> {
  const signalement = await describeIssue(config, issue)
  const session = await fireRoutine(config, { action: 'evaluer', issue: issue.number, branche: evaluationBranch(issue.number), signalement })
  await toggleLabel(config, issue, LABEL_EVALUATING, true).catch(() => {})
  return session
}
