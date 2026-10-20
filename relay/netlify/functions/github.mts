import { loadConfig, RelayError, type RelayConfig } from '../../src/config.mts'
import {
  compare,
  compareUrl,
  getIssue,
  issueOfBranch,
  LABEL_PROPOSED,
  setFixLabel,
  takeLabel,
  type Issue
} from '../../src/github.mts'
import { emptyProposalMail, proposalMail, sendMail } from '../../src/mail.mts'
import { sendIssueMail } from '../../src/notify.mts'
import {
  autoEvaluationAllowed,
  deleteEvaluation,
  issueOfEvaluationBranch,
  LABEL_EVALUATING,
  LABEL_EVALUATION_LATE,
  parseEvaluation,
  readEvaluation
} from '../../src/risk.mts'
import { startEvaluation } from '../../src/routine.mts'
import { sensitiveFiles } from '../../src/sensitive.mts'
import { signLink, verifyGitHubSignature } from '../../src/sign.mts'
import { splitCommitMessage } from '../../src/text.mts'

// Webhook du dépôt GitHub :
//  - une issue est ouverte : la routine d'évaluation est lancée (dans la limite du jour), sinon le propriétaire reçoit
//    tout de suite le mail « corriger / ajouter du contexte », avec un bouton pour faire évaluer l'issue ;
//  - la routine pousse son évaluation (`evaluation/issue-<N>`) : le propriétaire reçoit ce mail, évaluation comprise ;
//  - une session de correction pousse sa branche : le propriétaire reçoit le mail « valider / invalider », avec le
//    résumé écrit par la session dans son message de commit et l'évaluation de l'issue ;
//  - une issue est fermée : sa branche d'évaluation est supprimée.
// Une proposition qui touche un fichier sensible ne peut pas être validée depuis le mail.

interface IssuesEvent {
  action: string
  issue: Issue
}

interface PushEvent {
  ref: string
  after: string
  deleted: boolean
  head_commit: { message: string } | null
  repository: { default_branch: string }
}

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })

async function onIssueOpened(req: Request, event: IssuesEvent): Promise<Response> {
  const config = loadConfig(req, ['repo', 'githubToken', 'linkSecret', 'resendKey', 'ownerEmail'])
  const issue = event.issue
  // Rouverte : une évaluation déjà faite est reprise telle quelle.
  const previous = event.action === 'reopened' ? await readEvaluation(config, issue.number) : null
  if (previous?.status === 'ok') return json(200, { mail: 'issue', issue: issue.number, id: await sendIssueMail(config, issue, previous) })

  let reason = 'la routine d’évaluation n’est pas configurée (EVAL_ROUTINE_FIRE_URL, EVAL_ROUTINE_TOKEN).'
  if (config.evalRoutineUrl && config.evalRoutineToken) {
    reason = `${config.evalDailyMax} issues ont déjà été évaluées d’office ces dernières 24 h : le bouton « Faire évaluer le risque » la lance.`
    if (event.action === 'opened' && (await autoEvaluationAllowed(config, issue).catch(() => false))) {
      try {
        await startEvaluation(config, issue)
        // Le mail partira avec l'évaluation, quand la session l'aura poussée.
        return json(202, { evaluation: 'lancée', issue: issue.number })
      } catch (err) {
        reason = `la routine d’évaluation n’a pas démarré (${err instanceof Error ? err.message : String(err)}).`
      }
    }
  }
  const id = await sendIssueMail(config, issue, { status: 'unavailable', reason })
  return json(200, { mail: 'issue', issue: issue.number, id })
}

/** La routine a poussé son évaluation : le mail « nouvelle issue » part, avec elle. */
async function onEvaluationPushed(config: RelayConfig, number: number, event: PushEvent): Promise<Response> {
  // Seule une évaluation attendue donne un mail, et une seule fois : GitHub peut livrer le même push deux fois, et
  // seul le premier à retirer l'étiquette la retire vraiment.
  const waited = await takeLabel(config, number, LABEL_EVALUATING)
  const late = !waited && (await takeLabel(config, number, LABEL_EVALUATION_LATE))
  if (!waited && !late) return json(202, { ignored: 'évaluation déjà envoyée ou non demandée', issue: number })
  const issue = await getIssue(config, number)
  const risk = parseEvaluation(event.head_commit?.message ?? '')
  const id = await sendIssueMail(config, issue, risk)
  return json(200, { mail: 'evaluation', issue: number, id, risk: risk.status === 'ok' ? risk.level : null, late })
}

async function onPush(req: Request, event: PushEvent): Promise<Response> {
  const branch = event.ref.replace(/^refs\/heads\//, '')
  if (event.deleted || !event.head_commit) return json(202, { ignored: 'push' })

  const evaluated = issueOfEvaluationBranch(branch)
  if (evaluated !== null) {
    return onEvaluationPushed(loadConfig(req, ['repo', 'githubToken', 'linkSecret', 'resendKey', 'ownerEmail']), evaluated, event)
  }

  const number = issueOfBranch(branch)
  if (number === null) return json(202, { ignored: 'push' })
  const config = loadConfig(req, ['repo', 'githubToken', 'linkSecret', 'resendKey', 'ownerEmail'])
  const base = event.repository.default_branch
  const { title, summary } = splitCommitMessage(event.head_commit.message)
  const [issue, { files }, risk] = await Promise.all([getIssue(config, number), compare(config, base, event.after), readEvaluation(config, number)])
  // Le lien ne vaut que pour ce commit : une proposition plus récente périme les boutons de ce mail.
  const link = (a: 'valider' | 'invalider') => `${config.baseUrl}/action?t=${signLink({ a, i: number, b: branch, h: event.after }, config.linkSecret)}`

  if (files.length === 0) {
    // Rien à fusionner : la session explique pourquoi, le propriétaire peut préciser sa demande.
    await setFixLabel(config, issue, null).catch(() => {})
    const id = await sendMail(config, emptyProposalMail(issue, { title, summary }, { reject: link('invalider') }, risk))
    return json(200, { mail: 'sans-correction', issue: number, id })
  }

  // L'étiquette n'est qu'un repère : son échec ne doit pas priver le propriétaire du mail.
  await setFixLabel(config, issue, LABEL_PROPOSED).catch(() => {})
  const proposal = { title: title || `fix: issue #${number}`, summary, files, diffUrl: compareUrl(config, base, branch) }
  const sensitive = sensitiveFiles(files)
  const id = await sendMail(config, proposalMail(issue, proposal, { approve: link('valider'), reject: link('invalider') }, { risk, sensitive }))
  return json(200, { mail: 'proposition', issue: number, id, sensitive: sensitive.length })
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'POST attendu' })
  const body = await req.text()
  try {
    const config = loadConfig(req, ['repo', 'webhookSecret'])
    if (!verifyGitHubSignature(body, req.headers.get('x-hub-signature-256'), config.webhookSecret)) {
      return json(401, { error: 'signature invalide' })
    }
    const event = req.headers.get('x-github-event')
    const payload = JSON.parse(body) as { repository?: { full_name?: string } }
    if (event === 'ping') return json(200, { ok: true })
    if (payload.repository?.full_name?.toLowerCase() !== config.repo.toLowerCase()) return json(202, { ignored: 'autre dépôt' })

    if (event === 'issues') {
      const issues = payload as unknown as IssuesEvent
      if (issues.action === 'opened' || issues.action === 'reopened') return await onIssueOpened(req, issues)
      if (issues.action === 'closed') {
        const withToken = loadConfig(req, ['repo', 'githubToken'])
        await deleteEvaluation(withToken, issues.issue.number)
        return json(200, { closed: issues.issue.number })
      }
    }
    if (event === 'push') return await onPush(req, payload as unknown as PushEvent)
    return json(202, { ignored: event })
  } catch (err) {
    // Le détail reste dans les livraisons du webhook, visibles du seul propriétaire du dépôt.
    const status = err instanceof RelayError ? err.status : 500
    return json(status, { error: err instanceof Error ? err.message : String(err) })
  }
}

export const config = { path: '/github' }
