import { basename, dirname, join, resolve } from 'node:path'
import { APP_REPO } from '../../shared/config'
import { modpackTag, parseModpackTag } from '../../shared/releases'
import { repoSlug, repoUrl, sameRepo } from '../../shared/repo'
import type {
  ExcludedInZip,
  GitHubStatus,
  OrphanPack,
  PackSettings,
  PackView,
  PublishProgress,
  PublishResult,
  PublisherLibrary,
  ServerTestReport,
  StaticCheckReport,
  TrialResult,
  UpdateChannel,
  UpdatePlan,
  RangerOrders,
  RangerPlan,
  StudioOverview,
  StudioSettings,
  ZipAnalysis,
  ZipContents,
  ZipEntryPreview
} from '../../shared/studio'
import type { RepoRef, Settings } from '../../shared/types'
import type { Credential } from '../auth'
import { pathExists } from '../fsutil'
import { isGameRunningFrom, withCurseForgeClosed } from '../curseforge'
import type { CurseForgeClient } from '../curseforgeApi'
import type { Journal } from '../journal'
import { listGroups, listProfiles, readProfile } from '../profiles'
import { applyToTrial, promoteTrial, trialPathOf } from '../trialUpdates'
import { lastReport, saveReport, testServersDir } from '../gameTests/reports'
import { runServerTest } from '../gameTests/serverTest'
import { checkProfileFiles } from '../gameTests/staticChecks'
import { checkUpdates } from '../updates'
import type { OperationLock } from '../lock'
import { AnalysisCache, describeError, StudioError, type CachedAnalysis } from './analyze'
import { findExcludedInZip, stripExcludedFromZip, zipInstance } from './archive'
import { previewZipEntry, readZipContents } from './contents'
import { GitHubClient } from './githubApi'
import { buildLibrary } from './library'
import { applyPlan, computePlan, fetchRemoteState, highestRemoteNumber, type InternalPlan, type RemoteState } from './sync'
import {
  applyRanger,
  createPack,
  importFiles,
  loadPackMeta,
  nextVersionNumber,
  normalizePackSettings,
  planRanger,
  scanWorkspace,
  setCover,
  versionFileName,
  writePackFile,
  type LocalPack,
  type LocalWorkspace,
  type LocalZip
} from './workspace'

/** Analyse telle que la fenêtre l'affiche : la liste des mods reste dans le processus principal. */
function shownAnalysis(analysis: CachedAnalysis | null): ZipAnalysis | null {
  if (!analysis) return null
  const { mods: _mods, ...shown } = analysis
  return shown
}

/** Fichiers exclus trouvés dans les zips qui partiront à la prochaine publication, par chemin du zip. */
type ExcludedMap = Map<string, ExcludedInZip>

export function describeExcluded(excluded: ExcludedInZip): string {
  const shown = excluded.paths.slice(0, 4).join(', ') + (excluded.paths.length > 4 ? '…' : '')
  const files = `${excluded.files} fichier${excluded.files > 1 ? 's' : ''}`
  return `${files} exclu${excluded.files > 1 ? 's' : ''} dans les réglages du modpack (${shown})`
}

/** Prévient, dans le plan de publication, qu'un zip envoyé contient des fichiers exclus. */
function annotatePlan(plan: InternalPlan, excluded: ExcludedMap): void {
  for (const step of plan.steps) {
    if (step.kind === 'delete' || (step.kind === 'update' && !step.archive)) continue
    const found = excluded.get(step.desired.version.path)
    if (found) {
      step.action.warnings.push(
        `Ce zip contient ${describeExcluded(found)} : ils seront publiés. « Retirer du zip », sur la ligne de la version, les enlève.`
      )
    }
  }
}

export interface StudioServiceOptions {
  /** Dossier des modpacks (réglage propre au studio). */
  getWorkspaceDir(): string | null
  defaultWorkspaceDir: string
  /** Rôle et dépôt, relus à chaque fois dans les réglages de l'application. */
  getAppSettings(): Promise<Pick<Settings, 'role' | 'repo'>>
  getCredential(): Promise<Credential | null>
  /** URL de l'image d'un modpack pour la fenêtre du studio. */
  coverUrl?(pack: LocalPack): string | null
  onAnalyzing?(fileName: string | null): void
  /** Ce qui interdit de démarrer une opération d'écriture (« la mise à jour de l'application »…), sinon null. */
  blockedBy?(): string | null
  /** Met un fichier ou un dossier à la corbeille. Sans elle, les suppressions sont refusées. */
  trashItem?(path: string): Promise<void>
  /** Verrou partagé avec les autres processus (fenêtre, ligne de commande, serveur MCP). */
  lock?: OperationLock
  /** Journal des opérations d'écriture. */
  journal?: Journal
  /** Dossier Instances de CurseForge (profils du publieur). */
  getInstancesDir?(): Promise<string>
  /** Client de l'API CurseForge avec la clé du publieur (mises à jour des mods). */
  getCurseForgeClient?(): Promise<CurseForgeClient>
}

/** Ce qu'une opération a donné, pour le journal. */
interface Outcome {
  ok: boolean
  detail?: string
  error?: string
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

const publishOutcome = (result: PublishResult): Outcome =>
  result.ok ? { ok: true, detail: `${plural(result.done, 'changement')} sur GitHub` } : { ok: false, error: result.error }

function uncheckedGitHub(repo: RepoRef): GitHubStatus {
  return {
    state: 'unchecked',
    repo: repoSlug(repo),
    repoUrl: repoUrl(repo),
    login: null,
    tokenSource: null,
    repoPrivate: null,
    canPush: null,
    error: null,
    checkedAt: null
  }
}

/**
 * Point d'entrée commun du studio (fenêtre) et des scripts `modpacks:*` :
 * lecture du dossier, rangement, comparaison avec GitHub et publication.
 */
export class StudioService {
  private cache: { dir: string; cache: AnalysisCache } | null = null
  private scanning: Promise<LocalWorkspace | null> | null = null
  private remote: RemoteState | null = null
  /** Dépôt auquel correspond `remote` : un changement de dépôt invalide tout. */
  private remoteRepo: RepoRef = APP_REPO
  private github: GitHubStatus = uncheckedGitHub(APP_REPO)
  private busy: string | null = null
  /** Fichiers exclus déjà cherchés dans un zip, par zip (chemin, taille, date) et liste d'exclusions. */
  private excludedMemo = new Map<string, ExcludedInZip | null>()

  constructor(private readonly options: StudioServiceOptions) {}

  private get workspaceDir(): string | null {
    return this.options.getWorkspaceDir()
  }

  /**
   * Empêche deux opérations d'écriture en même temps (rangement pendant une publication…), dans ce processus et,
   * par le verrou partagé, avec les autres. L'opération est inscrite au journal.
   */
  private async exclusive<T>(label: string, run: () => Promise<T>, outcome?: (result: T) => Outcome): Promise<T> {
    const other = this.busy ?? this.options.blockedBy?.() ?? null
    if (other) throw new StudioError(`Patiente : ${other} est en cours.`)
    this.busy = label
    try {
      const release = await this.options.lock?.acquire(label)
      try {
        return await this.logged(label, run, outcome)
      } finally {
        await release?.()
      }
    } finally {
      this.busy = null
    }
  }

  /** Exécute une écriture et l'inscrit au journal, réussie ou non. */
  private async logged<T>(label: string, run: () => Promise<T>, outcome?: (result: T) => Outcome): Promise<T> {
    const started = Date.now()
    const journal = this.options.journal
    try {
      const result = await run()
      await journal?.append({ operation: label, durationMs: Date.now() - started, ...(outcome?.(result) ?? { ok: true }) })
      return result
    } catch (err) {
      await journal?.append({ operation: label, ok: false, error: describeError(err), durationMs: Date.now() - started })
      throw err
    }
  }

  /** Dernières opérations d'écriture, tous processus confondus, de la plus récente à la plus ancienne. */
  recentOperations(limit?: number) {
    return this.options.journal?.read(limit) ?? Promise.resolve([])
  }

  /** Opération d'écriture en cours dans un autre processus (« la publication (la ligne de commande) »), sinon null. */
  get otherProcessTask(): string | null {
    const info = this.options.lock?.currentSync()
    return info && info.pid !== process.pid ? `${info.operation} (${info.holder})` : null
  }

  /** Opération d'écriture en cours (« la publication »…), sinon null. */
  get currentTask(): string | null {
    return this.busy
  }

  private requireWorkspace(): string {
    const dir = this.workspaceDir
    if (!dir) throw new StudioError('Choisis d’abord le dossier de tes modpacks.')
    return dir
  }

  /** Les lectures du dossier s'enchaînent : deux analyses du même zip ne tournent jamais en parallèle. */
  async scan(): Promise<LocalWorkspace | null> {
    while (this.scanning) await this.scanning.catch(() => null)
    this.scanning = this.doScan()
    try {
      return await this.scanning
    } finally {
      this.scanning = null
    }
  }

  private async doScan(): Promise<LocalWorkspace | null> {
    const dir = this.workspaceDir
    if (!dir) return null
    if (this.cache?.dir !== dir) this.cache = { dir, cache: await AnalysisCache.load(dir) }
    return scanWorkspace(dir, this.cache.cache, this.options.onAnalyzing)
  }

  private async client(): Promise<{ client: GitHubClient; credential: Credential } | null> {
    const { repo } = await this.options.getAppSettings()
    const credential = await this.options.getCredential()
    return credential ? { client: new GitHubClient(credential.token, repo), credential } : null
  }

  /** Relit les releases GitHub (et vérifie la connexion). */
  async refreshRemote(): Promise<GitHubStatus> {
    const { repo } = await this.options.getAppSettings()
    const status = uncheckedGitHub(repo)
    status.checkedAt = new Date().toISOString()
    if (!sameRepo(repo, this.remoteRepo)) this.remote = null
    this.remoteRepo = repo
    const auth = await this.client()
    if (!auth) {
      this.remote = null
      this.github = { ...status, state: 'no-token' }
      return this.github
    }
    status.tokenSource = auth.credential.source
    try {
      const [repo, login] = await Promise.all([auth.client.getRepo(), auth.client.getLogin()])
      status.login = login
      status.repoPrivate = repo.private
      status.canPush = repo.permissions?.push ?? null
      this.remote = await fetchRemoteState(auth.client, this.remote)
      this.github = { ...status, state: 'ok' }
    } catch (err) {
      this.remote = null
      this.github = { ...status, state: 'error', error: describeError(err) }
    }
    return this.github
  }

  get githubStatus(): GitHubStatus {
    return this.github
  }

  async overview(options: { refreshRemote?: boolean } = {}): Promise<StudioOverview> {
    const app = await this.options.getAppSettings()
    // Dépôt changé dans l'application depuis la dernière lecture : on relit GitHub.
    const repoChanged = !sameRepo(app.repo, this.remoteRepo) && this.github.state !== 'unchecked'
    if ((options.refreshRemote || repoChanged) && !this.busy) await this.refreshRemote()
    const settings: StudioSettings = {
      workspaceDir: this.workspaceDir,
      defaultWorkspaceDir: this.options.defaultWorkspaceDir,
      role: app.role,
      repo: app.repo
    }
    const workspace = await this.scan()
    const plan = workspace && this.remote ? computePlan(workspace, this.remote, this.remoteRepo.owner) : null
    const excluded = workspace ? await this.findExcluded(workspace, plan) : new Map()
    if (plan) annotatePlan(plan, excluded)
    return {
      settings,
      workspaceExists: workspace?.exists ?? false,
      packs: workspace ? workspace.packs.map((pack) => this.packView(pack, plan, excluded)) : [],
      strayZips: workspace?.strayZips ?? [],
      orphanPacks: workspace && plan ? this.orphanPacks(workspace, plan) : [],
      toRange: workspace ? planRanger(workspace).total : 0,
      github: this.github,
      plan: plan?.view ?? null
    }
  }

  /**
   * Cherche les fichiers exclus dans les zips qui partiront à la prochaine publication : les zips à ranger, et les
   * versions dont le zip sera envoyé (nouvelles, ou zip remplacé). Sans GitHub, seulement les zips à ranger.
   */
  private async findExcluded(workspace: LocalWorkspace, plan: InternalPlan | null): Promise<ExcludedMap> {
    const uploaded = new Set<string>()
    for (const step of plan?.steps ?? []) {
      if (step.kind === 'create' || (step.kind === 'update' && step.archive)) uploaded.add(step.desired.version.path)
    }
    const found: ExcludedMap = new Map()
    const memo = new Map<string, ExcludedInZip | null>()
    for (const pack of workspace.packs) {
      if (!pack.meta.exclude.length) continue
      const zips: LocalZip[] = [...pack.pending, ...pack.versions.filter((v) => uploaded.has(v.path))]
      for (const zip of zips) {
        if (zip.error) continue
        const key = `${zip.path}|${zip.size}|${Math.floor(zip.mtimeMs)}|${pack.meta.exclude.join('\n').toLowerCase()}`
        let result = this.excludedMemo.get(key)
        if (result === undefined) result = await findExcludedInZip(zip.path, pack.meta.exclude)
        memo.set(key, result)
        if (result) found.set(zip.path, result)
      }
    }
    // Seuls les zips encore concernés restent en mémoire.
    this.excludedMemo = memo
    return found
  }

  private packView(pack: LocalPack, plan: InternalPlan | null, excluded: ExcludedMap): PackView {
    const blocked = pack.errors.length > 0
    const remoteOnly = plan
      ? plan.steps
          .filter((s) => s.kind === 'delete' && s.action.packId === pack.meta.id)
          .map((s) => {
            const release = s.kind === 'delete' ? (s.releases.find((r) => !r.draft) ?? s.releases[0]) : null
            return {
              tag: s.action.tag,
              version: parseModpackTag(s.action.tag)?.version ?? s.action.tag,
              url: release?.html_url ?? repoUrl(this.remoteRepo),
              draft: Boolean(release?.draft)
            }
          })
      : []
    return {
      folder: pack.folder,
      dir: pack.dir,
      id: pack.meta.id,
      name: pack.meta.name,
      description: pack.meta.description,
      coverUrl: this.options.coverUrl?.(pack) ?? null,
      profile: pack.meta.profile,
      settings: {
        exclude: pack.meta.exclude,
        disabledMods: pack.meta.disabledMods,
        keepPlayerConfigs: pack.meta.keepPlayerConfigs
      },
      versions: [...pack.versions].reverse().map((v) => {
        const status = plan?.statuses.get(modpackTag(pack.meta.id, String(v.number)))
        return {
          number: v.number,
          fileName: v.fileName,
          path: v.path,
          size: v.size,
          modifiedAt: new Date(v.mtimeMs).toISOString(),
          analysis: shownAnalysis(v.analysis),
          error: v.error,
          notes: pack.meta.notes[String(v.number)] ?? '',
          remote: blocked || v.error ? 'blocked' : (status?.status ?? 'unknown'),
          changes: status?.changes ?? [],
          excluded: excluded.get(v.path) ?? null
        }
      }),
      pending: pack.pending.map((f) => ({
        fileName: f.fileName,
        size: f.size,
        modifiedAt: new Date(f.mtimeMs).toISOString(),
        error: f.error,
        warnings: f.analysis?.warnings ?? [],
        excluded: excluded.get(f.path) ?? null
      })),
      remoteOnly,
      errors: pack.errors,
      nextVersion: nextVersionNumber(pack)
    }
  }

  private orphanPacks(workspace: LocalWorkspace, plan: InternalPlan): OrphanPack[] {
    const localIds = new Set(workspace.packs.map((p) => p.meta.id))
    const byId = new Map<string, OrphanPack>()
    for (const step of plan.steps) {
      if (step.kind !== 'delete' || localIds.has(step.action.packId)) continue
      const id = step.action.packId || step.action.tag
      const entry = byId.get(id) ?? { id, name: step.action.label.replace(/ v[^ ]+$/, ''), versions: [], tags: [] }
      entry.versions.push(parseModpackTag(step.action.tag)?.version ?? step.action.tag)
      entry.tags.push(step.action.tag)
      byId.set(id, entry)
    }
    return [...byId.values()]
  }

  // ---------------------------------------------------------------------------------------------
  // Rangement

  async rangerPlan(orders?: RangerOrders): Promise<RangerPlan> {
    const workspace = await this.scan()
    return workspace ? planRanger(workspace, orders) : { packs: [], total: 0 }
  }

  applyRanger(orders?: RangerOrders): Promise<number> {
    return this.exclusive('le rangement', async () => {
      this.requireWorkspace()
      const workspace = (await this.scan())!
      return applyRanger(workspace, planRanger(workspace, orders))
    }, (renamed) => ({ ok: true, detail: `${plural(renamed, 'zip')} renommé${renamed > 1 ? 's' : ''}` }))
  }

  // ---------------------------------------------------------------------------------------------
  // Publication

  /** Calcule le plan à partir d'un état de GitHub tout frais. */
  async freshPlan(): Promise<InternalPlan> {
    this.requireWorkspace()
    if ((await this.options.getAppSettings()).role !== 'publisher') {
      throw new StudioError('Passe en mode publieur (Paramètres → Utilisation) pour publier.')
    }
    const github = await this.refreshRemote()
    if (github.state !== 'ok' || !this.remote) {
      throw new StudioError(github.state === 'no-token' ? 'Pas de connexion GitHub : connecte-toi dans les paramètres.' : github.error!)
    }
    const workspace = await this.scan()
    if (!workspace?.exists) throw new StudioError('Le dossier des modpacks est introuvable.')
    const plan = computePlan(workspace, this.remote, this.remoteRepo.owner)
    annotatePlan(plan, await this.findExcluded(workspace, plan))
    return plan
  }

  publish(
    fingerprint: string,
    onProgress: (progress: PublishProgress) => void,
    signal: AbortSignal
  ): Promise<PublishResult> {
    return this.exclusive('la publication', async () => {
      let plan: InternalPlan
      try {
        plan = await this.freshPlan()
      } catch (err) {
        return { ok: false, cancelled: false, error: describeError(err), done: 0 }
      }
      if (plan.view.fingerprint !== fingerprint) {
        return {
          ok: false,
          cancelled: false,
          error: 'Le dossier ou GitHub a changé depuis l’aperçu : vérifie la nouvelle liste puis relance.',
          done: 0
        }
      }
      const auth = await this.client()
      if (!auth) return { ok: false, cancelled: false, error: 'Pas de connexion GitHub.', done: 0 }

      // L'identifiant et le dernier numéro sont figés dans pack.json dès la première publication.
      const packs = new Set(plan.steps.flatMap((s) => (s.kind === 'delete' ? [] : [s.desired.pack])))
      for (const pack of packs) {
        const highest = Math.max(pack.meta.lastVersion, pack.maxNumber, highestRemoteNumber(this.remote!, pack.meta.id))
        if (!pack.hasPackFile || highest > pack.meta.lastVersion) {
          await writePackFile(pack.dir, { ...pack.meta, lastVersion: highest }).catch(() => {})
        }
      }

      try {
        return await applyPlan(auth.client, plan, { onProgress, signal })
      } finally {
        await this.refreshRemote()
      }
    }, publishOutcome)
  }

  // ---------------------------------------------------------------------------------------------
  // Suppression

  /**
   * Supprime une version : son zip part à la corbeille, puis sa release (s'il y en a une) est retirée de GitHub
   * sans attendre la prochaine publication. Son numéro reste pris.
   */
  deleteVersion(folder: string, number: number): Promise<PublishResult> {
    return this.unpublish(`la suppression de la v${number} de ${folder}`, true, async (workspace) => {
      const pack = workspace.packs.find((p) => p.folder === folder)
      const version = pack?.versions.find((v) => v.number === number)
      if (!pack || !version) throw new StudioError(`La v${number} de ${folder} est introuvable : le dossier a changé.`)
      // Un modpack en erreur n'est jamais touché sur GitHub : sa release resterait en ligne.
      if (pack.errors.length) throw new StudioError(`Corrige d’abord ce modpack : ${pack.errors[0]}`)
      await this.trash(version.path)
      const highest = Math.max(pack.meta.lastVersion, pack.maxNumber, highestRemoteNumber(this.remote!, pack.meta.id))
      if (!pack.hasPackFile || highest > pack.meta.lastVersion) {
        await writePackFile(pack.dir, { ...pack.meta, lastVersion: highest }).catch(() => {})
      }
      return [modpackTag(pack.meta.id, String(number))]
    })
  }

  /** Supprime un modpack : son dossier part à la corbeille, puis toutes ses releases sont retirées de GitHub. */
  deletePack(folder: string): Promise<PublishResult> {
    return this.unpublish(`la suppression du modpack ${folder}`, true, async (workspace) => {
      const pack = workspace.packs.find((p) => p.folder === folder)
      if (!pack) throw new StudioError(`Le modpack ${folder} est introuvable : le dossier a changé.`)
      // Sans pack.json lisible, on ne sait pas sous quel identifiant le modpack a été publié.
      if (pack.packFileError) throw new StudioError(pack.packFileError)
      await this.trash(pack.dir)
      return this.remote!.releases.map((r) => r.tag_name).filter((tag) => parseModpackTag(tag)?.id === pack.meta.id)
    })
  }

  /** Retire tout de suite de GitHub des releases dont le zip n'est plus dans le dossier. */
  deleteReleases(tags: string[]): Promise<PublishResult> {
    return this.unpublish(`le retrait de ${tags.join(', ')}`, false, async () => tags)
  }

  private async trash(path: string): Promise<void> {
    if (!this.options.trashItem) throw new StudioError('Suppression impossible depuis ce programme.')
    try {
      await this.options.trashItem(path)
    } catch (err) {
      throw new StudioError(`Impossible de mettre ${basename(path)} à la corbeille : ${describeError(err)}`)
    }
  }

  /**
   * Prépare le dossier (`prepare` met à la corbeille ce qui doit disparaître et renvoie les tags concernés), puis
   * supprime de GitHub les releases de ces tags. Ce sont les suppressions qu'une publication ferait : le dossier
   * reste la référence. GitHub est vérifié avant de toucher au dossier.
   */
  private unpublish(
    label: string,
    changesFolder: boolean,
    prepare: (workspace: LocalWorkspace) => Promise<string[]>
  ): Promise<PublishResult> {
    return this.exclusive(label, async () => {
      let tags: string[]
      try {
        await this.freshPlan()
        tags = await prepare((await this.scan())!)
      } catch (err) {
        return { ok: false, cancelled: false, error: describeError(err), done: 0 }
      }
      const auth = await this.client()
      if (!auth) return { ok: false, cancelled: false, error: 'Pas de connexion GitHub.', done: 0 }
      try {
        const plan = computePlan((await this.scan())!, this.remote!, this.remoteRepo.owner)
        const steps = plan.steps.filter((s) => s.kind === 'delete' && tags.includes(s.action.tag))
        // Release demandée dont le zip est (de nouveau) dans le dossier : la publication la garderait, on n'y touche pas.
        const kept = tags.filter(
          (tag) => !steps.some((s) => s.action.tag === tag) && this.remote!.releases.some((r) => r.tag_name === tag)
        )
        if (kept.length && !changesFolder) {
          const versions = kept.map((tag) => `v${parseModpackTag(tag)?.version ?? tag}`).join(', ')
          const error = `${versions} : le zip est toujours dans le dossier, rien n’a été retiré de GitHub.`
          return { ok: false, cancelled: false, error, done: 0 }
        }
        const signal = new AbortController().signal
        const result = await applyPlan(auth.client, { ...plan, steps }, { onProgress: () => {}, signal })
        if (result.ok || !changesFolder) return result
        return { ...result, error: `${result.error} Le dossier est déjà à jour : GitHub le sera à la prochaine publication.` }
      } finally {
        await this.refreshRemote()
      }
    }, publishOutcome)
  }

  // ---------------------------------------------------------------------------------------------
  // Contenu des zips

  /** Chemin d'un zip du dossier d'un modpack : jamais en dehors du dossier des modpacks. */
  private async packZip(folder: string, fileName: string): Promise<string> {
    const root = resolve(this.requireWorkspace())
    const dir = resolve(root, folder)
    const file = resolve(dir, fileName)
    if (dirname(dir) !== root || dirname(file) !== dir || !/\.zip$/i.test(file)) {
      throw new StudioError('Ce zip n’est pas dans le dossier des modpacks.')
    }
    if (!(await pathExists(file))) throw new StudioError(`${fileName} n’est plus dans le dossier ${folder}.`)
    return file
  }

  async zipContents(folder: string, fileName: string): Promise<ZipContents> {
    return readZipContents(await this.packZip(folder, fileName))
  }

  async previewZipEntry(folder: string, fileName: string, path: string): Promise<ZipEntryPreview> {
    return previewZipEntry(await this.packZip(folder, fileName), path)
  }

  // ---------------------------------------------------------------------------------------------
  // Modpacks

  createPack(name: string): Promise<string> {
    return this.exclusive(
      `la création du modpack ${name.trim()}`,
      async () => {
        this.requireWorkspace()
        return createPack((await this.scan())!, name)
      },
      (folder) => ({ ok: true, detail: folder })
    )
  }

  /** Crée un modpack depuis un profil CurseForge, avec sa v1 : le profil devient sa source. */
  createPackFromProfile(
    name: string,
    profilePath: string,
    includeSaves: boolean,
    onProgress: (done: number, total: number) => void,
    signal: AbortSignal
  ): Promise<{ folder: string; fileName: string }> {
    return this.exclusive(
      `la création du modpack ${name.trim()} depuis CurseForge`,
      async () => {
        this.requireWorkspace()
        const profile = await this.profileAt(profilePath)
        const folder = await createPack((await this.scan())!, name)
        const fileName = await this.zipNextVersion(folder, profile, includeSaves, onProgress, signal)
        return { folder, fileName }
      },
      ({ folder, fileName }) => ({ ok: true, detail: `${folder}/${fileName}` })
    )
  }

  private async profileAt(path: string) {
    const profile = await readProfile(path)
    if (!profile) throw new StudioError(`${path} n’est pas un profil CurseForge (minecraftinstance.json absent ou illisible).`)
    return profile
  }

  /** Zippe le profil comme prochaine version du modpack, et le retient comme source du modpack. */
  private async zipNextVersion(
    folder: string,
    profile: { path: string; guid: string | null; name: string },
    includeSaves: boolean,
    onProgress: (done: number, total: number) => void,
    signal: AbortSignal
  ): Promise<string> {
    const workspace = (await this.scan())!
    const pack = workspace.packs.find((p) => p.folder === folder)
    if (!pack) throw new StudioError(`Le modpack ${folder} est introuvable.`)
    if (pack.packFileError) throw new StudioError(pack.packFileError)
    const number = nextVersionNumber(pack)
    const fileName = versionFileName(pack.folder, number)
    await zipInstance(profile.path, join(pack.dir, fileName), { includeSaves, exclude: pack.meta.exclude, onProgress, signal })
    await writePackFile(pack.dir, { ...pack.meta, lastVersion: number, profile: { guid: profile.guid, name: profile.name } })
    return fileName
  }

  /** Lie un modpack au profil CurseForge d'où viennent ses versions, ou retire le lien (null). */
  async linkProfile(folder: string, profilePath: string | null): Promise<void> {
    const profile = profilePath ? await this.profileAt(profilePath) : null
    const label = profile ? `le lien de ${folder} au profil ${profile.name}` : `le retrait du lien de ${folder}`
    await this.logged(label, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      await writePackFile(dir, { ...meta, profile: profile ? { guid: profile.guid, name: profile.name } : null })
    })
  }

  // ---------------------------------------------------------------------------------------------
  // Tests d'un profil avant publication

  /** Vérifie les fichiers du profil sans lancer le jeu (quelques secondes). */
  async checkProfile(profilePath: string): Promise<StaticCheckReport> {
    const report = await checkProfileFiles((await this.profileAt(profilePath)).path)
    await saveReport(report.profilePath, 'files', report)
    return report
  }

  /** Démarre un serveur dédié avec les mods du profil, jusqu'à « Done » (quelques minutes). */
  testServer(
    profilePath: string,
    onStep: (text: string) => void,
    options: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<ServerTestReport> {
    return this.exclusive(
      `le test du serveur de ${basename(profilePath)}`,
      async () => {
        const instancesDir = await this.options.getInstancesDir?.()
        if (!instancesDir) throw new StudioError('Dossier Instances de CurseForge introuvable.')
        const report = await runServerTest((await this.profileAt(profilePath)).path, {
          cacheDir: testServersDir(),
          instancesDir,
          onStep,
          signal: options.signal,
          timeoutMs: options.timeoutMs
        })
        await saveReport(report.profilePath, 'server', report)
        return report
      },
      (r) => (r.outcome === 'started' ? { ok: true, detail: r.message } : { ok: false, error: r.message })
    )
  }

  /** Derniers rapports de test d'un profil. */
  async lastTests(profilePath: string): Promise<{ files: StaticCheckReport | null; server: ServerTestReport | null }> {
    const [files, server] = await Promise.all([
      lastReport<StaticCheckReport>(profilePath, 'files'),
      lastReport<ServerTestReport>(profilePath, 'server')
    ])
    return { files, server }
  }

  // ---------------------------------------------------------------------------------------------
  // Mises à jour des mods d'un profil, par une copie d'essai

  private async curseForge(): Promise<CurseForgeClient> {
    if (!this.options.getCurseForgeClient) throw new StudioError('Mises à jour impossibles depuis ce programme.')
    return this.options.getCurseForgeClient()
  }

  /** Ce qu'une mise à jour du profil changerait (lecture seule). */
  async checkUpdates(profilePath: string, channel: UpdateChannel = 'release'): Promise<UpdatePlan> {
    const profile = await this.profileAt(profilePath)
    return checkUpdates(profile.path, await this.curseForge(), { channel })
  }

  /** Crée « <profil> (essai) » avec les mises à jour (toutes, ou celles des projets `only`). */
  applyUpdatesToTrial(
    profilePath: string,
    options: { channel?: UpdateChannel; only?: number[] },
    onProgress: (done: number, total: number, name: string) => void
  ): Promise<TrialResult> {
    return this.exclusive(
      `l’essai des mises à jour de ${basename(profilePath)}`,
      async () => {
        const client = await this.curseForge()
        const plan = await checkUpdates((await this.profileAt(profilePath)).path, client, { channel: options.channel })
        return applyToTrial(plan, { getFiles: (ids) => client.getFiles(ids), getMods: (ids) => client.getMods(ids), download: (f, d) => client.download(f, d) }, { only: options.only, onProgress })
      },
      (r) => ({
        ok: true,
        detail: `${r.applied.length} ${r.applied.length > 1 ? 'mises' : 'mise'} à jour dans ${basename(r.trialPath)}${r.skipped.length ? `, ${r.skipped.length} à faire dans CurseForge` : ''}`
      })
    )
  }

  /**
   * Reporte l'essai validé dans le profil d'origine, CurseForge fermé le temps de l'écriture (puis rouvert), et met
   * l'essai à la corbeille. Refusé si Minecraft tourne depuis l'un des deux.
   */
  promoteTrial(profilePath: string): Promise<string[]> {
    return this.exclusive(
      `le report de l’essai dans ${basename(profilePath)}`,
      async () => {
        const trialPath = trialPathOf(profilePath)
        if ((await isGameRunningFrom(profilePath)) || (await isGameRunningFrom(trialPath))) {
          throw new StudioError('Minecraft tourne depuis ce profil ou son essai : ferme le jeu, puis recommence.')
        }
        const instancesDir = await this.options.getInstancesDir?.()
        if (!instancesDir) throw new StudioError('Dossier Instances de CurseForge introuvable.')
        return withCurseForgeClosed(instancesDir, async () => {
          const changed = await promoteTrial(profilePath)
          await this.trash(trialPath)
          return changed
        })
      },
      (changed) => ({ ok: true, detail: `${plural(changed.length, 'projet')} reporté${changed.length > 1 ? 's' : ''}` })
    )
  }

  /** Abandonne l'essai d'un profil (corbeille). */
  discardTrial(profilePath: string): Promise<void> {
    return this.exclusive(`l’abandon de l’essai de ${basename(profilePath)}`, async () => {
      const trialPath = trialPathOf(profilePath)
      if (!(await pathExists(trialPath))) throw new StudioError(`Pas d’essai pour ${basename(profilePath)}.`)
      if (await isGameRunningFrom(trialPath)) throw new StudioError('Minecraft tourne depuis l’essai : ferme le jeu, puis recommence.')
      await this.trash(trialPath)
    })
  }

  /** Les profils CurseForge du publieur, rangés comme dans CurseForge, face à ses modpacks. */
  async library(): Promise<PublisherLibrary> {
    const overview = await this.overview()
    let instancesDir: string | null = null
    try {
      instancesDir = (await this.options.getInstancesDir?.()) ?? null
    } catch (err) {
      return { ...buildLibrary(overview.packs, [], [], null), error: describeError(err) }
    }
    if (!instancesDir) return buildLibrary(overview.packs, [], [], null)
    const [profiles, groups] = await Promise.all([listProfiles(instancesDir), listGroups()])
    return buildLibrary(overview.packs, profiles, groups, instancesDir)
  }

  async updatePackInfo(folder: string, info: { name: string; description: string }): Promise<void> {
    const name = info.name.trim().replace(/\s+/g, ' ')
    if (!name) throw new StudioError('Le nom ne peut pas être vide.')
    await this.logged(`la fiche de ${folder}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      await writePackFile(dir, { ...meta, name, description: info.description.trim() })
    })
  }

  /** Enregistre les réglages des versions d'un modpack (fichiers exclus, mods désactivés, configurations). */
  async updatePackSettings(folder: string, settings: PackSettings): Promise<void> {
    await this.logged(`les réglages des versions de ${folder}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      await writePackFile(dir, { ...meta, ...normalizePackSettings(settings) })
    })
  }

  async setNotes(folder: string, version: number, notes: string): Promise<void> {
    await this.logged(`les notes de la v${version} de ${folder}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      const text = notes.replace(/\r\n/g, '\n').trim()
      await writePackFile(dir, { ...meta, notes: { ...meta.notes, [String(version)]: text } })
    })
  }

  async setCover(folder: string, source: string | null): Promise<void> {
    await this.logged(`l’image de ${folder}`, async () => {
      const { dir } = await loadPackMeta(this.requireWorkspace(), folder)
      await setCover(dir, source)
    })
  }

  async importFiles(folder: string, paths: string[]) {
    return this.exclusive(`la copie de fichiers dans ${folder}`, async () => {
      const { dir } = await loadPackMeta(this.requireWorkspace(), folder)
      return importFiles(dir, paths)
    })
  }

  /** Zippe une instance CurseForge directement comme prochaine version du modpack. */
  zipInstance(
    folder: string,
    instancePath: string,
    includeSaves: boolean,
    onProgress: (done: number, total: number) => void,
    signal: AbortSignal
  ): Promise<string> {
    return this.exclusive(
      `la création d’une version de ${folder}`,
      async () => {
        this.requireWorkspace()
        const profile = await this.profileAt(instancePath)
        return this.zipNextVersion(folder, profile, includeSaves, onProgress, signal)
      },
      (fileName) => ({ ok: true, detail: fileName })
    )
  }

  /** Retire d'un zip du modpack (zip à ranger ou version) les fichiers exclus dans ses réglages. */
  stripExcluded(
    folder: string,
    fileName: string,
    onProgress: (done: number, total: number) => void,
    signal: AbortSignal
  ): Promise<number> {
    return this.exclusive(
      `le nettoyage de ${fileName}`,
      async () => {
        const file = await this.packZip(folder, fileName)
        const { meta } = await loadPackMeta(this.requireWorkspace(), folder)
        if (!meta.exclude.length) throw new StudioError('Aucun fichier n’est exclu dans les réglages de ce modpack.')
        const removed = await stripExcludedFromZip(file, meta.exclude, { onProgress, signal })
        if (removed === 0) throw new StudioError('Ce zip ne contient aucun fichier exclu.')
        return removed
      },
      (removed) => ({ ok: true, detail: `${plural(removed, 'fichier')} retiré${removed > 1 ? 's' : ''}` })
    )
  }
}
