// Test avec des joueurs : le serveur de test démarre (serverTest.ts), puis de vrais clients Minecraft, lancés hors
// ligne avec tous les mods du profil (ceux du client compris), le rejoignent. Une fois connectés, ils sont dispersés
// dans le monde (génération et chargement de terrain), de nuit (apparition des monstres), puis on vérifie qu'aucun
// client n'a planté ni n'a été déconnecté. Aucun compte Minecraft : le serveur local est hors ligne, et les clients ne
// se connectent qu'à lui. Les fichiers du jeu viennent de CurseForge (le profil doit avoir été lancé une fois).
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFile, cp, link, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { freemem } from 'node:os'
import { basename, join } from 'node:path'
import type { LogIssue, PlayerTestReport, TestPlayer } from '../../shared/studio'
import { pathExists } from '../fsutil'
import { modsOf } from '../profiles'
import { sendWindowsToBack, stopProcessTrees } from '../powershell'
import { describeError } from '../studio/analyze'
import { clientArguments, profileVersionId } from './clientLaunch'
import { curseForgeInstallDir, findJava, javaRequirement } from './java'
import { LogIssueCollector } from './logIssues'
import { crashReport, runServerTest, type ServerSession, type ServerTestOptions } from './serverTest'
import { readProfileMods } from './staticChecks'

type Json = Record<string, unknown>

/** Dossiers du profil que le client lit (configurations, scripts, packs de ressources). Pas les shaders : trop lourds. */
const CLIENT_FOLDERS = ['config', 'defaultconfigs', 'kubejs', 'scripts', 'resourcepacks', 'global_packs', 'openloader', 'paxi']

/** Réglages du jeu imposés aux clients du test : léger, muet, sans écran d'accueil qui bloquerait la connexion. */
const OPTIONS: Record<string, string> = {
  renderDistance: '6',
  simulationDistance: '6',
  maxFps: '30',
  enableVsync: 'false',
  fullscreen: 'false',
  pauseOnLostFocus: 'false',
  soundCategory_master: '0.0',
  narrator: '0',
  onboardAccessibility: 'false',
  skipMultiplayerWarning: 'true',
  joinedFirstServer: 'true',
  tutorialStep: 'none'
}

export const MAX_TEST_PLAYERS = 4

export interface PlayerTestOptions extends Omit<ServerTestOptions, 'whileRunning'> {
  /** Dossier de travail des clients (un sous-dossier par joueur, vidé avant chaque test). */
  clientsDir: string
  /** Nombre de joueurs (1 à 4, 2 par défaut). */
  players?: number
  /** Temps de jeu une fois tout le monde connecté (90 s par défaut). */
  playMs?: number
  /** Temps laissé à chaque client pour démarrer et rejoindre (10 min par défaut). */
  joinTimeoutMs?: number
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true })
  })

/** Lien dur (même disque, instantané, sans place prise), sinon copie. */
async function linkOrCopy(from: string, to: string) {
  await link(from, to).catch(() => copyFile(from, to))
}

/** Le dossier de jeu d'un joueur : les mods actifs du profil, ses configurations et ses réglages, allégés. */
async function prepareGameDir(profilePath: string, dir: string, jars: string[]) {
  await clearDir(dir)
  await mkdir(join(dir, 'mods'), { recursive: true })
  for (const jar of jars) await linkOrCopy(join(profilePath, 'mods', jar), join(dir, 'mods', jar))
  for (const folder of CLIENT_FOLDERS) {
    if (await pathExists(join(profilePath, folder))) await cp(join(profilePath, folder), join(dir, folder), { recursive: true })
  }
  const own = await readFile(join(profilePath, 'options.txt'), 'utf8').catch(() => '')
  const options = new Map(own.split(/\r?\n/).filter((l) => l.includes(':')).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1)]))
  for (const [key, value] of Object.entries(OPTIONS)) options.set(key, value)
  await writeFile(join(dir, 'options.txt'), [...options].map(([k, v]) => `${k}:${v}`).join('\n') + '\n')
}

/**
 * Le jeu n'a pas pu charger ses mods : Forge et Fabric affichent alors une fenêtre d'erreur et attendent, au lieu de
 * quitter. Reconnu dans le journal du client.
 */
const LOADING_FAILED = /Mod loading has failed|Error loading mods|Incompatible mods? found|FormattedException|LoadingFailedException|---- Minecraft Crash Report ----/

interface RunningClient {
  name: string
  dir: string
  child: ChildProcess
  launchedAt: number
  lines: string[]
  issues: LogIssueCollector
  exitedAt: number | null
  /** Ligne du journal qui dit que le chargement a échoué. */
  loadingFailed: string | null
  joinedAt: number | null
  kicked: string | null
}

const gone = (c: RunningClient) => c.exitedAt !== null || c.loadingFailed !== null || c.kicked !== null

function startClient(java: string, args: string[], name: string, dir: string): RunningClient {
  const child = spawn(java, args, { cwd: dir, windowsHide: true })
  const client: RunningClient = {
    name,
    dir,
    child,
    launchedAt: Date.now(),
    lines: [],
    issues: new LogIssueCollector(),
    exitedAt: null,
    loadingFailed: null,
    joinedAt: null,
    kicked: null
  }
  let buffer = ''
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString()
    const parts = buffer.split(/\r?\n/)
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      client.lines.push(line)
      if (client.lines.length > 200) client.lines.shift()
      client.issues.add(line)
      if (client.loadingFailed === null && LOADING_FAILED.test(line)) client.loadingFailed = line.trim().slice(0, 300)
    }
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  child.on('close', () => (client.exitedAt ??= Date.now()))
  child.on('error', (err) => {
    client.lines.push(`Java n’a pas pu démarrer : ${err.message}`)
    client.exitedAt ??= Date.now()
  })
  return client
}

/** Ferme les jeux et ce qu'ils ont lancé à côté, puis laisse Windows libérer leurs dossiers. */
async function stopClients(clients: RunningClient[], java: string) {
  const pids = clients.map((c) => c.child.pid).filter((pid): pid is number => typeof pid === 'number')
  const since = new Date(Math.min(...clients.map((c) => c.launchedAt)) - 1000)
  if (process.platform === 'win32' && pids.length) await stopProcessTrees(pids, { executable: java, since })
  for (const client of clients) if (client.exitedAt === null) client.child.kill()
  await sleep(1000)
}

/** Vide un dossier, en réessayant le temps qu'un processus qui vient d'être arrêté le libère. */
async function clearDir(dir: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rm(dir, { recursive: true, force: true })
    } catch (err) {
      if (attempt >= 10) throw err
      await sleep(500)
    }
  }
}

/** Mémoire de chaque client : celle du profil, bornée (un client de test n'a pas besoin de 15 Go). */
const clientMemory = (instance: Json) => Math.min(Math.max(Number(instance.allocatedMemory) || 4096, 3072), 8192)

export async function runPlayerTest(profilePath: string, options: PlayerTestOptions): Promise<PlayerTestReport> {
  const started = Date.now()
  const step = options.onStep ?? (() => {})
  const signature = (await modsOf(profilePath))?.signature ?? null
  const base = { profile: basename(profilePath), profilePath, startedAt: new Date(started).toISOString(), modsSignature: signature }
  const unavailable = (message: string): PlayerTestReport => ({
    ...base,
    durationMs: Date.now() - started,
    outcome: 'unavailable',
    message,
    players: [],
    server: null,
    clientIssues: []
  })

  const { instance, jars } = await readProfileMods(profilePath)
  const installDir = curseForgeInstallDir(options.instancesDir)
  const minecraftVersion = typeof instance.gameVersion === 'string' ? instance.gameVersion : null
  const versionId = profileVersionId(instance)
  if (!minecraftVersion || !versionId) return unavailable('Ce profil n’indique pas sa version de Minecraft.')

  // Assez de mémoire libre pour le serveur et les clients ? Sinon, moins de joueurs.
  const memory = clientMemory(instance)
  const wanted = Math.min(Math.max(options.players ?? 2, 1), MAX_TEST_PLAYERS)
  const freeMb = freemem() / 1024 / 1024
  const fits = Math.floor((freeMb - 4096) / Math.max(memory * 0.6, 2048))
  const count = Math.min(wanted, fits)
  if (count < 1) return unavailable(`Pas assez de mémoire libre pour lancer un joueur (${Math.round(freeMb / 1024)} Go libres).`)

  let java: string
  let argsFor: (name: string, port: number) => Promise<string[]>
  try {
    java = await findJava(installDir, await javaRequirement(installDir, minecraftVersion))
    argsFor = (name, port) =>
      clientArguments({
        installDir,
        versionId,
        gameDir: join(options.clientsDir, name),
        nativesDir: join(options.clientsDir, name, 'natives'),
        username: name,
        memoryMb: memory,
        server: { host: '127.0.0.1', port },
        width: 854,
        height: 480
      })
    // Vérifie tout de suite que le jeu est installé (fichiers de version, bibliothèques), avant de démarrer le serveur.
    await argsFor('Testeur1', 25565)
  } catch (err) {
    return unavailable(describeError(err))
  }

  const names = Array.from({ length: count }, (_, i) => `Testeur${i + 1}`)
  const clients: RunningClient[] = []
  let phase = ''
  /** Moment où le test a fini et fermé les jeux : un jeu fermé avant a planté. */
  let endedAt = Infinity

  const server = await runServerTest(profilePath, {
    ...options,
    whileRunning: async (session: ServerSession) => {
      const stopListening = session.onLine((line) => {
        for (const client of clients) {
          if (client.joinedAt === null && new RegExp(`\\b${client.name}(\\[[^\\]]*\\])? (joined the game|logged in with entity id)`).test(line)) {
            client.joinedAt = Date.now()
          }
          // « Testeur1 lost connection: … », ou depuis Minecraft 26 « Testeur1 (/127.0.0.1:5000) lost connection: … »
          const lost = new RegExp(`\\b${client.name}(?: \\([^)]*\\))? lost connection: (.+)$`).exec(line)
          if (lost && client.kicked === null && phase !== 'fin') client.kicked = lost[1].trim()
        }
      })
      try {
        step(`Préparation de ${count > 1 ? `${count} joueurs` : 'un joueur'}`)
        for (const name of names) await prepareGameDir(profilePath, join(options.clientsDir, name), jars.map((j) => j.file))
        for (const name of names) {
          step(`Lancement du jeu de ${name}`)
          clients.push(startClient(java, await argsFor(name, session.port), name, join(options.clientsDir, name)))
          await sleep(3000, options.signal)
        }

        // Tout le monde rejoint (le jeu met une à plusieurs minutes à démarrer avec beaucoup de mods).
        const deadline = Date.now() + (options.joinTimeoutMs ?? 10 * 60_000)
        let serverDown = false
        void session.exited.then(() => (serverDown = true))
        // Les fenêtres du jeu passent derrière celles de l'utilisateur tant que le jeu charge (il peut en ouvrir
        // plusieurs) ; une fois le joueur connecté, on n'y touche plus : l'utilisateur peut regarder la partie.
        const pushBack = async () => {
          if (process.platform !== 'win32') return
          const loading = clients.filter((c) => !gone(c) && (c.joinedAt === null || Date.now() - c.joinedAt < 6000))
          await sendWindowsToBack(loading.map((c) => c.child.pid).filter((pid): pid is number => typeof pid === 'number'))
        }
        while (!options.signal?.aborted && !serverDown && Date.now() < deadline) {
          await pushBack()
          const waiting = clients.filter((c) => c.joinedAt === null && !gone(c))
          if (!waiting.length) break
          const joined = clients.filter((c) => c.joinedAt !== null).length
          step(`Démarrage des jeux : ${joined}/${clients.length} joueur(s) connecté(s)`)
          await sleep(2000, options.signal)
        }
        const playing = clients.filter((c) => c.joinedAt !== null && !gone(c))
        if (!playing.length || serverDown || options.signal?.aborted) return

        // La partie : dispersés loin les uns des autres (terrain neuf à générer et à afficher), de nuit.
        phase = 'jeu'
        const playMs = options.playMs ?? 90_000
        session.command('gamemode creative @a')
        session.command('time set midnight')
        session.command('spreadplayers 0 0 300 2000 false @a')
        const end = Date.now() + playMs
        let spreadAgain = Date.now() + playMs / 2
        while (!options.signal?.aborted && !serverDown && Date.now() < end) {
          if (!clients.some((c) => c.joinedAt !== null && !gone(c))) break
          await pushBack()
          const still = clients.filter((c) => c.joinedAt !== null && !gone(c)).length
          step(`Partie en cours : ${still} joueur(s), encore ${Math.ceil((end - Date.now()) / 1000)} s`)
          if (Date.now() > spreadAgain) {
            session.command('spreadplayers 0 0 300 2000 false @a')
            spreadAgain = Infinity
          }
          await sleep(2000, options.signal)
        }
      } finally {
        phase = 'fin'
        endedAt = Date.now()
        stopListening()
        session.command('kick @a Fin du test')
        await sleep(2000)
        await stopClients(clients, java)
      }
    }
  })

  // Le bilan de chaque joueur.
  const players: TestPlayer[] = []
  for (const name of names) {
    const client = clients.find((c) => c.name === name)
    if (!client) {
      players.push({ name, outcome: 'not-joined', message: 'Pas lancé : le serveur n’a pas démarré.', joinedAfterMs: null, crashReport: null, logTail: [] })
      continue
    }
    const crash = await crashReport(client.dir, client.launchedAt).catch(() => null)
    const joinedAfterMs = client.joinedAt === null ? null : client.joinedAt - client.launchedAt
    const tail = client.lines.slice(-60)
    let player: TestPlayer
    if (client.kicked !== null) {
      player = { name, outcome: 'kicked', message: `Déconnecté par le serveur : ${client.kicked}`, joinedAfterMs, crashReport: crash, logTail: tail }
    } else if (crash || client.loadingFailed !== null || (client.exitedAt !== null && client.exitedAt < endedAt)) {
      const what = crash?.description
        ? ` : ${crash.description}${crash.suspects.length ? ` (mods suspectés : ${crash.suspects.join(', ')})` : ''}`
        : client.loadingFailed && !client.loadingFailed.includes('Crash Report')
          ? ` : ${client.loadingFailed.replace(/^\[[^\]]*\]\s*(\[[^\]]*\]\s*)*:?\s*/, '')}`
          : ''
      const when = client.joinedAt === null ? (client.loadingFailed ? ' au chargement des mods' : ' avant de rejoindre') : ' pendant la partie'
      player = { name, outcome: 'crashed', message: `Le jeu a planté${when}${what}.`, joinedAfterMs, crashReport: crash, logTail: tail }
    } else if (client.joinedAt === null) {
      player = { name, outcome: 'not-joined', message: 'N’a pas rejoint le serveur à temps.', joinedAfterMs: null, crashReport: null, logTail: tail }
    } else {
      player = { name, outcome: 'played', message: `A rejoint en ${Math.round(joinedAfterMs! / 1000)} s et joué jusqu’au bout.`, joinedAfterMs, crashReport: null, logTail: [] }
    }
    players.push(player)
  }

  const failedPlayers = players.filter((p) => p.outcome !== 'played')
  const passed = server.outcome === 'started' && failedPlayers.length === 0
  const message = server.outcome !== 'started'
    ? server.message
    : passed
      ? `${players.length > 1 ? `Les ${players.length} joueurs ont` : 'Le joueur a'} rejoint le serveur et joué sans problème.${count < wanted ? ` (${count} au lieu de ${wanted} : mémoire libre insuffisante.)` : ''}`
      : failedPlayers.map((p) => `${p.name} : ${p.message}`).join(' ')
  const clientIssues: LogIssue[] = clients[0]?.issues.list() ?? []
  return { ...base, durationMs: Date.now() - started, outcome: passed ? 'passed' : 'failed', message, players, server, clientIssues }
}
