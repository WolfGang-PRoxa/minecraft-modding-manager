import { loadConfig, RelayError, type RelayConfig } from '../../src/config.mts'
import {
  branchHead,
  closeIssue,
  compare,
  compareUrl,
  defaultBranch,
  deleteBranch,
  findFixBranch,
  getCommit,
  getIssue,
  hasLabel,
  LABEL_RUNNING,
  setFixLabel,
  type Issue
} from '../../src/github.mts'
import { mergeProposal } from '../../src/merge.mts'
import { errorPage, formPage, linkTo, quoteBlock, resultPage } from '../../src/pages.mts'
import { evaluationBranch, LABEL_EVALUATING } from '../../src/risk.mts'
import { describeIssue, fireRoutine, startEvaluation } from '../../src/routine.mts'
import { sensitiveFiles } from '../../src/sensitive.mts'
import { signLink, verifyLink, type LinkPayload } from '../../src/sign.mts'
import { esc, splitCommitMessage, truncate, unwrap } from '../../src/text.mts'

// Pages ouvertes par les boutons des mails. GET affiche une page de confirmation, POST agit :
//  - corriger / contexte : lance une session de correction sur l'issue ;
//  - evaluer : lance la routine d'évaluation du risque (le mail suit quand elle a fini) ;
//  - valider : pose la proposition sur la branche principale, telle qu'elle a été résumée dans le mail, sauf si elle
//    touche un fichier sensible (à fusionner à la main) ;
//  - invalider : renvoie la correction en session, avec les recommandations du propriétaire.

const repoUrl = (config: RelayConfig) => `https://github.com/${config.repo}`
const issueUrl = (config: RelayConfig, number: number) => `${repoUrl(config)}/issues/${number}`

const issueIntro = (issue: Issue) =>
  `<p>Issue #${issue.number} : <strong>${esc(issue.title)}</strong></p>${quoteBlock(truncate(issue.body ?? '', 1500) || '(sans description)')}`

/** Ce qui empêche de lancer une correction, sinon null. */
async function fixBlocker(config: RelayConfig, issue: Issue): Promise<Response | null> {
  if (issue.state !== 'open') {
    return resultPage('Issue fermée', `<p>L’issue #${issue.number} est fermée : rien à corriger. ${linkTo(issue.html_url, 'Voir l’issue')}</p>`, 'warn')
  }
  // Une branche de correction existe : une proposition attend déjà une réponse.
  const branch = await findFixBranch(config, issue.number)
  if (!branch) return null
  const revise = `${config.baseUrl}/action?t=${signLink({ a: 'invalider', i: issue.number, b: branch }, config.linkSecret)}`
  const diff = compareUrl(config, await defaultBranch(config), branch)
  return resultPage(
    'Correction déjà proposée',
    `<p>Une proposition attend déjà ta réponse pour l’issue #${issue.number}. Pour la valider, utilise le bouton du dernier mail « Correction proposée ».</p><p>${linkTo(diff, 'Voir la proposition')} · ${linkTo(revise, 'Demander une révision')}</p>`,
    'warn'
  )
}

async function showEvaluate(config: RelayConfig, link: LinkPayload, token: string): Promise<Response> {
  const issue = await getIssue(config, link.i)
  const waiting = hasLabel(issue, LABEL_EVALUATING)
  return formPage({
    title: `Faire évaluer l’issue #${issue.number}`,
    intro: `${issueIntro(issue)}${
      waiting ? '<p class="warn">Une évaluation est déjà en cours pour cette issue.</p>' : ''
    }<p class="note">Une session Claude Code lit l’issue et évalue son risque, sans toucher au code. Tu recevras le mail de l’issue, évaluation comprise, dans quelques minutes.</p>`,
    token,
    submit: waiting ? 'Relancer quand même' : 'Lancer l’évaluation'
  })
}

async function runEvaluate(config: RelayConfig, link: LinkPayload): Promise<Response> {
  const issue = await getIssue(config, link.i)
  // Une évaluation précédente est remplacée : la routine repart de la branche principale.
  await deleteBranch(config, evaluationBranch(issue.number)).catch(() => {})
  const session = await startEvaluation(config, issue)
  return resultPage(
    'Évaluation lancée',
    `<p>Une session évalue l’issue #${issue.number}. Le mail suivra dès qu’elle aura fini.</p>${session.sessionUrl ? `<p>${linkTo(session.sessionUrl, 'Suivre la session')}</p>` : ''}`
  )
}

async function showFix(config: RelayConfig, link: LinkPayload, token: string): Promise<Response> {
  const issue = await getIssue(config, link.i)
  const blocker = await fixBlocker(config, issue)
  if (blocker) return blocker
  const running = hasLabel(issue, LABEL_RUNNING)
  const warning = running ? '<p class="warn">Une correction a déjà été lancée pour cette issue. Tu peux en relancer une autre.</p>' : ''
  const withContext = link.a === 'contexte'
  return formPage({
    title: withContext ? `Corriger l’issue #${issue.number} avec du contexte` : `Corriger l’issue #${issue.number}`,
    intro: `${issueIntro(issue)}${warning}<p class="note">Une session de correction s’ouvre sur le dépôt. Tu recevras un mail avec le résumé de la correction, à valider ou non.</p>`,
    token,
    submit: running ? 'Relancer quand même' : withContext ? 'Lancer avec ce contexte' : 'Lancer la correction',
    force: running,
    field: withContext
      ? { label: 'Contexte pour la correction', placeholder: 'Ce que tu sais du problème, ce que tu attends, ce qu’il ne faut pas toucher…', required: true }
      : undefined
  })
}

async function runFix(config: RelayConfig, link: LinkPayload, text: string, force: boolean, token: string): Promise<Response> {
  const issue = await getIssue(config, link.i)
  const blocker = await fixBlocker(config, issue)
  if (blocker) return blocker
  if (hasLabel(issue, LABEL_RUNNING) && !force) return showFix(config, link, token)
  if (link.a === 'contexte' && !text) throw new RelayError('Écris ton contexte avant de lancer la correction.', 400)

  const signalement = await describeIssue(config, issue)
  const session = await fireRoutine(config, { action: 'corriger', issue: issue.number, contexte: text, signalement })
  await setFixLabel(config, issue, LABEL_RUNNING).catch(() => {})
  return resultPage('Correction lancée', sessionHtml(session.sessionUrl))
}

const sessionHtml = (url: string | null) =>
  `<p>Une session de correction travaille sur le dépôt. Tu recevras un mail dès que sa proposition sera prête.</p>${
    url ? `<p>${linkTo(url, 'Suivre la session')}</p>` : ''
  }`

/**
 * La proposition visée par un lien « valider » ou « invalider », ou la page qui dit pourquoi le lien ne vaut plus :
 * une validation ne vaut que pour la proposition résumée dans le mail dont elle vient.
 */
async function currentProposal(config: RelayConfig, link: LinkPayload): Promise<{ head: string; title: string; summary: string } | Response> {
  const head = await branchHead(config, link.b!)
  if (!head) {
    return resultPage(
      'Déjà traitée',
      `<p>Cette proposition n’existe plus : elle a été fusionnée ou abandonnée. ${linkTo(issueUrl(config, link.i), 'Voir l’issue')}</p>`,
      'warn'
    )
  }
  if (link.h && head !== link.h) {
    return resultPage('Proposition remplacée', '<p>Une proposition plus récente existe pour cette issue : utilise les boutons du dernier mail reçu.</p>', 'warn')
  }
  const { title, summary } = splitCommitMessage((await getCommit(config, head)).message)
  return { head, title: title || `fix: issue #${link.i}`, summary }
}

/**
 * Page qui refuse la fusion depuis le mail, sinon null : une proposition qui touche un fichier sensible (publication,
 * build, dépendances, relais, consignes des sessions) se relit et se fusionne à la main. Vérifié à chaque fois sur la
 * proposition telle qu'elle est sur GitHub, pas d'après le mail.
 */
async function mergeBlocker(config: RelayConfig, base: string, branch: string, head: string): Promise<Response | null> {
  const changes = await compare(config, base, head)
  const diff = linkTo(compareUrl(config, base, branch), 'Relire les changements sur GitHub')
  if (!changes.complete) {
    return resultPage('Fusion à faire à la main', `<p>Cette proposition modifie trop de fichiers pour être vérifiée par le relais. ${diff}</p>`, 'warn')
  }
  const sensitive = sensitiveFiles(changes.files)
  if (sensitive.length === 0) return null
  return resultPage(
    'Fusion à faire à la main',
    `<p>Cette proposition touche des fichiers sensibles : elle ne se fusionne pas depuis un mail.</p><div class="quote files">${sensitive.map(esc).join('<br>')}</div><p>${diff}</p><p class="note">Après relecture, la fusionner soi-même, ou utiliser « Invalider » pour demander une correction qui n’y touche pas.</p>`,
    'warn'
  )
}

async function showReview(config: RelayConfig, link: LinkPayload, token: string): Promise<Response> {
  const [proposal, issue, base] = await Promise.all([currentProposal(config, link), getIssue(config, link.i), defaultBranch(config)])
  if (proposal instanceof Response) return proposal
  if (link.a === 'invalider') {
    return formPage({
      title: `Invalider la correction de l’issue #${issue.number}`,
      intro: `<p><strong>${esc(issue.title)}</strong></p><p class="note">Tes recommandations sont transmises à une nouvelle session, qui reprend la correction là où elle en est. Tu recevras un nouveau mail à valider.</p>`,
      token,
      submit: 'Renvoyer en correction',
      field: { label: 'Tes recommandations', placeholder: 'Ce qui ne va pas, ce que tu veux à la place…', required: true }
    })
  }
  const blocked = await mergeBlocker(config, base, link.b!, proposal.head)
  if (blocked) return blocked
  const diff = linkTo(compareUrl(config, base, link.b!), 'Voir les changements')
  return formPage({
    title: `Valider la correction de l’issue #${issue.number}`,
    intro: `<p><strong>${esc(proposal.title)}</strong></p>${quoteBlock(truncate(unwrap(proposal.summary), 3000) || '(sans résumé)')}<p class="note">La correction est posée sur la branche principale en un seul commit, et l’issue est fermée. ${diff}</p><p class="note">Le résumé est écrit par la session : seuls les changements font foi.</p>${issueIntro(issue)}`,
    token,
    submit: 'Valider et fusionner'
  })
}

async function runApprove(config: RelayConfig, link: LinkPayload): Promise<Response> {
  const [proposal, base] = await Promise.all([currentProposal(config, link), defaultBranch(config)])
  if (proposal instanceof Response) return proposal
  const blocked = await mergeBlocker(config, base, link.b!, proposal.head)
  if (blocked) return blocked
  const message = [proposal.title, proposal.summary, `Fixes #${link.i}`].filter(Boolean).join('\n\n')
  const sha = await mergeProposal(config, { base, headSha: proposal.head, message })
  // La correction est sur la branche principale : le rangement qui suit ne doit pas faire échouer la page.
  await Promise.all([
    deleteBranch(config, link.b!).catch(() => {}),
    deleteBranch(config, evaluationBranch(link.i)).catch(() => {}),
    closeIssue(config, link.i)
      .then((issue) => setFixLabel(config, issue, null))
      .catch(() => {})
  ])
  return resultPage(
    'Correction fusionnée',
    `<p>La correction de l’issue #${link.i} est sur la branche principale. ${linkTo(`${repoUrl(config)}/commit/${sha}`, 'Voir le commit')}</p><p class="note">Elle arrivera chez les joueurs avec la prochaine version de l’application.</p>`
  )
}

async function runReject(config: RelayConfig, link: LinkPayload, text: string): Promise<Response> {
  if (!text) throw new RelayError('Écris tes recommandations avant de renvoyer la correction.', 400)
  const [proposal, issue] = await Promise.all([currentProposal(config, link), getIssue(config, link.i)])
  if (proposal instanceof Response) return proposal
  const signalement = await describeIssue(config, issue)
  const session = await fireRoutine(config, { action: 'reviser', issue: link.i, branche: link.b!, recommandations: text, signalement })
  await setFixLabel(config, issue, LABEL_RUNNING).catch(() => {})
  return resultPage('Correction renvoyée', sessionHtml(session.sessionUrl))
}

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return errorPage('Méthode non prise en charge.', 405)
    const form = req.method === 'POST' ? new URLSearchParams(await req.text()) : new URL(req.url).searchParams
    const token = form.get('t') ?? ''
    const config = loadConfig(req, ['repo', 'githubToken', 'linkSecret'])
    const link = verifyLink(token, config.linkSecret)
    if (!link) return errorPage('Ce lien n’est pas valable ou a expiré : utilise les boutons du dernier mail reçu.', 403)
    if (link.a === 'etat') return errorPage('Ce lien ouvre la page d’état du relais, pas une action.', 400)
    if ((link.a === 'valider' && (!link.b || !link.h)) || (link.a === 'invalider' && !link.b)) return errorPage('Lien incomplet.', 400)

    const fixing = link.a === 'corriger' || link.a === 'contexte'
    if (link.a === 'evaluer') return req.method === 'GET' ? await showEvaluate(config, link, token) : await runEvaluate(config, link)
    if (req.method === 'GET') return fixing ? await showFix(config, link, token) : await showReview(config, link, token)

    const text = (form.get('text') ?? '').trim().slice(0, 6000)
    if (link.a === 'valider') return await runApprove(config, link)
    // Les deux autres actions lancent une session : la routine doit être configurée.
    const withRoutine = loadConfig(req, ['repo', 'githubToken', 'linkSecret', 'routineUrl', 'routineToken'])
    return fixing ? await runFix(withRoutine, link, text, form.get('force') === '1', token) : await runReject(withRoutine, link, text)
  } catch (err) {
    if (err instanceof RelayError) return errorPage(err.message, err.status)
    return errorPage('Erreur inattendue du relais. Réessaie dans un instant.', 500)
  }
}

export const config = { path: '/action' }
