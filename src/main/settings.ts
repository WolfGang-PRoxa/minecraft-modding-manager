import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { APP_REPO, LEGACY_APP_NAME } from '../shared/config'
import { isRepoRef } from '../shared/repo'
import type { Settings } from '../shared/types'
import { readJson, writeJsonAtomic } from './fsutil'

const DEFAULTS: Settings = {
  instancesDir: null,
  openCurseForgeAfterInstall: true,
  shortcutPrompted: false,
  role: null,
  repo: APP_REPO,
  workspaceDir: null,
  lastView: 'library',
  lastRunVersion: null
}

// Réglages de l'application (rôle, dépôt, dossier des modpacks…), lus aussi par les scripts `modpacks:*` :
// le fichier n'est pas gardé en mémoire, pour voir tout de suite un changement fait par un script.
let file = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), LEGACY_APP_NAME, 'settings.json')

/** L'application des joueurs utilise son dossier userData (qui peut être déplacé par --user-data-dir). */
export function useSettingsFile(path: string): void {
  file = path
}

/** Dossier des réglages, où se trouve aussi la connexion GitHub enregistrée. */
export function settingsDir(): string {
  return dirname(file)
}

export async function getSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(file)
  return {
    ...DEFAULTS,
    ...stored,
    role: stored?.role === 'receiver' || stored?.role === 'publisher' ? stored.role : null,
    repo: isRepoRef(stored?.repo) ? { owner: stored.repo.owner, name: stored.repo.name } : APP_REPO,
    workspaceDir: typeof stored?.workspaceDir === 'string' && stored.workspaceDir ? stored.workspaceDir : null,
    lastView: stored?.lastView === 'studio' ? 'studio' : 'library',
    lastRunVersion: typeof stored?.lastRunVersion === 'string' && stored.lastRunVersion ? stored.lastRunVersion : null
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next: Settings = { ...(await getSettings()), ...patch }
  await writeJsonAtomic(file, next)
  return next
}
