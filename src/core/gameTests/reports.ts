// Où vivent les serveurs et les clients de test (cache local) et le dernier rapport de chaque test, par profil, pour
// que l'interface et Claude retrouvent le résultat. Chaque rapport porte l'empreinte des mods testés : on retrouve
// ainsi les tests d'une version (mêmes mods), même faits sur une copie d'essai disparue depuis.
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PlayerTestReport, ProfileTestReports, ServerTestReport, StaticCheckReport } from '../../shared/studio'
import { readJson, writeJsonAtomic } from '../fsutil'
import { migrateLocalDataDir } from '../previousIdentity'

// %LOCALAPPDATA%\Modding Manager, repris au besoin du dossier de l'ancien nom (previousIdentity.ts).
const localData = () => migrateLocalDataDir(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'))

/** Serveurs de test : volumineux et reconstruits à la demande, donc dans les données locales (pas itinérantes). */
export const testServersDir = () => join(localData(), 'test-servers')

/** Dossiers de jeu des joueurs du test, vidés à chaque test. */
export const testClientsDir = () => join(localData(), 'test-clients')

const reportsDir = () => join(localData(), 'test-reports')

export type ReportKind = keyof ProfileTestReports

const reportFile = (profilePath: string, kind: ReportKind) =>
  join(reportsDir(), `${createHash('sha1').update(profilePath.toLowerCase()).digest('hex').slice(0, 16)}-${kind}.json`)

export function saveReport(profilePath: string, kind: ReportKind, report: unknown): Promise<void> {
  return writeJsonAtomic(reportFile(profilePath, kind), report).catch(() => {})
}

export function lastReport<T>(profilePath: string, kind: ReportKind): Promise<T | null> {
  return readJson<T>(reportFile(profilePath, kind))
}

const dateOf = (report: StaticCheckReport | ServerTestReport | PlayerTestReport) => ('checkedAt' in report ? report.checkedAt : report.startedAt)

/** Les tests les plus récents faits sur chaque ensemble de mods (tous profils confondus), un par sorte. */
export async function reportsBySignature(): Promise<Map<string, ProfileTestReports>> {
  const bySignature = new Map<string, ProfileTestReports>()
  const files = await readdir(reportsDir()).catch(() => [] as string[])
  for (const file of files) {
    const kind = /-(files|server|players)\.json$/.exec(file)?.[1] as ReportKind | undefined
    if (!kind) continue
    const report = await readJson<StaticCheckReport & ServerTestReport & PlayerTestReport>(join(reportsDir(), file))
    if (!report?.modsSignature) continue
    const found = bySignature.get(report.modsSignature) ?? { files: null, server: null, players: null }
    const current = found[kind]
    if (!current || dateOf(report) > dateOf(current)) (found as Record<ReportKind, unknown>)[kind] = report
    bySignature.set(report.modsSignature, found)
  }
  return bySignature
}

/** Les tests les plus récents faits sur ces mods, un par sorte. */
export async function reportsForSignature(signature: string): Promise<ProfileTestReports> {
  return (await reportsBySignature()).get(signature) ?? { files: null, server: null, players: null }
}
