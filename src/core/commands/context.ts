import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RepoRef } from '../../shared/types'
import { resolveCredential } from '../auth'
import { resolveInstancesDir } from '../curseforge'
import { CurseForgeClient } from '../curseforgeApi'
import { CurseForgeUploader } from '../curseforgeUpload'
import { ModrinthClient } from '../modrinth'
import { HangarClient } from '../hangar'
import type { MaintenanceLauncher } from '../maintenance/scheduledTask'
import { maintenanceLock, operationTools } from '../operations'
import { moveToRecycleBin } from '../powershell'
import { getSettings } from '../settings'
import { StudioError } from '../studio/analyze'
import { StudioService } from '../studio/service'
import { defaultWorkspaceDir, loadWorkspaceDir, previousDefaultWorkspaceDir } from '../studio/settings'
import type { CommandContext } from './registry'

export interface ContextOptions {
  /** Qui agit, tel que le verrou et le journal l'afficheront (« la ligne de commande »…). */
  holder: string
  /** Dossier des contenus imposé (--dir, MODPACKS_DIR) ; sinon celui choisi dans l'application. */
  workspaceDir?: string
  /** Dépôt imposé (--repo) ; sinon celui choisi dans l'application. */
  repo?: RepoRef
  /** Dossier où chercher un .env (GITHUB_TOKEN), pour les commandes lancées depuis le dépôt. */
  dotenvDir?: string
  onAnalyzing?(fileName: string | null): void
  /** Ce que la tâche planifiée lance ; par défaut l'application installée, si c'est elle qui exécute ces commandes. */
  launcher?: MaintenanceLauncher | null
}

/** mpm de l'application installée : son exécutable, lancé en mode Node sur le cli.js de son app.asar. */
function installedLauncher(): MaintenanceLauncher | null {
  return process.versions.electron && /app\.asar/i.test(process.argv[1] ?? '') ? { execute: process.execPath, arguments: '--maintenance' } : null
}

/** Dossier Instances de CurseForge : réglage de l'application, logs de CurseForge, sinon l'emplacement par défaut. */
async function instancesDir(): Promise<string> {
  const { dir } = await resolveInstancesDir(await getSettings())
  if (!existsSync(dir)) throw new StudioError(`Dossier Instances de CurseForge introuvable : ${dir}`)
  return dir
}

/** Dossier des contenus : imposé, sinon celui de l'application, sinon ~/Modding Manager (ou l'ancien ~/Modpacks) s'il existe. */
async function findWorkspaceDir(forced?: string): Promise<string | null> {
  if (forced) return resolve(forced)
  if (process.env.MODPACKS_DIR) return resolve(process.env.MODPACKS_DIR)
  const chosen = await loadWorkspaceDir()
  if (chosen) return chosen
  return [defaultWorkspaceDir(), previousDefaultWorkspaceDir()].find((dir) => existsSync(dir)) ?? null
}

/**
 * Service et contexte des commandes hors de la fenêtre (ligne de commande, serveur MCP). Le service y publie au nom
 * du publieur, sans passer par le choix du rôle : ces outils sont les siens.
 */
export async function createCommandRuntime(options: ContextOptions): Promise<{
  service: StudioService
  context(extra: Pick<CommandContext, 'progress' | 'signal'>): CommandContext
}> {
  const workspaceDir = await findWorkspaceDir(options.workspaceDir)
  const service = new StudioService({
    getWorkspaceDir: () => workspaceDir,
    defaultWorkspaceDir: defaultWorkspaceDir(),
    getAppSettings: async () => ({ role: 'publisher', repo: options.repo ?? (await getSettings()).repo }),
    getCredential: () => resolveCredential({ dotenvDir: options.dotenvDir }),
    onAnalyzing: options.onAnalyzing,
    trashItem: moveToRecycleBin,
    getInstancesDir: () => instancesDir(),
    getCurseForgeClient: () => CurseForgeClient.create({ dotenvDir: options.dotenvDir }),
    getCurseForgeUploader: () => CurseForgeUploader.create({ dotenvDir: options.dotenvDir }),
    getModrinthClient: () => ModrinthClient.create({ dotenvDir: options.dotenvDir }),
    getHangarClient: () => HangarClient.create({ dotenvDir: options.dotenvDir }),
    ...operationTools(options.holder)
  })
  const lock = maintenanceLock(options.holder)
  const launcher = options.launcher === undefined ? installedLauncher() : options.launcher
  return { service, context: (extra) => ({ service, instancesDir, maintenanceLock: lock, launcher, ...extra }) }
}
