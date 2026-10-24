// Lancement d'un vrai client Minecraft pour le test avec des joueurs, à partir de ce que CurseForge a installé
// (Install/versions, libraries, assets) : la commande Java est construite comme le fait le lanceur officiel, d'après
// le fichier de version du chargeur et celui du jeu dont il hérite. Le joueur est hors ligne (pseudo choisi, aucun
// compte) et rejoint directement le serveur de test local (« quick play »).
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathExists, readJson } from '../fsutil'
import { StudioError } from '../studio/analyze'
import { openEntry, openZip, readEntries } from '../zip'

type Json = Record<string, unknown>

interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string }
  features?: Record<string, boolean>
}

interface Library {
  name: string
  rules?: Rule[]
  downloads?: { artifact?: { path?: string }; classifiers?: Record<string, { path?: string }> }
  natives?: Record<string, string>
}

type Argument = string | { rules?: Rule[]; value: string | string[] }

interface VersionFile {
  id: string
  inheritsFrom?: string
  jar?: string
  mainClass?: string
  type?: string
  assets?: string
  assetIndex?: { id: string }
  libraries?: Library[]
  arguments?: { game?: Argument[]; jvm?: Argument[] }
  minecraftArguments?: string
}

/** Fonctions du lanceur que le test utilise : fenêtre de taille choisie et connexion directe à un serveur. */
const FEATURES: Record<string, boolean> = { has_custom_resolution: true, is_quick_play_multiplayer: true }

function osMatches(os: Rule['os']): boolean {
  if (!os) return true
  if (os.name && os.name !== 'windows') return false
  if (os.arch === 'x86') return process.arch === 'ia32'
  if (os.arch === 'arm64') return process.arch === 'arm64'
  return true
}

/** Règles du lanceur : sans règle, permis ; sinon la dernière règle qui s'applique décide. */
export function allowed(rules: Rule[] | undefined): boolean {
  if (!rules?.length) return true
  let result = false
  for (const rule of rules) {
    const featuresMatch = Object.entries(rule.features ?? {}).every(([name, wanted]) => (FEATURES[name] ?? false) === wanted)
    if (osMatches(rule.os) && featuresMatch) result = rule.action === 'allow'
  }
  return result
}

/** Chemin d'une bibliothèque dans libraries/ d'après ses coordonnées Maven (groupe:nom:version[:classifieur][@ext]). */
export function libraryPath(name: string, classifier?: string): string {
  const [coords, ext = 'jar'] = name.split('@')
  const [group, artifact, version, ownClassifier] = coords.split(':')
  const suffix = classifier ?? ownClassifier
  return [...group.split('.'), artifact, version, `${artifact}-${version}${suffix ? `-${suffix}` : ''}.${ext}`].join('/')
}

/** Clé d'une bibliothèque sans sa version : la même bibliothèque citée par le chargeur et par le jeu n'est prise qu'une fois. */
const libraryKey = (name: string) => {
  const [coords] = name.split('@')
  const [group, artifact, , classifier] = coords.split(':')
  return `${group}:${artifact}:${classifier ?? ''}`
}

/** Le fichier de version et ceux dont il hérite, du plus précis (le chargeur) au jeu. */
async function versionChain(installDir: string, id: string): Promise<VersionFile[]> {
  const chain: VersionFile[] = []
  let next: string | undefined = id
  while (next && chain.length < 5) {
    const file = join(installDir, 'versions', next, `${next}.json`)
    const version = await readJson<VersionFile>(file)
    if (!version) {
      throw new StudioError(
        `Le jeu (${next}) n’est pas installé dans CurseForge. Lance une fois ce profil depuis CurseForge, puis refais le test.`
      )
    }
    chain.push(version)
    next = version.inheritsFrom
  }
  return chain
}

/** Extrait les natives d'une ancienne version (champ `natives`, avant Minecraft 1.19), sans META-INF. */
async function extractNatives(jar: string, destination: string): Promise<void> {
  const zip = await openZip(jar)
  try {
    for (const entry of await readEntries(zip)) {
      if (entry.fileName.endsWith('/') || entry.fileName.startsWith('META-INF/')) continue
      const target = join(destination, entry.fileName)
      await mkdir(dirname(target), { recursive: true })
      const chunks: Buffer[] = []
      for await (const chunk of await openEntry(zip, entry)) chunks.push(chunk as Buffer)
      await writeFile(target, Buffer.concat(chunks))
    }
  } finally {
    zip.close()
  }
}

/** UUID d'un joueur hors ligne, calculé comme le fait le serveur (« OfflinePlayer:<pseudo> », version 3). */
export function offlineUuid(name: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  return hash.toString('hex')
}

export interface ClientLaunchOptions {
  installDir: string
  /** Version à lancer (id du fichier de version du chargeur : « forge-47.4.18 », « fabric-loader-0.19.5-26.3 »). */
  versionId: string
  gameDir: string
  nativesDir: string
  username: string
  memoryMb: number
  server: { host: string; port: number }
  width?: number
  height?: number
}

/** Arguments à passer à Java pour lancer ce client (sans l'exécutable). */
export async function clientArguments(options: ClientLaunchOptions): Promise<string[]> {
  const chain = await versionChain(options.installDir, options.versionId)
  const root = chain.at(-1)!
  if (!chain.some((v) => v.arguments) && chain.some((v) => v.minecraftArguments)) {
    throw new StudioError('Version de Minecraft trop ancienne pour le test avec des joueurs (avant la 1.13).')
  }
  const librariesDir = join(options.installDir, 'libraries')
  await mkdir(options.nativesDir, { recursive: true })

  const classpath: string[] = []
  const seen = new Set<string>()
  for (const version of chain) {
    for (const library of version.libraries ?? []) {
      if (!allowed(library.rules)) continue
      if (library.natives?.windows) {
        const classifier = library.natives.windows.replace('${arch}', process.arch === 'ia32' ? '32' : '64')
        const path = library.downloads?.classifiers?.[classifier]?.path ?? libraryPath(library.name, classifier)
        if (await pathExists(join(librariesDir, path))) await extractNatives(join(librariesDir, path), options.nativesDir)
      }
      if (library.downloads && !library.downloads.artifact) continue
      const key = libraryKey(library.name)
      if (seen.has(key)) continue
      seen.add(key)
      const file = join(librariesDir, library.downloads?.artifact?.path ?? libraryPath(library.name))
      if (!(await pathExists(file))) {
        throw new StudioError(`Bibliothèque du jeu absente (${library.name}). Lance une fois ce profil depuis CurseForge, puis refais le test.`)
      }
      classpath.push(file)
    }
  }
  // Le jar du jeu : celui de la version lancée (CurseForge le copie à côté du chargeur), sinon celui du jeu.
  const jarCandidates = [chain[0].jar ?? chain[0].id, root.jar ?? root.id].map((id) => join(options.installDir, 'versions', id, `${id}.jar`))
  const gameJar = (await Promise.all(jarCandidates.map(async (f) => ((await pathExists(f)) ? f : null)))).find(Boolean)
  if (!gameJar) throw new StudioError(`Le jeu (${root.id}) n’est pas installé dans CurseForge. Lance une fois ce profil depuis CurseForge.`)
  classpath.push(gameJar)

  const values: Record<string, string> = {
    auth_player_name: options.username,
    version_name: chain[0].id,
    game_directory: options.gameDir,
    assets_root: join(options.installDir, 'assets'),
    game_assets: join(options.installDir, 'assets'),
    assets_index_name: root.assetIndex?.id ?? root.assets ?? root.id,
    auth_uuid: offlineUuid(options.username),
    auth_access_token: '0',
    auth_session: '0',
    clientid: '0',
    auth_xuid: '0',
    user_type: 'legacy',
    user_properties: '{}',
    version_type: chain[0].type ?? root.type ?? 'release',
    resolution_width: String(options.width ?? 854),
    resolution_height: String(options.height ?? 480),
    quickPlayMultiplayer: `${options.server.host}:${options.server.port}`,
    natives_directory: options.nativesDir,
    launcher_name: 'modding-manager',
    launcher_version: '1',
    classpath: classpath.join(';'),
    classpath_separator: ';',
    library_directory: librariesDir
  }
  const fill = (text: string) => text.replace(/\$\{([^}]+)\}/g, (all, name: string) => values[name] ?? all)
  const expand = (args: Argument[]) =>
    args.flatMap((arg) => (typeof arg === 'string' ? [arg] : allowed(arg.rules) ? (Array.isArray(arg.value) ? arg.value : [arg.value]) : [])).map(fill)

  // Arguments du jeu, puis ceux du chargeur (le lanceur officiel les met dans cet ordre).
  const ordered = [...chain].reverse()
  const jvm = expand(ordered.flatMap((v) => v.arguments?.jvm ?? []))
  const game = expand(ordered.flatMap((v) => v.arguments?.game ?? []))
  if (!game.includes('--quickPlayMultiplayer')) game.push('--server', options.server.host, '--port', String(options.server.port))
  const mainClass = chain.find((v) => v.mainClass)?.mainClass
  if (!mainClass) throw new StudioError(`Fichier de version incomplet (${chain[0].id}) : classe principale absente.`)
  return [`-Xmx${options.memoryMb}M`, '-Xms512M', ...jvm, mainClass, ...game]
}

/** La version du chargeur installée par CurseForge pour ce profil (id de son fichier de version). */
export function profileVersionId(instance: Json): string | null {
  const loader = instance.baseModLoader as Json | null
  if (typeof loader?.versionJson === 'string') {
    try {
      const id = (JSON.parse(loader.versionJson) as { id?: unknown }).id
      if (typeof id === 'string') return id
    } catch {
      // illisible : on se rabat sur le nom
    }
  }
  if (typeof loader?.name === 'string') return loader.name
  return typeof instance.gameVersion === 'string' ? instance.gameVersion : null
}
