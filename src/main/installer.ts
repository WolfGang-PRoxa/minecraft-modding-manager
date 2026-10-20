import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative } from 'node:path'
import { CURSEFORGE_INSTANCE_FILE, INSTANCE_MARKER_FILE } from '../shared/config'
import type {
  InstalledModpack,
  InstallProgress,
  InstallResult,
  InstanceMarker,
  ModpackVersion
} from '../shared/types'
import { getCurseForgeStatus, isCurseForgeRunning, isGameRunningFrom, launchCurseForge } from '../core/curseforge'
import { applyInstanceGuid, writeCurseClientFile } from '../core/instanceIdentity'
import { downloadFile } from './download'
import { pathExists, readJson, removeQuietly, renameWithRetry, writeJsonAtomic } from '../core/fsutil'
import { readInstanceMarker } from '../core/previousIdentity'
import { applyModStates, carryOverConfigs, hashConfigFiles, readModStates } from '../core/playerChoices'
import { getSettings } from '../core/settings'
import { extractZip } from '../core/zip'

/**
 * Ce qu'on fait des données du joueur lors d'une mise à jour sur place :
 *  - keep : la version locale est conservée telle quelle ;
 *  - merge-local : on ajoute ce qui est nouveau, la version locale gagne en cas de conflit ;
 *  - merge-new : on garde les ajouts du joueur, la version du modpack gagne en cas de conflit.
 * Toute autre entrée fournie par le modpack (mods, config, kubejs…) est remplacée ; ensuite, les fichiers de config
 * modifiés par le joueur (si le publieur le demande) et l'état de ses mods sont repris (voir playerChoices.ts).
 */
const PLAYER_DATA: Record<string, 'keep' | 'merge-local' | 'merge-new'> = {
  'options.txt': 'keep',
  'optionsof.txt': 'keep',
  'optionsshaders.txt': 'keep',
  'servers.dat': 'keep',
  'usercache.json': 'keep',
  'usernamecache.json': 'keep',
  'command_history.txt': 'keep',
  '.curseclient': 'keep',
  logs: 'keep',
  'crash-reports': 'keep',
  journeymap: 'keep',
  xaero: 'keep',
  xaerowaypoints: 'keep',
  xaeroworldmap: 'keep',
  local: 'keep',
  saves: 'merge-local',
  screenshots: 'merge-local',
  schematics: 'merge-local',
  backups: 'merge-local',
  resourcepacks: 'merge-new',
  shaderpacks: 'merge-new'
}

/** Champs de minecraftinstance.json propres au joueur, conservés lors d'une mise à jour. */
const PRESERVED_INSTANCE_FIELDS = [
  'guid',
  'installDate',
  'lastPlayed',
  'playedCount',
  'allocatedMemory',
  'isMemoryOverride',
  'javaArgsOverride',
  'profileImagePath'
]

const COVER_PREFIX = '.modpack-cover'

/** Délai avant de réécrire minecraftinstance.json, une fois posé dans l'instance (voir placeInstanceFile). */
const INSTANCE_FILE_TOUCH_DELAY = 400

class UserError extends Error {}

const jobs = new Map<string, { controller: AbortController; cancellable: boolean }>()

/** Une installation de modpack est en cours. */
export function isInstalling(): boolean {
  return jobs.size > 0
}

export function cancelInstall(id: string): void {
  const job = jobs.get(id)
  if (job?.cancellable) job.controller.abort()
}

/** Ce que la fenêtre voit d'une instance installée (sans les empreintes du marqueur). */
function installedFrom(marker: InstanceMarker, instancePath: string): InstalledModpack {
  return {
    id: marker.id,
    version: marker.version,
    tag: marker.tag,
    installedAt: marker.installedAt,
    managedEntries: marker.managedEntries ?? [],
    instanceName: basename(instancePath),
    instancePath
  }
}

export async function listInstalled(instancesDir: string): Promise<InstalledModpack[]> {
  const entries = await readdir(instancesDir, { withFileTypes: true }).catch(() => [])
  const installed: InstalledModpack[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const instancePath = join(instancesDir, entry.name)
    const marker = await readInstanceMarker<InstanceMarker>(instancePath)
    if (marker && typeof marker.id === 'string' && typeof marker.version === 'string') {
      installed.push(installedFrom(marker, instancePath))
    }
  }
  return installed
}

function sanitizeFolderName(name: string, fallback: string): string {
  const clean = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/, '')
    .trim()
  return clean || fallback
}

async function uniqueInstanceDir(instancesDir: string, name: string): Promise<string> {
  let candidate = join(instancesDir, name)
  for (let i = 2; await pathExists(candidate); i++) candidate = join(instancesDir, `${name} (${i})`)
  return candidate
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isDirectory() ?? false
}

/** Déplace les entrées de `oldDir` dans `newDir` ; en cas de conflit, `preferNew` décide. */
async function mergeTopLevel(oldDir: string, newDir: string, preferNew: boolean): Promise<void> {
  for (const name of await readdir(oldDir)) {
    const target = join(newDir, name)
    if (await pathExists(target)) {
      if (preferNew) continue
      await removeQuietly(target)
    }
    await renameWithRetry(join(oldDir, name), target)
  }
}

/** Transfère les données du joueur de l'ancienne instance vers la nouvelle (dossier temporaire). */
async function carryOverPlayerData(previous: InstalledModpack, newDir: string): Promise<void> {
  const shipped = new Map((await readdir(newDir)).map((name) => [name.toLowerCase(), name]))
  const previouslyManaged = new Set(previous.managedEntries.map((n) => n.toLowerCase()))

  for (const name of await readdir(previous.instancePath)) {
    const key = name.toLowerCase()
    if (key === CURSEFORGE_INSTANCE_FILE || key === INSTANCE_MARKER_FILE) continue
    const from = join(previous.instancePath, name)
    const strategy = PLAYER_DATA[key]
    const shippedName = shipped.get(key)

    if (!shippedName) {
      // Absent de la nouvelle version : on garde ce qui appartient au joueur,
      // on abandonne ce que l'ancienne version du modpack avait fourni.
      if (strategy || !previouslyManaged.has(key)) await renameWithRetry(from, join(newDir, name))
      continue
    }

    const to = join(newDir, shippedName)
    const bothDirs = (await isDirectory(from)) && (await isDirectory(to))
    if (strategy === 'keep' || (strategy === 'merge-local' && !bothDirs)) {
      await removeQuietly(to)
      await renameWithRetry(from, to)
    } else if (strategy && bothDirs) {
      await mergeTopLevel(from, to, strategy === 'merge-new')
    }
  }
}

type InstanceJson = Record<string, unknown>

/** Adapte le minecraftinstance.json publié à son nouvel emplacement sur ce PC. */
function rewriteInstance(instance: InstanceJson, targetDir: string, previous: InstanceJson | null): InstanceJson {
  let data = instance
  const originalPath = typeof instance.installPath === 'string' ? instance.installPath : null
  if (originalPath) {
    const oldBase = originalPath.replace(/[\\/]+$/, '')
    if (oldBase) {
      // Remplace le chemin de l'instance d'origine partout où il apparaît.
      const from = JSON.stringify(oldBase).slice(1, -1)
      const to = JSON.stringify(targetDir).slice(1, -1)
      data = JSON.parse(JSON.stringify(instance).split(from).join(to)) as InstanceJson
    }
  }

  data.installPath = `${targetDir}\\`
  data.name = basename(targetDir)

  if (previous) {
    for (const field of PRESERVED_INSTANCE_FIELDS) {
      if (field in previous) data[field] = previous[field]
    }
  } else {
    data.guid = randomUUID()
    if ('playedCount' in data) data.playedCount = 0
    if ('installDate' in data) data.installDate = new Date().toISOString()
  }
  // Le guid de ce profil partout (entrées d'installedAddons comprises), jamais celui du profil du publieur.
  applyInstanceGuid(data, typeof data.guid === 'string' && data.guid ? data.guid : randomUUID())
  return data
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Pose minecraftinstance.json dans une instance déjà en place. CurseForge, s'il est ouvert, ne remarque pas un dossier
 * déplacé d'un bloc dans Instances : le fichier arrive donc en dernier, complet (renommé depuis le dossier de travail,
 * sur le même disque), puis il est réécrit à l'identique, comme quand un profil est créé ou modifié en place.
 */
async function placeInstanceFile(pending: string, target: string): Promise<void> {
  const content = await readFile(pending)
  try {
    await renameWithRetry(pending, target)
  } catch {
    await writeFile(target, content)
  }
  await sleep(INSTANCE_FILE_TOUCH_DELAY)
  // Si CurseForge l'a déjà réécrit, il l'a vu : on n'y touche plus.
  const current = await readFile(target).catch(() => null)
  if (current?.equals(content)) await writeFile(target, content).catch(() => {})
}

async function validImagePath(value: unknown, targetDir: string, stagingDir: string): Promise<boolean> {
  if (typeof value !== 'string' || !value) return false
  // Tant que l'instance est dans le dossier temporaire, on vérifie à son emplacement réel.
  const rel = relative(targetDir, value)
  const actual = rel && !rel.startsWith('..') ? join(stagingDir, rel) : value
  return pathExists(actual)
}

export async function installModpack(
  version: ModpackVersion,
  emit: (progress: InstallProgress) => void
): Promise<InstallResult> {
  if (jobs.size > 0) {
    return { ok: false, cancelled: false, error: 'Une installation est déjà en cours.' }
  }
  const controller = new AbortController()
  const job = { controller, cancellable: true }
  jobs.set(version.id, job)
  const { signal } = controller

  const report = (phase: InstallProgress['phase'], done = 0, total = 0, bytesPerSecond = 0) =>
    emit({ id: version.id, version: version.version, phase, done, total, bytesPerSecond })

  let workDir: string | null = null
  let keepWorkDir = false
  const zipPath = join(app.getPath('temp'), 'modpack-manager', `${version.id}-${Date.now()}.zip`)

  try {
    report('preparing')
    const settings = await getSettings()
    const status = await getCurseForgeStatus(settings)
    if (!status.installed && !status.instancesDirExists) {
      throw new UserError("CurseForge n'est pas installé sur ce PC. Installe-le puis réessaie.")
    }
    const instancesDir = status.instancesDir
    await mkdir(instancesDir, { recursive: true })

    const previous = (await listInstalled(instancesDir)).find((i) => i.id === version.id) ?? null
    if (previous && (await isGameRunningFrom(previous.instancePath))) {
      throw new UserError('Minecraft est lancé avec ce modpack. Ferme le jeu puis réessaie.')
    }

    // Le dossier de travail est sur le même disque que les instances : le basculement final
    // est un simple renommage, et CurseForge ne voit jamais d'instance à moitié extraite.
    workDir = join(dirname(instancesDir), '.modpack-manager', `${version.id}-${Date.now()}`)
    const stagingDir = join(workDir, 'new')

    // Sans empreinte, rien ne prouverait que le zip reçu est celui publié.
    if (!version.archiveSha256) {
      throw new UserError('Ce modpack ne peut pas être vérifié (empreinte absente de sa release) : installation refusée. Signale-le à son publieur.')
    }
    const { sha256 } = await downloadFile({
      url: version.archiveUrl,
      destination: zipPath,
      expectedSize: version.archiveSize,
      signal,
      onProgress: (p) => report('downloading', p.done, p.total, p.bytesPerSecond)
    })

    report('verifying')
    if (version.archiveSha256.toLowerCase() !== sha256) {
      throw new UserError("Le fichier téléchargé est corrompu (empreinte SHA-256 différente). Réessaie.")
    }

    await extractZip(zipPath, stagingDir, {
      rootMarker: CURSEFORGE_INSTANCE_FILE,
      signal,
      onProgress: (done, total) => report('extracting', done, total)
    })

    // À partir d'ici, on ne s'interrompt plus : les données du joueur sont en train d'être déplacées.
    job.cancellable = false
    report('finalizing')

    const managedEntries = await readdir(stagingDir)
    // Téléchargée avant de toucher à l'instance existante pour ne pas rallonger le basculement.
    const coverName = await downloadCover(version, stagingDir)
    const instanceFile = join(stagingDir, CURSEFORGE_INSTANCE_FILE)
    const instance = await readJson<InstanceJson>(instanceFile)
    if (!instance) throw new UserError('Archive invalide : minecraftinstance.json est illisible.')

    const marker: InstanceMarker = {
      id: version.id,
      version: version.version,
      tag: version.tag,
      installedAt: new Date().toISOString(),
      managedEntries,
      // Ce que fournit cette version : la mise à jour suivante saura ce que le joueur a changé depuis.
      configFiles: await hashConfigFiles(stagingDir)
    }
    let keptConfigs = 0

    const finalize = async (targetDir: string, previousInstance: InstanceJson | null) => {
      const finalInstance = rewriteInstance(instance, targetDir, previousInstance)
      // La vignette du profil CurseForge : celle du modpack, sauf si le joueur en a choisi une autre.
      const current = finalInstance.profileImagePath
      const isOurCover = typeof current === 'string' && basename(current).startsWith(COVER_PREFIX)
      const currentValid = await validImagePath(current, targetDir, stagingDir)
      if (coverName && (isOurCover || !currentValid)) finalInstance.profileImagePath = join(targetDir, coverName)
      else if (!currentValid) finalInstance.profileImagePath = null
      // minecraftinstance.json attend dans le dossier de travail : il n'entre dans l'instance qu'une fois celle-ci en place.
      const pendingInstance = join(workDir!, CURSEFORGE_INSTANCE_FILE)
      await writeJsonAtomic(pendingInstance, finalInstance)
      await rm(instanceFile, { force: true })
      await writeJsonAtomic(join(stagingDir, INSTANCE_MARKER_FILE), marker)
      await writeCurseClientFile(stagingDir, finalInstance.guid as string)
      await renameWithRetry(stagingDir, targetDir)
      await placeInstanceFile(pendingInstance, join(targetDir, CURSEFORGE_INSTANCE_FILE))
    }

    let targetDir: string
    if (previous) {
      targetDir = previous.instancePath
      const previousInstance = await readJson<InstanceJson>(join(targetDir, CURSEFORGE_INSTANCE_FILE))
      const previousMarker = await readInstanceMarker<InstanceMarker>(targetDir)
      // 1. On met l'ancienne instance de côté d'un seul renommage : s'il échoue, rien n'a bougé.
      const oldDir = join(workDir, 'old')
      await renameWithRetry(targetDir, oldDir)
      try {
        // 2. On y récupère les données du joueur, ses configurations modifiées si le publieur le demande, et l'état
        // de ses mods ; 3. on met la nouvelle version en place.
        await carryOverPlayerData({ ...previous, instancePath: oldDir }, stagingDir)
        if (version.keepPlayerConfigs) {
          keptConfigs = await carryOverConfigs(oldDir, stagingDir, previousMarker ?? previous, marker.configFiles ?? {})
        }
        marker.disabledByDefault = await applyModStates(stagingDir, instance, version.disabledMods, {
          states: await readModStates(oldDir, previousInstance),
          disabledByDefault: previousMarker?.disabledByDefault
        })
        await finalize(targetDir, previousInstance)
      } catch (err) {
        // Par sécurité, on ne supprime rien : les mondes peuvent être dans l'un ou l'autre dossier.
        keepWorkDir = true
        if (!(await pathExists(targetDir))) await renameWithRetry(oldDir, targetDir).catch(() => {})
        throw new UserError(
          `La mise à jour a échoué (${describeError(err)}). Aucune donnée n'a été supprimée : ${workDir}`
        )
      }
    } else {
      targetDir = await uniqueInstanceDir(instancesDir, sanitizeFolderName(version.name, version.id))
      marker.disabledByDefault = await applyModStates(stagingDir, instance, version.disabledMods, null)
      await finalize(targetDir, null)
    }

    // Déjà ouvert, CurseForge peut ne pas afficher le profil : la fenêtre propose alors de le relancer
    // plutôt que de le mettre au premier plan tel quel.
    const curseForgeRunning = await isCurseForgeRunning(instancesDir)
    const curseForgeLaunched = settings.openCurseForgeAfterInstall && !curseForgeRunning ? await launchCurseForge() : false
    return {
      ok: true,
      updated: previous !== null,
      curseForgeLaunched,
      curseForgeRunning,
      keptConfigs,
      installed: installedFrom(marker, targetDir)
    }
  } catch (err) {
    if (signal.aborted) return { ok: false, cancelled: true, error: 'Installation annulée.' }
    return { ok: false, cancelled: false, error: describeError(err) }
  } finally {
    jobs.delete(version.id)
    void removeQuietly(zipPath)
    if (workDir && !keepWorkDir) {
      // On retire aussi le dossier de travail parent s'il est vide, pour ne rien laisser traîner.
      void removeQuietly(workDir).then(() => rmdir(dirname(workDir!)).catch(() => {}))
    }
  }
}

/** Télécharge l'image du modpack dans l'instance ; renvoie le nom du fichier créé. */
async function downloadCover(version: ModpackVersion, stagingDir: string): Promise<string | null> {
  if (!version.coverUrl) return null
  const ext = extname(new URL(version.coverUrl).pathname).toLowerCase() || '.png'
  const fileName = `${COVER_PREFIX}${ext}`
  try {
    await downloadFile({
      url: version.coverUrl,
      destination: join(stagingDir, fileName),
      signal: AbortSignal.timeout(20_000)
    })
    return fileName
  } catch {
    return null
  }
}

function describeError(err: unknown): string {
  if (err instanceof UserError) return err.message
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === 'ENOSPC') return "Espace disque insuffisant pour installer ce modpack."
  if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
    return 'Un fichier du modpack est utilisé par un autre programme. Ferme Minecraft et réessaie.'
  }
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return 'Connexion à GitHub impossible. Vérifie ta connexion internet.'
  }
  return err instanceof Error ? err.message : String(err)
}
