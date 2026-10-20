import type { RelayConfig } from './config.mts'
import type { Issue } from './github.mts'
import { issueMail, sendMail } from './mail.mts'
import type { RiskAssessment } from './risk.mts'
import { signLink } from './sign.mts'

const actionLink = (config: RelayConfig, a: 'corriger' | 'contexte' | 'evaluer', issue: number) =>
  `${config.baseUrl}/action?t=${signLink({ a, i: issue }, config.linkSecret)}`

/** Mail « nouvelle issue » ; sans évaluation, il propose de la faire faire (si la routine est configurée). */
export async function sendIssueMail(config: RelayConfig, issue: Issue, risk: RiskAssessment): Promise<string | null> {
  const canEvaluate = risk.status !== 'ok' && Boolean(config.evalRoutineUrl && config.evalRoutineToken)
  const links = {
    fix: actionLink(config, 'corriger', issue.number),
    context: actionLink(config, 'contexte', issue.number),
    evaluate: canEvaluate ? actionLink(config, 'evaluer', issue.number) : undefined
  }
  return sendMail(config, issueMail(issue, links, risk))
}
