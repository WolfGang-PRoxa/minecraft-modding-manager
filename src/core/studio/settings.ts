import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJson } from '../fsutil'
import { getSettings, updateSettings } from '../settings'

export const defaultWorkspaceDir = (): string => join(homedir(), 'Modpacks')

/** Ancien réglage, du temps où le studio avait sa propre fenêtre : repris tant qu'aucun dossier n'est choisi. */
const legacyFile = () =>
  join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Modpack Studio', 'studio-settings.json')

/** Dossier qui contient un sous-dossier par modpack (réglage commun à l'application et aux scripts). */
export async function loadWorkspaceDir(): Promise<string | null> {
  const { workspaceDir } = await getSettings()
  if (workspaceDir) return workspaceDir
  const legacy = await readJson<{ workspaceDir?: unknown }>(legacyFile())
  return typeof legacy?.workspaceDir === 'string' && legacy.workspaceDir ? legacy.workspaceDir : null
}

export async function saveWorkspaceDir(dir: string): Promise<void> {
  await updateSettings({ workspaceDir: dir })
}
