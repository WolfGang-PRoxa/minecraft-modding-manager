import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_APPEARANCE, normalizeAppearance } from '../shared/appearance'
import { APP_REPO } from '../shared/config'
import { isRepoRef } from '../shared/repo'
import type { Settings } from '../shared/types'
import { readJson, writeJsonAtomic } from './fsutil'
import { currentRepoName, migrateDataDir } from './previousIdentity'

const DEFAULTS: Settings = {
  instancesDir: null,
  openCurseForgeAfterInstall: true,
  shortcutPrompted: false,
  role: null,
  repo: APP_REPO,
  workspaceDir: null,
  lastView: 'library',
  lastRunVersion: null,
  maintenanceClaude: false,
  appearance: DEFAULT_APPEARANCE
}

// Réglages de l'application (rôle, dépôt, dossier des contenus…), lus aussi par les scripts `modpacks:*` :
// le fichier n'est pas gardé en mémoire, pour voir tout de suite un changement fait par un script.
// Pour les commandes, le dossier des données de l'application, repris de l'ancien nom au besoin (previousIdentity.ts).
let file: string | null = null
const settingsFile = () => (file ??= join(migrateDataDir(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')), 'settings.json'))

/** L'application des joueurs utilise son dossier userData (qui peut être déplacé par --user-data-dir). */
export function useSettingsFile(path: string): void {
  file = path
}

/** Dossier des réglages, où se trouve aussi la connexion GitHub enregistrée. */
export function settingsDir(): string {
  return dirname(settingsFile())
}

export async function getSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(settingsFile())
  return {
    ...DEFAULTS,
    ...stored,
    role: stored?.role === 'receiver' || stored?.role === 'publisher' ? stored.role : null,
    repo: isRepoRef(stored?.repo) ? { owner: stored.repo.owner, name: currentRepoName(stored.repo.owner, stored.repo.name, APP_REPO) } : APP_REPO,
    workspaceDir: typeof stored?.workspaceDir === 'string' && stored.workspaceDir ? stored.workspaceDir : null,
    lastView: stored?.lastView === 'studio' ? 'studio' : 'library',
    lastRunVersion: typeof stored?.lastRunVersion === 'string' && stored.lastRunVersion ? stored.lastRunVersion : null,
    maintenanceClaude: stored?.maintenanceClaude === true,
    appearance: normalizeAppearance(stored?.appearance)
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next: Settings = { ...(await getSettings()), ...patch }
  await writeJsonAtomic(settingsFile(), next)
  return next
}
