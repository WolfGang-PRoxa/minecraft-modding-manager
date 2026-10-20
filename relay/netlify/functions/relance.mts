import { loadConfig } from '../../src/config.mts'
import { listLabeledIssues, takeLabel, toggleLabel } from '../../src/github.mts'
import { sendIssueMail } from '../../src/notify.mts'
import { LABEL_EVALUATING, LABEL_EVALUATION_LATE } from '../../src/risk.mts'

// Tâche planifiée : une issue dont l'évaluation est attendue depuis trop longtemps (session en échec, routine en
// pause, quota atteint…) donne quand même son mail au propriétaire, sans évaluation. Sans elle, il ne saurait rien de
// l'issue. Si l'évaluation arrive plus tard, son mail part aussi.

const WAIT_MS = 20 * 60 * 1000

export default async (req: Request): Promise<Response> => {
  const config = loadConfig(req, ['repo', 'githubToken', 'linkSecret', 'resendKey', 'ownerEmail'])
  const late = (await listLabeledIssues(config, LABEL_EVALUATING)).filter((issue) => Date.now() - Date.parse(issue.updated_at) > WAIT_MS)
  for (const issue of late) {
    // L'évaluation a pu arriver entre-temps : seul celui qui retire l'étiquette envoie le mail.
    if (!(await takeLabel(config, issue.number, LABEL_EVALUATING))) continue
    // Une évaluation qui arriverait encore donnera son propre mail.
    await toggleLabel(config, { ...issue, labels: [] }, LABEL_EVALUATION_LATE, true).catch(() => {})
    await sendIssueMail(config, issue, {
      status: 'unavailable',
      reason: 'la session d’évaluation n’a rien rendu en 20 minutes. Si elle aboutit plus tard, un second mail suivra.'
    })
  }
  return new Response(JSON.stringify({ relances: late.map((issue) => issue.number) }), { headers: { 'Content-Type': 'application/json' } })
}

export const config = { schedule: '*/10 * * * *' }
