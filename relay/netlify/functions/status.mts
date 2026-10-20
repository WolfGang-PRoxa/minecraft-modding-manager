import { configStatus, loadConfig, RelayError, type RelayConfig } from '../../src/config.mts'
import { defaultBranch } from '../../src/github.mts'
import { recentMails } from '../../src/mail.mts'
import { errorPage, resultPage } from '../../src/pages.mts'
import { verifyLink } from '../../src/sign.mts'
import { esc } from '../../src/text.mts'

// Page d'état du relais, pour le propriétaire seul (lien signé) : ce qui est configuré, ce que GitHub et le service
// de mails répondent, et ce que sont devenus les derniers mails. Elle ne montre aucun secret et ne déclenche rien.

const EVENTS: Record<string, string> = {
  queued: 'en attente',
  scheduled: 'programmé',
  sent: 'envoyé, pas encore remis',
  delivered: 'remis',
  delivery_delayed: 'retardé par la messagerie',
  bounced: 'refusé par la messagerie',
  complained: 'signalé comme indésirable',
  failed: 'échec de l’envoi',
  canceled: 'annulé',
  opened: 'ouvert',
  clicked: 'ouvert, lien suivi'
}

/** Resend date ses mails ainsi : « 2026-10-02 15:04:58.123456+00 ». */
function when(stamp: string): string {
  const date = new Date(stamp.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
  if (Number.isNaN(date.getTime())) return stamp
  return date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const line = (label: string, value: string, tone: 'ok' | 'warn' | 'error' = 'ok') =>
  `<p>${esc(label)} : <span class="${tone}">${esc(value)}</span></p>`

/** Résultat d'une vérification : la réponse du service, ou le message d'erreur à afficher. */
async function probe(label: string, run: () => Promise<string>): Promise<string> {
  try {
    return line(label, await run())
  } catch (err) {
    return line(label, err instanceof RelayError ? err.message : 'erreur inattendue', 'error')
  }
}

async function mails(config: RelayConfig): Promise<string> {
  if (!config.resendKey) return line('Mails', 'RESEND_API_KEY manque', 'error')
  try {
    const list = await recentMails(config)
    if (list.length === 0) return line('Mails', 'aucun mail envoyé pour l’instant', 'warn')
    const rows = list.map((mail) => {
      const delivered = ['delivered', 'opened', 'clicked'].includes(mail.last_event)
      const failed = ['bounced', 'complained', 'failed', 'canceled'].includes(mail.last_event)
      const tone = delivered ? 'ok' : failed ? 'error' : 'warn'
      return `<p class="note">${esc(when(mail.created_at))} · ${esc(mail.subject)}<br><span class="${tone}">${esc(EVENTS[mail.last_event] ?? mail.last_event)}</span></p>`
    })
    return `<p>Derniers mails :</p>${rows.join('')}`
  } catch (err) {
    return line('Mails', err instanceof RelayError ? err.message : 'erreur inattendue', 'warn')
  }
}

export default async (req: Request): Promise<Response> => {
  try {
    const config = loadConfig(req, ['linkSecret'])
    const link = verifyLink(new URL(req.url).searchParams.get('t') ?? '', config.linkSecret)
    if (!link || link.a !== 'etat') return errorPage('Ce lien n’est pas valable ou a expiré.', 403)

    const missing = configStatus().filter((variable) => !variable.set)
    const variables = missing.length
      ? line('Configuration', `${missing.map((variable) => variable.name).join(', ')} à renseigner dans Netlify`, 'error')
      : line('Configuration', 'toutes les variables sont renseignées')
    const [github, sent] = await Promise.all([
      config.githubToken && config.repo
        ? probe('GitHub', async () => `jeton accepté (${config.repo}, branche ${await defaultBranch(config)})`)
        : line('GitHub', 'GITHUB_REPO ou GITHUB_TOKEN manque', 'error'),
      mails(config)
    ])
    const routine = line(
      'Session de correction',
      config.routineUrl && config.routineToken ? 'configurée (vérifiée seulement au lancement d’une correction)' : 'ROUTINE_FIRE_URL ou ROUTINE_TOKEN manque',
      config.routineUrl && config.routineToken ? 'ok' : 'error'
    )
    const evaluation = config.evalRoutineUrl && config.evalRoutineToken
    const risk = line(
      'Évaluation du risque',
      evaluation
        ? `routine configurée, ${config.evalDailyMax} évaluations d’office par 24 h (vérifiée seulement au lancement)`
        : 'EVAL_ROUTINE_FIRE_URL ou EVAL_ROUTINE_TOKEN manque : les mails partent sans évaluation',
      evaluation ? 'ok' : 'warn'
    )
    return resultPage('État du relais', `${variables}${github}${routine}${risk}${sent}`)
  } catch (err) {
    if (err instanceof RelayError) return errorPage(err.message, err.status)
    return errorPage('Erreur inattendue du relais. Réessaie dans un instant.', 500)
  }
}

export const config = { path: '/etat' }
