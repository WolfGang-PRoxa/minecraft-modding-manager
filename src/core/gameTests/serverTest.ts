// Test d'un profil par un serveur dédié : ses mods (sauf ceux réservés au client) et ses configurations sont copiés
// dans le serveur de son chargeur, qui démarre jusqu'à « Done » puis s'arrête proprement. Un plantage est expliqué
// par son rapport (crash-reports) et la fin du journal ; les erreurs du journal sont relevées même quand il démarre.
// Sans fenêtre ni compte Minecraft. Le test avec des joueurs (playerTest.ts) garde le serveur ouvert le temps de jouer.
import { spawn } from 'node:child_process'
import { copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, join } from 'node:path'
import type { ServerTestReport } from '../../shared/studio'
import { pathExists } from '../fsutil'
import { modsOf } from '../profiles'
import { StudioError } from '../studio/analyze'
import { curseForgeInstallDir, findJava, javaRequirement } from './java'
import { LogIssueCollector } from './logIssues'
import { ensureServer, parseLoader } from './serverInstall'
import { readProfileMods } from './staticChecks'

type Json = Record<string, unknown>

/** Dossiers du profil utiles au serveur (configurations, scripts, données). */
const SERVER_FOLDERS = ['config', 'defaultconfigs', 'kubejs', 'scripts', 'datapacks', 'global_packs', 'openloader', 'paxi']

/** Ce qu'un test laisse dans le dossier du serveur, effacé avant le suivant (jamais les bibliothèques). */
const RUN_ENTRIES = ['mods', ...SERVER_FOLDERS, 'world', 'logs', 'crash-reports', 'server.properties', 'eula.txt', 'usercache.json', 'ops.json', 'whitelist.json', 'banned-ips.json', 'banned-players.json']

const DONE = /\bDone \(\d+(?:[.,]\d+)?s\)!/

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

/** Le rapport de plantage le plus récent d'un dossier de jeu : description, mods suspectés, début du texte. */
export async function crashReport(dir: string, since: number): Promise<ServerTestReport['crashReport']> {
  const folder = join(dir, 'crash-reports')
  const files = await readdir(folder).catch(() => [] as string[])
  let newest: { file: string; time: number } | null = null
  for (const file of files) {
    const time = (await stat(join(folder, file)).catch(() => null))?.mtimeMs ?? 0
    if (time >= since && (!newest || time > newest.time)) newest = { file, time }
  }
  if (!newest) return null
  const text = await readFile(join(folder, newest.file), 'utf8')
  const description = /^Description: (.+)$/m.exec(text)?.[1]?.trim() ?? null
  const suspects = [...text.matchAll(/^\s*Suspected Mods?:\s*(.+)$/gm)].map((m) => m[1].trim()).filter((s) => !/^none$/i.test(s))
  return { file: join(folder, newest.file), description, suspects, excerpt: text.split('\n').slice(0, 40).join('\n') }
}

/** Le serveur démarré, pendant qu'on y joue (test avec des joueurs). */
export interface ServerSession {
  port: number
  /** Commande tapée dans la console du serveur (sans « / »). */
  command(text: string): void
  /** Chaque ligne du journal, à partir de maintenant ; renvoie de quoi arrêter d'écouter. */
  onLine(listener: (line: string) => void): () => void
  /** Résolue si le serveur s'arrête de lui-même (plantage). */
  exited: Promise<void>
}

export interface ServerTestOptions {
  /** Dossier de cache des serveurs (un par chargeur et version). */
  cacheDir: string
  instancesDir: string
  timeoutMs?: number
  onStep?(text: string): void
  signal?: AbortSignal
  /** Une fois le serveur démarré, avant de l'arrêter : la partie du test avec des joueurs. */
  whileRunning?(session: ServerSession): Promise<void>
}

export async function runServerTest(profilePath: string, options: ServerTestOptions): Promise<ServerTestReport> {
  const started = Date.now()
  const step = options.onStep ?? (() => {})
  const { instance, jars, clientOnly } = await readProfileMods(profilePath)
  const signature = (await modsOf(profilePath))?.signature ?? null
  const minecraftVersion = typeof instance.gameVersion === 'string' ? instance.gameVersion : null
  const modLoader = ((instance.baseModLoader as Json | null)?.name as string | undefined) ?? null
  if (!minecraftVersion) throw new StudioError('Ce profil n’indique pas sa version de Minecraft.')
  const loader = parseLoader(modLoader, minecraftVersion)
  if (!loader) throw new StudioError(`Chargeur non pris en charge pour le test du serveur : ${modLoader ?? 'aucun'}.`)

  const installDir = curseForgeInstallDir(options.instancesDir)
  const java = await findJava(installDir, await javaRequirement(installDir, minecraftVersion))
  const server = await ensureServer(options.cacheDir, loader, java, step)

  step('Préparation du serveur')
  for (const entry of RUN_ENTRIES) await rm(join(server.dir, entry), { recursive: true, force: true })
  await mkdir(join(server.dir, 'mods'), { recursive: true })
  const skipped = new Set(clientOnly)
  for (const { file } of jars) {
    if (!skipped.has(file)) await copyFile(join(profilePath, 'mods', file), join(server.dir, 'mods', file))
  }
  for (const folder of SERVER_FOLDERS) {
    if (await pathExists(join(profilePath, folder))) await cp(join(profilePath, folder), join(server.dir, folder), { recursive: true })
  }
  // Le test accepte le CLUF de Minecraft pour ce serveur local (https://aka.ms/MinecraftEULA).
  await writeFile(join(server.dir, 'eula.txt'), 'eula=true\n')
  const port = await freePort()
  await writeFile(
    join(server.dir, 'server.properties'),
    [
      `server-port=${port}`,
      'server-ip=127.0.0.1',
      // Hors ligne : les joueurs du test sont des clients sans compte, qui ne se connectent qu'à ce serveur local.
      'online-mode=false',
      'enforce-secure-profile=false',
      'white-list=false',
      'enforce-whitelist=false',
      'motd=Test Modding Manager',
      // Graine d'avant le renommage en 2.0.0 : les tests restent comparables à ceux déjà faits.
      'level-seed=modpack-manager',
      'view-distance=6',
      'simulation-distance=6',
      'max-tick-time=-1',
      'spawn-protection=0',
      'enable-query=false',
      'enable-rcon=false'
    ].join('\n') + '\n'
  )

  const memory = Number(instance.allocatedMemory) >= 1024 ? Number(instance.allocatedMemory) : 4096
  step('Démarrage du serveur')
  const issues = new LogIssueCollector()
  const report = (outcome: ServerTestReport['outcome'], message: string, logTail: string[], crash: ServerTestReport['crashReport']): ServerTestReport => ({
    profile: basename(profilePath),
    profilePath,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    outcome,
    message,
    minecraftVersion,
    modLoader,
    clientOnly,
    logTail,
    crashReport: crash,
    logIssues: issues.list(),
    modsSignature: signature
  })

  const launchedAt = Date.now()
  return new Promise<ServerTestReport>((resolve) => {
    const child = spawn(java, [`-Xmx${memory}M`, ...server.args], { cwd: server.dir, windowsHide: true })
    const lines: string[] = []
    const listeners = new Set<(line: string) => void>()
    let done = false
    let stopRequested = false
    let finished = false
    let buffer = ''
    let playError: string | null = null
    let markExited: () => void = () => {}
    const exited = new Promise<void>((r) => (markExited = r))
    const timeout = setTimeout(() => finish('timeout'), options.timeoutMs ?? 15 * 60_000)
    const abort = () => finish('cancelled')
    options.signal?.addEventListener('abort', abort, { once: true })

    const stop = () => {
      if (stopRequested || child.exitCode !== null) return
      stopRequested = true
      step('Arrêt du serveur')
      child.stdin.write('stop\n')
      setTimeout(() => child.kill(), 60_000).unref()
    }

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString()
      const parts = buffer.split(/\r?\n/)
      buffer = parts.pop() ?? ''
      for (const line of parts) {
        lines.push(line)
        if (lines.length > 200) lines.shift()
        issues.add(line)
        for (const listener of listeners) listener(line)
        if (!done && DONE.test(line)) {
          done = true
          clearTimeout(timeout)
          if (!options.whileRunning) {
            step('Serveur démarré : arrêt')
            stop()
            continue
          }
          step('Serveur démarré')
          const session: ServerSession = {
            port,
            command: (text) => child.exitCode === null && !stopRequested && child.stdin.write(`${text}\n`),
            onLine: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
            exited
          }
          void options
            .whileRunning(session)
            .catch((err: unknown) => (playError = err instanceof Error ? err.message : String(err)))
            .finally(stop)
        } else if (!done && /Loading \d+ mods|Preparing (start region|spawn area)/i.test(line)) {
          step(line.replace(/^\[[^\]]*\]\s*(\[[^\]]*\]\s*)*:?\s*/, '').slice(0, 120))
        }
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    async function finish(reason: 'exit' | 'timeout' | 'cancelled' | 'error', code?: number | null, error?: Error) {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      markExited()
      options.signal?.removeEventListener('abort', abort)
      if (reason !== 'exit' && child.exitCode === null) child.kill()
      const tail = lines.slice(-60)
      const crash = await crashReport(server.dir, launchedAt).catch(() => null)
      const mods = jars.length - clientOnly.length
      if (done && stopRequested && reason === 'exit') {
        return resolve(report('started', `Le serveur a démarré avec ${mods} mods, puis s’est arrêté normalement.${playError ? ` ${playError}` : ''}`, tail, null))
      }
      if (done && reason === 'exit') {
        const message = crash?.description
          ? `Le serveur a planté pendant la partie : ${crash.description}${crash.suspects.length ? ` (mods suspectés : ${crash.suspects.join(', ')})` : ''}.`
          : `Le serveur s’est arrêté pendant la partie (code ${code}).`
        return resolve(report('crashed', message, tail, crash))
      }
      if (reason === 'timeout') return resolve(report('timeout', 'Le serveur n’a pas fini de démarrer à temps.', tail, crash))
      if (reason === 'cancelled') return resolve(report('failed', 'Test arrêté.', tail, crash))
      if (reason === 'error') return resolve(report('failed', `Java n’a pas pu démarrer : ${error?.message ?? ''}`, tail, null))
      const message = crash?.description
        ? `Le serveur a planté : ${crash.description}${crash.suspects.length ? ` (mods suspectés : ${crash.suspects.join(', ')})` : ''}.`
        : `Le serveur s’est arrêté avant d’avoir démarré (code ${code}).`
      resolve(report(crash ? 'crashed' : 'failed', message, tail, crash))
    }
    child.on('error', (err) => void finish('error', null, err))
    child.on('close', (code) => void finish('exit', code))
  })
}
