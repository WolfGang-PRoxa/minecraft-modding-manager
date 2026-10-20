import { RelayError, type RelayConfig } from './config.mts'
import type { ChangedFile, Issue } from './github.mts'
import type { RiskAssessment, RiskLevel } from './risk.mts'
import { esc, paragraphs, truncate, unwrap } from './text.mts'

export interface Mail {
  subject: string
  html: string
  text: string
}

/** Envoie un mail au propriétaire du dépôt (API Resend) et renvoie son identifiant chez Resend. */
export async function sendMail(config: RelayConfig, mail: Mail): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(`${config.resendApi}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to: [config.ownerEmail], ...mail }),
      signal: AbortSignal.timeout(8000)
    })
  } catch {
    throw new RelayError('Le service d’envoi de mails ne répond pas.', 502)
  }
  if (!res.ok) throw new RelayError(`Envoi du mail refusé (${res.status}) : ${truncate(await res.text(), 300)}`, 502)
  // Resend accepte le mail puis le remet de son côté : l'identifiant permet d'en suivre le sort (page d'état).
  return ((await res.json().catch(() => null)) as { id?: string } | null)?.id ?? null
}

export interface SentMail {
  created_at: string
  subject: string
  /** Dernier événement connu de Resend : `delivered`, `bounced`, `delivery_delayed`… */
  last_event: string
}

/** Derniers mails envoyés et ce qu'ils sont devenus. Une clé limitée à l'envoi ne peut pas les lire. */
export async function recentMails(config: RelayConfig, limit = 8): Promise<SentMail[]> {
  let res: Response
  try {
    res = await fetch(`${config.resendApi}/emails?limit=${limit}`, {
      headers: { Authorization: `Bearer ${config.resendKey}` },
      signal: AbortSignal.timeout(8000)
    })
  } catch {
    throw new RelayError('Le service d’envoi de mails ne répond pas.', 502)
  }
  if (res.status === 401 || res.status === 403) {
    const detail = ((await res.json().catch(() => null)) as { name?: string; message?: string } | null) ?? {}
    if (detail.name === 'restricted_api_key') {
      throw new RelayError('La clé Resend ne permet que l’envoi : le sort des mails se lit sur resend.com/emails.', 403)
    }
    throw new RelayError(`Resend refuse la clé (RESEND_API_KEY)${detail.message ? ` : ${truncate(detail.message, 200)}` : ''}.`, 403)
  }
  if (!res.ok) throw new RelayError(`Resend a répondu ${res.status}.`, 502)
  return ((await res.json()) as { data?: SentMail[] }).data ?? []
}

interface MailButton {
  label: string
  url: string
  primary?: boolean
}

const button = ({ label, url, primary }: MailButton) =>
  `<a href="${esc(url)}" style="display:inline-block;margin:0 8px 10px 0;padding:13px 22px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;${
    primary ? 'background:#2f9e44;color:#ffffff;border:1px solid #2f9e44;' : 'background:#ffffff;color:#1b2330;border:1px solid #c9d1dc;'
  }">${esc(label)}</a>`

/** Gabarit commun : un encadré lisible sur téléphone, sans image ni style externe. */
function layout(parts: { heading: string; intro: string; body: string; buttons: MailButton[]; footer: string }): string {
  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px 12px;background:#f3f5f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b2330;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dfe4ea;border-radius:16px;">
    <tr><td style="padding:28px 28px 0;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2f9e44;">Modpack Manager</div>
      <h1 style="margin:8px 0 0;font-size:21px;line-height:1.3;color:#1b2330;">${parts.heading}</h1>
      <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#5b6675;">${parts.intro}</p>
    </td></tr>
    <tr><td style="padding:20px 28px 0;">${parts.body}</td></tr>
    <tr><td style="padding:24px 28px 8px;">${parts.buttons.map(button).join('')}</td></tr>
    <tr><td style="padding:8px 28px 28px;font-size:13px;line-height:1.5;color:#5b6675;">${parts.footer}</td></tr>
  </table>
</body>
</html>`
}


const quote = (html: string) =>
  `<div style="padding:16px 18px;background:#f6f8fa;border:1px solid #e3e8ee;border-radius:12px;font-size:14px;line-height:1.55;color:#1b2330;word-break:break-word;">${html}</div>`

const link = (url: string, label: string) => `<a href="${esc(url)}" style="color:#2f9e44;font-weight:600;">${esc(label)}</a>`

const sectionTitle = (title: string) => `<p style="margin:20px 0 8px;font-size:13px;font-weight:700;color:#1b2330;">${esc(title)}</p>`

/** Encadré coloré : une bordure à gauche, le texte en noir pour rester lisible dans toutes les messageries. */
const panel = (color: string, background: string, html: string) =>
  `<div style="margin:20px 0 0;padding:14px 16px;background:${background};border:1px solid ${color};border-left:5px solid ${color};border-radius:12px;font-size:14px;line-height:1.55;color:#1b2330;word-break:break-word;">${html}</div>`

const RISK_LABELS: Record<RiskLevel, string> = { faible: 'faible', moyen: 'moyen', eleve: 'élevé' }
const RISK_COLORS: Record<RiskLevel, [string, string]> = {
  faible: ['#2f9e44', '#f1f9f2'],
  moyen: ['#d08700', '#fff8e6'],
  eleve: ['#c92a2a', '#fff0f0']
}
const RISK_NOTE = 'Évaluation indicative : le texte évalué peut chercher à la tromper. Les changements restent à relire.'

function riskHtml(risk: RiskAssessment): string {
  if (risk.status === 'unavailable') {
    return panel('#8b95a3', '#f6f8fa', `<strong>Évaluation du risque indisponible</strong> : ${esc(risk.reason)}`)
  }
  const [color, background] = RISK_COLORS[risk.level]
  const points = risk.points.length
    ? `<ul style="margin:8px 0 0;padding-left:20px;">${risk.points.map((point) => `<li>${esc(point)}</li>`).join('')}</ul>`
    : ''
  return panel(
    color,
    background,
    `<strong style="color:${color};">Risque ${RISK_LABELS[risk.level]}</strong> (évaluation par Claude)<br>${esc(risk.summary)}${points}<p style="margin:8px 0 0;font-size:12.5px;color:#5b6675;">${RISK_NOTE}</p>`
  )
}

function riskText(risk: RiskAssessment): string[] {
  if (risk.status === 'unavailable') return [`Évaluation du risque indisponible : ${risk.reason}`]
  return [`Risque ${RISK_LABELS[risk.level]} (évaluation par Claude) : ${risk.summary}`, ...risk.points.map((point) => `- ${point}`), RISK_NOTE]
}

const issueText = (issue: Issue) => truncate(issue.body ?? '', 3000) || '(sans description)'

/** Le message d'origine de l'issue, tel que son auteur l'a écrit. */
const issueHtml = (issue: Issue) =>
  `${sectionTitle(`Message d’origine de l’issue, par ${issue.user?.login ?? 'quelqu’un'}`)}${quote(paragraphs(issueText(issue)))}`

const issueLines = (issue: Issue) => [`Message d'origine de l'issue, par ${issue.user?.login ?? 'quelqu’un'} :`, issueText(issue)]

/** Mail envoyé à chaque nouvelle issue : corriger tout de suite, ou d'abord préciser. */
export function issueMail(issue: Issue, links: { fix: string; context: string; evaluate?: string }, risk: RiskAssessment): Mail {
  const author = issue.user?.login ?? 'quelqu’un'
  return {
    subject: `[Modpack Manager] Nouvelle issue #${issue.number} : ${truncate(issue.title, 120)}`,
    html: layout({
      heading: `Issue #${issue.number} : ${esc(issue.title)}`,
      intro: `Signalée par ${esc(author)}.`,
      body: `${quote(paragraphs(issueText(issue)))}${riskHtml(risk)}`,
      buttons: [
        { label: 'Corriger maintenant', url: links.fix, primary: true },
        { label: 'Ajouter du contexte', url: links.context },
        ...(links.evaluate ? [{ label: 'Faire évaluer le risque', url: links.evaluate }] : [])
      ],
      footer: `Chaque bouton ouvre une page de confirmation : rien ne démarre sans toi. ${link(issue.html_url, 'Voir l’issue sur GitHub')}`
    }),
    text: [
      `Issue #${issue.number} : ${issue.title}`,
      `Signalée par ${author}.`,
      '',
      issueText(issue),
      '',
      ...riskText(risk),
      '',
      `Corriger maintenant : ${links.fix}`,
      `Ajouter du contexte : ${links.context}`,
      ...(links.evaluate ? [`Faire évaluer le risque : ${links.evaluate}`] : []),
      `Voir l'issue : ${issue.html_url}`
    ].join('\n')
  }
}

const STATUS: Record<string, string> = { added: 'ajouté', removed: 'supprimé', modified: 'modifié', renamed: 'renommé' }

function fileLines(files: ChangedFile[]): string[] {
  const shown = files.slice(0, 40).map((f) => `${f.filename} (${STATUS[f.status] ?? f.status}, +${f.additions} −${f.deletions})`)
  return files.length > shown.length ? [...shown, `… et ${files.length - shown.length} autres fichiers`] : shown
}

const SENSITIVE_INTRO =
  'Cette proposition touche des fichiers de la publication, du build, des dépendances, du relais ou des consignes des sessions. La fusion depuis ce mail est désactivée : relire les changements sur GitHub, puis les fusionner soi-même.'

function sensitiveHtml(paths: string[]): string {
  const list = `<div style="margin:8px 0 0;font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.7;word-break:break-all;">${paths.map(esc).join('<br>')}</div>`
  return panel('#c92a2a', '#fff0f0', `<strong style="color:#c92a2a;">Fichiers sensibles touchés</strong><br>${esc(SENSITIVE_INTRO)}${list}`)
}

/** Mail envoyé quand une session a poussé sa correction : valider (fusion sur main) ou invalider. */
export function proposalMail(
  issue: Issue,
  proposal: { title: string; summary: string; files: ChangedFile[]; diffUrl: string },
  links: { approve: string; reject: string },
  review: { risk: RiskAssessment; sensitive: string[] }
): Mail {
  const files = fileLines(proposal.files)
  const summary = unwrap(proposal.summary) || '(la session n’a pas laissé de résumé)'
  const blocked = review.sensitive.length > 0
  const filesHtml = `${sectionTitle(`Fichiers modifiés (${proposal.files.length})`)}
<div style="font-family:Consolas,'Courier New',monospace;font-size:12.5px;line-height:1.7;color:#3d4756;word-break:break-all;">${files.map(esc).join('<br>')}</div>`
  const buttons: MailButton[] = blocked
    ? [
        { label: 'Relire les changements sur GitHub', url: proposal.diffUrl, primary: true },
        { label: 'Invalider et donner mes recommandations', url: links.reject }
      ]
    : [
        { label: 'Valider et fusionner sur main', url: links.approve, primary: true },
        { label: 'Invalider et donner mes recommandations', url: links.reject }
      ]
  return {
    subject: `[Modpack Manager] ${blocked ? 'À relire : correction' : 'Correction'} proposée pour l’issue #${issue.number} : ${truncate(issue.title, 100)}`,
    html: layout({
      heading: `Correction proposée — issue #${issue.number}`,
      intro: `${esc(issue.title)}`,
      body: `${blocked ? sensitiveHtml(review.sensitive) : ''}${sectionTitle('Résumé de la session')}<p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1b2330;">${esc(proposal.title)}</p>${quote(paragraphs(summary))}${filesHtml}${issueHtml(issue)}${riskHtml(review.risk)}`,
      buttons,
      footer: blocked
        ? `Le résumé est écrit par la session elle-même : seuls les changements font foi. ${link(issue.html_url, 'Voir l’issue sur GitHub')}`
        : `Valider fusionne exactement ce qui est résumé ici. Le résumé est écrit par la session elle-même : seuls les changements font foi. ${link(proposal.diffUrl, 'Voir les changements sur GitHub')}`
    }),
    text: [
      `Correction proposée pour l'issue #${issue.number} : ${issue.title}`,
      ...(blocked ? ['', `FICHIERS SENSIBLES TOUCHÉS. ${SENSITIVE_INTRO}`, ...review.sensitive.map((path) => `- ${path}`)] : []),
      '',
      'Résumé de la session :',
      proposal.title,
      '',
      summary,
      '',
      `Fichiers modifiés (${proposal.files.length}) :`,
      ...files.map((f) => `- ${f}`),
      '',
      ...issueLines(issue),
      '',
      ...riskText(review.risk),
      '',
      ...(blocked ? [] : [`Valider et fusionner sur main : ${links.approve}`]),
      `Invalider et donner mes recommandations : ${links.reject}`,
      `Voir les changements : ${proposal.diffUrl}`
    ].join('\n')
  }
}

/** La session n'a rien modifié : elle explique pourquoi, et le propriétaire peut préciser sa demande. */
export function emptyProposalMail(issue: Issue, proposal: { title: string; summary: string }, links: { reject: string }, risk: RiskAssessment): Mail {
  const summary = unwrap(proposal.summary) || proposal.title || '(la session n’a pas laissé d’explication)'
  return {
    subject: `[Modpack Manager] Pas de correction pour l’issue #${issue.number} : ${truncate(issue.title, 100)}`,
    html: layout({
      heading: `Pas de correction — issue #${issue.number}`,
      intro: `${esc(issue.title)}. La session n’a modifié aucun fichier ; voici son explication.`,
      body: `${quote(paragraphs(summary))}${issueHtml(issue)}${riskHtml(risk)}`,
      buttons: [{ label: 'Donner des précisions et relancer', url: links.reject, primary: true }],
      footer: link(issue.html_url, 'Voir l’issue sur GitHub')
    }),
    text: [
      `Pas de correction pour l'issue #${issue.number} : ${issue.title}`,
      '',
      summary,
      '',
      ...issueLines(issue),
      '',
      ...riskText(risk),
      '',
      `Donner des précisions et relancer : ${links.reject}`,
      `Voir l'issue : ${issue.html_url}`
    ].join('\n')
  }
}
