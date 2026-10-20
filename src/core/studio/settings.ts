import { homedir } from 'node:os'
import { join } from 'node:path'
import { getSettings, updateSettings } from '../settings'

export const defaultWorkspaceDir = (): string => join(homedir(), 'Modpacks')

/** Dossier qui contient un sous-dossier par modpack (réglage commun à l'application et aux scripts). */
export async function loadWorkspaceDir(): Promise<string | null> {
  return (await getSettings()).workspaceDir
}

export async function saveWorkspaceDir(dir: string): Promise<void> {
  await updateSettings({ workspaceDir: dir })
}
