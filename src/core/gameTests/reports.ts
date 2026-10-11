// Où vivent les serveurs de test (cache local, téléchargé une fois par chargeur) et le dernier rapport de chaque
// test, par profil, pour que l'interface et Claude retrouvent le résultat.
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { APP_NAME } from '../../shared/config'
import { readJson, writeJsonAtomic } from '../fsutil'

const localData = () => join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), APP_NAME)

/** Serveurs de test : volumineux et reconstruits à la demande, donc dans les données locales (pas itinérantes). */
export const testServersDir = () => join(localData(), 'test-servers')

const reportFile = (profilePath: string, kind: 'files' | 'server') =>
  join(localData(), 'test-reports', `${createHash('sha1').update(profilePath.toLowerCase()).digest('hex').slice(0, 16)}-${kind}.json`)

export function saveReport(profilePath: string, kind: 'files' | 'server', report: unknown): Promise<void> {
  return writeJsonAtomic(reportFile(profilePath, kind), report).catch(() => {})
}

export function lastReport<T>(profilePath: string, kind: 'files' | 'server'): Promise<T | null> {
  return readJson<T>(reportFile(profilePath, kind))
}
