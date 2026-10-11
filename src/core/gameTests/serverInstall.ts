// Serveur Minecraft dédié pour tester un profil : installé une fois par chargeur (Fabric, Forge, NeoForge) dans un
// dossier de cache, avec ses bibliothèques, puis réutilisé à chaque test. Seuls les outils officiels des chargeurs
// sont utilisés (lanceur de serveur Fabric, installeurs Forge et NeoForge en mode serveur).
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathExists } from '../fsutil'
import { StudioError } from '../studio/analyze'

export interface LoaderSpec {
  kind: 'fabric' | 'forge' | 'neoforge'
  /** Version du chargeur (« 0.19.5 », « 47.4.18 », « 21.1.215 »). */
  version: string
  minecraftVersion: string
}

/** Le chargeur d'un profil d'après ce qu'écrit CurseForge (« forge-47.4.18 », « fabric-0.19.5-26.3 »…). */
export function parseLoader(modLoader: string | null, minecraftVersion: string): LoaderSpec | null {
  const match = /^(neoforge|forge|fabric)-([^-]+)/i.exec(modLoader ?? '')
  if (!match) return null
  return { kind: match[1].toLowerCase() as LoaderSpec['kind'], version: match[2], minecraftVersion }
}

/** Nom du dossier de cache d'un serveur. */
export const serverKey = (loader: LoaderSpec) => `${loader.kind}-${loader.minecraftVersion}-${loader.version}`

const INSTALLED_MARK = '.mpm-installed'

async function download(url: string, destination: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  } catch {
    throw new StudioError(`Téléchargement impossible (${new URL(url).host}) : vérifie ta connexion internet.`)
  }
  if (!res.ok || !res.body) throw new StudioError(`Téléchargement refusé (${res.status}) : ${url}`)
  const part = `${destination}.part`
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(part))
  await rename(part, destination)
}

/** Lance une commande et attend sa fin ; renvoie la fin de sa sortie pour expliquer un échec. */
function run(java: string, args: string[], cwd: string): Promise<{ code: number | null; tail: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(java, args, { cwd, windowsHide: true })
    let tail = ''
    const keep = (chunk: Buffer) => (tail = (tail + chunk.toString()).slice(-4000))
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, tail }))
  })
}

async function latestFabricInstaller(): Promise<string> {
  const res = await fetch('https://meta.fabricmc.net/v2/versions/installer', { signal: AbortSignal.timeout(30_000) }).catch(() => null)
  const list = res?.ok ? ((await res.json()) as Array<{ version: string; stable: boolean }>) : []
  const stable = list.find((i) => i.stable) ?? list[0]
  if (!stable) throw new StudioError('Impossible de lire les versions du lanceur Fabric (meta.fabricmc.net).')
  return stable.version
}

/** Ce qu'il faut passer à Java pour démarrer le serveur, une fois installé (sans la mémoire). */
export interface ServerLaunch {
  dir: string
  args: string[]
}

async function argsFile(dir: string, path: string[]): Promise<string[]> {
  const file = join(dir, 'libraries', ...path, 'win_args.txt')
  if (!(await pathExists(file))) throw new StudioError('Installation du serveur incomplète (win_args.txt introuvable).')
  return [`@${join('libraries', ...path, 'win_args.txt')}`, 'nogui']
}

/** Installe (une fois) le serveur du chargeur et dit comment le démarrer. */
export async function ensureServer(cacheDir: string, loader: LoaderSpec, java: string, onStep: (text: string) => void): Promise<ServerLaunch> {
  const dir = join(cacheDir, serverKey(loader))
  const installed = await pathExists(join(dir, INSTALLED_MARK))
  await mkdir(dir, { recursive: true })
  const { kind, version, minecraftVersion: mc } = loader

  if (kind === 'fabric') {
    const jar = join(dir, 'fabric-server-launch.jar')
    if (!installed) {
      onStep('Téléchargement du lanceur de serveur Fabric')
      const installer = await latestFabricInstaller()
      await download(`https://meta.fabricmc.net/v2/versions/loader/${mc}/${version}/${installer}/server/jar`, jar)
      await writeFile(join(dir, INSTALLED_MARK), new Date().toISOString())
    }
    // Au premier démarrage, le lanceur télécharge lui-même le serveur de Minecraft et ses bibliothèques.
    return { dir, args: ['-jar', 'fabric-server-launch.jar', 'nogui'] }
  }

  const [group, name, full] =
    kind === 'forge'
      ? ['https://maven.minecraftforge.net/net/minecraftforge/forge', 'forge', `${mc}-${version}`]
      : ['https://maven.neoforged.net/releases/net/neoforged/neoforge', 'neoforge', version]
  const libraryPath = kind === 'forge' ? ['net', 'minecraftforge', 'forge', full] : ['net', 'neoforged', 'neoforge', full]
  if (!installed) {
    onStep(`Installation du serveur ${kind === 'forge' ? 'Forge' : 'NeoForge'} ${version} (une seule fois)`)
    const installer = join(dir, 'installer.jar')
    await download(`${group}/${full}/${name}-${full}-installer.jar`, installer)
    const { code, tail } = await run(java, ['-jar', 'installer.jar', '--installServer'], dir)
    await rm(installer, { force: true })
    if (code !== 0) throw new StudioError(`L’installeur du serveur a échoué (code ${code}) : ${tail.trim().split('\n').slice(-3).join(' ')}`)
    await writeFile(join(dir, INSTALLED_MARK), new Date().toISOString())
  }
  if (await pathExists(join(dir, 'libraries', ...libraryPath, 'win_args.txt'))) return { dir, args: await argsFile(dir, libraryPath) }
  // Avant Minecraft 1.17, Forge s'installe en un jar à lancer directement.
  const universal = (await readdir(dir)).find((f) => new RegExp(`^${name}-.*\\.jar$`, 'i').test(f) && !/installer/i.test(f))
  if (!universal) throw new StudioError('Installation du serveur incomplète : jar du serveur introuvable.')
  return { dir, args: ['-jar', universal, 'nogui'] }
}
