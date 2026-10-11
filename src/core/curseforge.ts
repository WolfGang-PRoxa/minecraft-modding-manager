import { execFile, spawn } from 'node:child_process'
import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { CURSEFORGE_OVERWOLF_UID } from '../shared/config'
import type { CurseForgeFlavor, CurseForgeRestartResult, CurseForgeStatus, Settings } from '../shared/types'
import { pathExists } from './fsutil'

const execFileAsync = promisify(execFile)

interface Launcher {
  flavor: CurseForgeFlavor
  command: string
  args: string[]
}

const localAppData = () => process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
const roamingAppData = () => process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')

export const defaultInstancesDir = () => join(homedir(), 'curseforge', 'minecraft', 'Instances')

/** Découpe une ligne de commande Windows en respectant les guillemets. */
function splitCommandLine(commandLine: string): string[] {
  const tokens: string[] = []
  for (const match of commandLine.matchAll(/"([^"]*)"|(\S+)/g)) tokens.push(match[1] ?? match[2])
  return tokens
}

/** Commande associée au protocole curseforge:// (enregistrée par les deux versions de CurseForge). */
async function launcherFromProtocol(): Promise<Launcher | null> {
  try {
    const { stdout } = await execFileAsync('reg', ['query', 'HKCR\\curseforge\\shell\\open\\command', '/ve'], {
      windowsHide: true,
      timeout: 5000
    })
    const commandLine = /REG_(?:EXPAND_)?SZ\s+(.+)/.exec(stdout)?.[1]?.trim()
    if (!commandLine) return null
    const [command, ...rest] = splitCommandLine(commandLine)
    if (!command || !(await pathExists(command))) return null
    // On retire les arguments propres au lien cliqué (%1, --origin=urlscheme).
    const args = rest.filter((arg) => !arg.includes('%1') && !arg.startsWith('--origin'))
    const flavor: CurseForgeFlavor = /overwolf/i.test(commandLine) ? 'overwolf' : 'standalone'
    return { flavor, command, args }
  } catch {
    return null
  }
}

async function launcherFromKnownPaths(): Promise<Launcher | null> {
  const standalone = join(localAppData(), 'Programs', 'CurseForge Windows', 'CurseForge.exe')
  if (await pathExists(standalone)) return { flavor: 'standalone', command: standalone, args: [] }

  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const overwolf = join(programFilesX86, 'Overwolf', 'OverwolfLauncher.exe')
  const extension = join(localAppData(), 'Overwolf', 'Extensions', CURSEFORGE_OVERWOLF_UID)
  if ((await pathExists(overwolf)) && (await pathExists(extension))) {
    return { flavor: 'overwolf', command: overwolf, args: ['-launchapp', CURSEFORGE_OVERWOLF_UID, '-from-desktop'] }
  }
  return null
}

async function findLauncher(): Promise<Launcher | null> {
  return (await launcherFromProtocol()) ?? (await launcherFromKnownPaths())
}

/**
 * Ouvre CurseForge. S'il tourne déjà, les deux versions (Overwolf et autonome)
 * se contentent de remettre leur fenêtre au premier plan.
 */
export async function launchCurseForge(): Promise<boolean> {
  const launcher = await findLauncher()
  if (!launcher) return false
  const child = spawn(launcher.command, launcher.args, { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
  return true
}

const LOG_PATTERN =
  /(?:Setting file watcher on instance directory|Resolving Minecraft instances list from) ([^"\r\n]+)/g

/**
 * CurseForge n'expose pas son dossier d'instances dans un fichier de réglages lisible,
 * mais l'écrit dans ses logs à chaque démarrage : on lit les plus récents.
 */
async function instancesDirFromLogs(): Promise<string | null> {
  const logDirs = [
    join(localAppData(), 'Overwolf', 'Log', 'Apps', 'CurseForge', 'CurseClient'),
    join(roamingAppData(), 'CurseForge', 'logs'),
    join(localAppData(), 'CurseForge', 'logs')
  ]
  const files: Array<{ path: string; mtime: number }> = []
  for (const dir of logDirs) {
    const names = await readdir(dir).catch(() => [] as string[])
    for (const name of names) {
      if (!/\.(json|log|txt)$/i.test(name)) continue
      const path = join(dir, name)
      const info = await stat(path).catch(() => null)
      if (info?.isFile()) files.push({ path, mtime: info.mtimeMs })
    }
  }
  files.sort((a, b) => b.mtime - a.mtime)

  for (const file of files.slice(0, 4)) {
    const handle = await open(file.path, 'r').catch(() => null)
    if (!handle) continue
    try {
      const buffer = Buffer.alloc(2 * 1024 * 1024)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      const text = buffer.toString('utf8', 0, bytesRead)
      let found: string | null = null
      for (const match of text.matchAll(LOG_PATTERN)) found = match[1]
      if (found) return found.trim().replace(/\\\\/g, '\\')
    } finally {
      await handle.close()
    }
  }
  return null
}

export async function resolveInstancesDir(
  settings: Pick<Settings, 'instancesDir'>
): Promise<{ dir: string; source: CurseForgeStatus['instancesDirSource'] }> {
  if (settings.instancesDir) return { dir: settings.instancesDir, source: 'settings' }
  const fromLogs = await instancesDirFromLogs()
  if (fromLogs) return { dir: fromLogs, source: 'curseforge' }
  return { dir: defaultInstancesDir(), source: 'default' }
}

export async function getCurseForgeStatus(settings: Settings): Promise<CurseForgeStatus> {
  const [launcher, { dir, source }] = await Promise.all([findLauncher(), resolveInstancesDir(settings)])
  return {
    installed: launcher !== null,
    flavor: launcher?.flavor ?? null,
    instancesDir: dir,
    instancesDirSource: source,
    instancesDirExists: await pathExists(dir)
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Processus de CurseForge : l'application autonome et tout ce qu'elle embarque, ou l'application Overwolf (son
 * processus vit dans `Overwolf\ProcessCache\<version>\<uid>`, ses composants dans `Overwolf\Extensions\<uid>`).
 * Jamais Overwolf lui-même, ni Minecraft, ni ce qui tourne depuis le dossier du jeu (lanceur officiel…).
 */
async function curseForgeProcesses(instancesDir: string): Promise<number[]> {
  if (process.platform !== 'win32') return []
  const launcher = await findLauncher()
  // Comparés en minuscules, avec des « \ » et un « \ » final : « C:\A\B » ne doit pas couvrir « C:\A\Bis ».
  const folder = (path: string) => `${path.replace(/\//g, '\\').replace(/\\+$/, '')}\\`.toLowerCase()
  const roots = [
    join(localAppData(), 'Programs', 'CurseForge Windows'),
    join(roamingAppData(), 'CurseForge'),
    join(localAppData(), 'CurseForge'),
    ...(launcher?.flavor === 'standalone' ? [dirname(launcher.command)] : [])
  ].map(folder)
  const gameRoot = folder(dirname(instancesDir))
  const overwolfApp = `\\${CURSEFORGE_OVERWOLF_UID}\\`
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | ForEach-Object { '{0}|{1}' -f $_.ProcessId, $_.ExecutablePath }"
      ],
      { windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }
    )
    const pids: number[] = []
    for (const line of stdout.split(/\r?\n/)) {
      const separator = line.indexOf('|')
      const pid = Number(line.slice(0, separator))
      const path = line.slice(separator + 1).trim().replace(/\//g, '\\').toLowerCase()
      if (separator < 1 || !pid || pid === process.pid) continue
      if (/\\javaw?\.exe$/.test(path) || path.startsWith(gameRoot)) continue
      if (path.includes(overwolfApp) || roots.some((root) => path.startsWith(root))) pids.push(pid)
    }
    return pids
  } catch {
    return []
  }
}

/** CurseForge est ouvert (fenêtre ou zone de notification). */
export async function isCurseForgeRunning(instancesDir: string): Promise<boolean> {
  return (await curseForgeProcesses(instancesDir)).length > 0
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Attend la fin de ces processus ; renvoie ceux qui tournent encore au bout du délai. */
async function waitForExit(pids: number[], timeoutMs: number): Promise<number[]> {
  const deadline = Date.now() + timeoutMs
  let alive = pids.filter(isAlive)
  while (alive.length > 0 && Date.now() < deadline) {
    await sleep(250)
    alive = alive.filter(isAlive)
  }
  return alive
}

/** Sans `force`, Windows demande à leurs fenêtres de se fermer, comme un clic sur la croix. */
function taskkill(pids: number[], force: boolean): Promise<void> {
  const args = [...(force ? ['/F'] : []), ...pids.flatMap((pid) => ['/PID', String(pid)])]
  return new Promise((resolve) => execFile('taskkill', args, { windowsHide: true, timeout: 15_000 }, () => resolve()))
}

/**
 * Ferme CurseForge puis le rouvre : il relit alors tout le dossier Instances, ce qu'il ne fait qu'au démarrage.
 * C'est ce qui affiche un modpack installé ou mis à jour pendant qu'il était ouvert. Refusé si Minecraft tourne
 * depuis l'un de ses profils.
 */
export async function restartCurseForge(instancesDir: string): Promise<CurseForgeRestartResult> {
  if (await isGameRunningFrom(instancesDir)) {
    return { ok: false, error: 'Minecraft est lancé depuis CurseForge : ferme le jeu, puis relance CurseForge.' }
  }
  const pids = await curseForgeProcesses(instancesDir)
  if (pids.length > 0) {
    // D'abord comme la croix de sa fenêtre ; s'il reste dans la zone de notification, de force.
    await taskkill(pids, false)
    let alive = await waitForExit(pids, 5000)
    if (alive.length > 0) {
      await taskkill(alive, true)
      alive = await waitForExit(alive, 5000)
    }
    if (alive.length > 0) return { ok: false, error: 'CurseForge ne s’est pas fermé : ferme-le à la main, puis rouvre-le.' }
    // Le temps pour Overwolf de constater la fermeture de l'application avant de la relancer.
    await sleep(1000)
  }
  return (await launchCurseForge()) ? { ok: true } : { ok: false, error: 'CurseForge est introuvable sur ce PC.' }
}

/** Indique si un Minecraft (java/javaw) tourne actuellement depuis ce dossier d'instance. */
export async function isGameRunningFrom(instancePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='javaw.exe' OR Name='java.exe'\" | ForEach-Object { $_.CommandLine }"
      ],
      { windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }
    )
    const needle = instancePath.replace(/[\\/]+$/, '').toLowerCase()
    return stdout.toLowerCase().includes(needle)
  } catch {
    return false
  }
}
