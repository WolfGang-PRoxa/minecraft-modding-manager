import { APP_NAME } from './config'
import type { IssueReport, ReportKind } from './types'

export const REPORT_TITLE_MAX = 120
export const REPORT_DESCRIPTION_MAX = 5000

/** Les deux sortes de signalement, et l'étiquette GitHub correspondante. */
export const REPORT_KINDS: Record<ReportKind, { label: string; issueLabel: string }> = {
  bug: { label: 'Problème', issueLabel: 'bug' },
  suggestion: { label: 'Suggestion', issueLabel: 'enhancement' }
}

/** Ce qui empêche d'envoyer le signalement, sinon null. */
export function reportProblem(report: IssueReport): string | null {
  const title = report.title.trim()
  const description = report.description.trim()
  if (title.length < 5) return 'Donne un titre d’au moins 5 caractères.'
  if (title.length > REPORT_TITLE_MAX) return `Le titre dépasse ${REPORT_TITLE_MAX} caractères.`
  if (description.length < 10) return 'Décris ce qui se passe en quelques mots.'
  if (description.length > REPORT_DESCRIPTION_MAX) return `La description dépasse ${REPORT_DESCRIPTION_MAX} caractères.`
  return null
}

/** Corps de l'issue : du Markdown simple, qui reste lisible tel quel dans un mail. */
export function reportBody(report: IssueReport, modpack: string | null, diagnostics: string[]): string {
  const header = [`**Type** : ${REPORT_KINDS[report.kind].label}`, modpack && `**Modpack** : ${modpack}`].filter(Boolean).join(' · ')
  const parts = [header, report.description.trim()]
  if (report.includeDiagnostics && diagnostics.length > 0) {
    parts.push(['---', '**Informations techniques**', ...diagnostics.map((line) => `- ${line}`)].join('\n'))
  }
  parts.push(`_Envoyé depuis ${APP_NAME}._`)
  return parts.join('\n\n')
}
