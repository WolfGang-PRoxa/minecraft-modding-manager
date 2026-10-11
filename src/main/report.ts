import { app, shell } from 'electron'
import { release } from 'node:os'
import { APP_REPO } from '../shared/config'
import { repoSlug, repoUrl } from '../shared/repo'
import { REPORT_KINDS, reportBody, reportProblem } from '../shared/report'
import type { IssueReport, ReportInfo, ReportResult } from '../shared/types'
import { accountFor, resolveCredential } from '../core/auth'
import { getCurseForgeStatus } from '../core/curseforge'
import { getCatalog } from './github'
import { GITHUB_HEADERS, repoApiBase } from '../core/githubEnv'
import { listInstalled } from './installer'
import { getSettings } from '../core/settings'

// Signalement d'un problème depuis l'application : une issue sur le dépôt de l'application, créée avec le compte
// GitHub connecté. Sans compte, la page GitHub s'ouvre dans le navigateur, déjà remplie.

const ROLES = { publisher: 'publieur', receiver: 'récepteur' }
const INSTANCES_SOURCES = { settings: 'choisi à la main', curseforge: 'détecté', default: 'emplacement par défaut' }

/** Ce qui aide à comprendre un problème, sans rien de personnel : ni chemin, ni nom de compte. */
async function diagnostics(): Promise<string[]> {
  const settings = await getSettings()
  const curseForge = await getCurseForgeStatus(settings)
  const installed = await listInstalled(curseForge.instancesDir)
  const flavor = curseForge.flavor === 'overwolf' ? 'Overwolf' : 'application autonome'
  return [
    `Application : ${app.getVersion()}${app.isPackaged ? '' : ' (développement)'}`,
    `Windows : ${release()} (${process.arch})`,
    `Rôle : ${settings.role ? ROLES[settings.role] : 'pas encore choisi'}`,
    `Dépôt des modpacks : ${repoSlug(settings.repo)}`,
    `CurseForge : ${curseForge.installed ? `détecté (${flavor})` : 'introuvable'}`,
    `Dossier Instances : ${curseForge.instancesDirExists ? 'présent' : 'absent'} (${INSTANCES_SOURCES[curseForge.instancesDirSource]})`,
    `Modpacks installés par l’application : ${installed.map((i) => `${i.id} v${i.version}`).join(', ') || 'aucun'}`
  ]
}

async function modpackLabel(id: string | null): Promise<string | null> {
  if (!id) return null
  const modpack = (await getCatalog()).modpacks.find((m) => m.id === id)
  return modpack ? `${modpack.latest.name} (dernière version : v${modpack.latest.version})` : id
}

const issueBody = async (report: IssueReport) => reportBody(report, await modpackLabel(report.modpackId), await diagnostics())

export async function reportInfo(): Promise<ReportInfo> {
  const credential = await resolveCredential()
  // Un jeton refusé par GitHub ne permettra pas de créer l'issue : on fait comme s'il n'y avait pas de compte.
  const account = credential ? await accountFor(credential).catch(() => null) : null
  return { account, diagnostics: await diagnostics() }
}

const ERRORS: Record<number, string> = {
  401: 'GitHub refuse la connexion enregistrée (jeton expiré ou révoqué) : reconnecte-toi dans les paramètres.',
  403: 'Le compte connecté n’a pas le droit de créer une issue sur ce dépôt (jeton limité à un autre dépôt ?).',
  404: 'Le compte connecté n’a pas le droit de créer une issue sur ce dépôt (jeton limité à un autre dépôt ?).',
  410: 'Les issues sont désactivées sur ce dépôt.',
  422: 'GitHub a refusé le contenu du signalement.'
}

export async function submitReport(report: IssueReport): Promise<ReportResult> {
  const problem = reportProblem(report)
  if (problem) return { ok: false, error: problem }
  const credential = await resolveCredential()
  if (!credential) return { ok: false, error: 'Aucun compte GitHub n’est connecté dans l’application.' }

  let res: Response
  try {
    res = await fetch(`${repoApiBase(APP_REPO)}/issues`, {
      method: 'POST',
      headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: report.title.trim(),
        body: await issueBody(report),
        // Ignorée par GitHub si le compte n'a pas le droit d'étiqueter : le type est aussi dans le texte.
        labels: [REPORT_KINDS[report.kind].issueLabel]
      }),
      signal: AbortSignal.timeout(20_000)
    })
  } catch {
    return { ok: false, error: 'Impossible de joindre GitHub. Vérifie ta connexion internet.' }
  }
  if (res.status !== 201) return { ok: false, error: ERRORS[res.status] ?? `GitHub a répondu ${res.status}.` }
  const issue = (await res.json()) as { number: number; html_url: string }
  return { ok: true, number: issue.number, url: issue.html_url }
}

// Une adresse trop longue est refusée par GitHub : on garde de la marge pour le titre et l'encodage.
const BROWSER_BODY_MAX = 4000

/** Ouvre la page « nouvelle issue » de GitHub, déjà remplie : il ne reste qu'à la valider. */
export async function openReportInBrowser(report: IssueReport): Promise<void> {
  const body = await issueBody(report)
  const query = new URLSearchParams({
    title: report.title.trim(),
    body: body.length > BROWSER_BODY_MAX ? `${body.slice(0, BROWSER_BODY_MAX)}…` : body,
    labels: REPORT_KINDS[report.kind].issueLabel
  })
  await shell.openExternal(`${repoUrl(APP_REPO)}/issues/new?${query}`)
}
