import { copyFile, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { APP_REPO } from '../../shared/config'
import { CONTENT_KINDS, contentTag, parseContentTag } from '../../shared/content'
import { copyVersions, extractModIcon, sourceVersions, type SourceVersion } from './mods'
import { extractPackIcon, packMarker, readPackZip } from './packFiles'
import { analyzePluginJar } from './pluginFiles'

/** Lecteur des jars d'un mod ou d'un plugin. */
const jarAnalyzer = (kind: string) => (kind === 'plugin' ? analyzePluginJar : undefined)
import { modrinthVersionViews, publishToModrinth, resolveModrinthProject } from './modrinthPublish'
import type { ModrinthClient } from '../modrinth'
import type { HangarClient } from '../hangar'
import { compareVersions, modpackTag } from '../../shared/releases'
import { repoSlug, repoUrl, sameRepo } from '../../shared/repo'
import {
  DEFAULT_PACK_UPDATES,
  type ExcludedInZip,
  type GitHubStatus,
  type OrphanPack,
  type PackSettings,
  type PackUpdates,
  type PackView,
  type PlayerTestReport,
  type ProfileTestReports,
  testVerdict,
  type VersionTests,
  type PublishProgress,
  type PublishResult,
  type PublisherLibrary,
  type ServerTestReport,
  type StaticCheckReport,
  type TrialResult,
  type UpdateChannel,
  type UpdatePlan,
  type RangerOrders,
  type RangerPlan,
  type StudioOverview,
  type StudioSettings,
  type ZipAnalysis,
  type ZipContents,
  type ZipEntryPreview,
  type ModrinthVersionView,
  type HangarVersionView
} from '../../shared/studio'
import type { RepoRef, Settings } from '../../shared/types'
import type { Credential } from '../auth'
import { pathExists } from '../fsutil'
import { forgetTrial } from '../maintenance/state'
import { isGameRunningFrom, withCurseForgeClosed } from '../curseforge'
import type { CurseForgeClient } from '../curseforgeApi'
import type { CurseForgeUploader } from '../curseforgeUpload'
import { contentDisplayName, exportToFile, inspectProject, projectVersions, publishModVersion, publishVersion, resolveProject } from './curseforgePublish'
import type { Journal } from '../journal'
import { listGroups, listProfiles, modsOf, readProfile } from '../profiles'
import { applyToTrial, promoteTrial, trialPathOf } from '../trialUpdates'
import { runPlayerTest } from '../gameTests/playerTest'
import { lastReport, reportsBySignature, reportsForSignature, saveReport, testClientsDir, testServersDir } from '../gameTests/reports'
import { runServerTest } from '../gameTests/serverTest'
import { checkProfileFiles } from '../gameTests/staticChecks'
import { checkUpdates } from '../updates'
import type { OperationLock } from '../lock'
import { AnalysisCache, describeError, MAX_ASSET_SIZE, StudioError, type CachedAnalysis } from './analyze'
import { findExcludedInZip, stripExcludedFromZip, zipFolder, zipInstance } from './archive'
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
  normalizeGroup,
  normalizeMinecraftVersions,
  normalizePackSettings,
  normalizePackUpdates,
  planRanger,
  requireModpack,
  scanWorkspace,
  setCover,
  versionFileName,
  writePackFile,
  type LocalPack,
  type LocalVersion,
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
function annotatePlan(plan: InternalPlan, excluded: ExcludedMap, tests: TestsMap): void {
  for (const step of plan.steps) {
    if (step.kind === 'delete' || step.kind === 'create-content' || step.kind === 'update-content' || (step.kind === 'update' && !step.archive)) continue
    const found = excluded.get(step.desired.version.path)
    if (found) {
      step.action.warnings.push(
        `Ce zip contient ${describeExcluded(found)} : ils seront publiés. « Retirer du zip », sur la ligne de la version, les enlève.`
      )
    }
    if (step.kind !== 'create') continue
    const verdict = versionTestsOf(step.desired.version, tests)
    if (!verdict) step.action.warnings.push(TESTS_HINT.never)
    else if (verdict.state === 'failed') step.action.warnings.push(`Ses derniers tests ont échoué : ${verdict.summary}`)
    else if (verdict.state === 'partial') step.action.warnings.push(`${verdict.summary} ${TESTS_HINT.partial}`)
  }
}

type TestsMap = Map<string, ProfileTestReports>

const TESTS_HINT = {
  never: 'Cette version n’a jamais été testée : « Tout tester », dans le détail de son profil, la teste avec de vrais joueurs.',
  partial: '« Tout tester », dans le détail de son profil, la teste avec de vrais joueurs.'
}

/** Bilan des derniers tests faits sur les mods d'une version (sur son profil, ou sur l'essai dont elle vient). */
function versionTestsOf(version: LocalVersion, tests: TestsMap): VersionTests | null {
  const signature = version.analysis?.modsSignature
  const reports = signature ? tests.get(signature) : null
  return reports ? testVerdict(reports) : null
}

/** Réglages d'une partie de test (testPlayers, testAll). */
export interface PlayerTestRequest {
  signal?: AbortSignal
  /** Nombre de joueurs (1 à 4, 2 par défaut). */
  players?: number
  /** Temps de jeu une fois tout le monde connecté. */
  playMs?: number
}

export interface StudioServiceOptions {
  /** Dossier des contenus (réglage propre au studio). */
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
  /** Mise en ligne sur CurseForge avec le jeton d'auteur du publieur. */
  getCurseForgeUploader?(): Promise<CurseForgeUploader>
  /** Client Modrinth avec le jeton du publieur (publication des mods). */
  getModrinthClient?(): Promise<ModrinthClient>
  /** Client Hangar avec la clé du publieur (publication des plugins). */
  getHangarClient?(): Promise<HangarClient>
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
    if (!dir) throw new StudioError('Choisis d’abord le dossier de tes contenus.')
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
    const tests: TestsMap = workspace ? await reportsBySignature() : new Map()
    if (plan) annotatePlan(plan, excluded, tests)
    return {
      settings,
      workspaceExists: workspace?.exists ?? false,
      packs: workspace ? workspace.packs.map((pack) => this.packView(pack, plan, excluded, tests)) : [],
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

  private packView(pack: LocalPack, plan: InternalPlan | null, excluded: ExcludedMap, tests: TestsMap): PackView {
    const blocked = pack.errors.length > 0
    const remoteOnly = plan
      ? plan.steps
          .filter((s) => s.kind === 'delete' && s.action.packId === pack.meta.id && parseContentTag(s.action.tag)?.kind === pack.meta.type)
          .map((s) => {
            const release = s.kind === 'delete' ? (s.releases.find((r) => !r.draft) ?? s.releases[0]) : null
            return {
              tag: s.action.tag,
              version: parseContentTag(s.action.tag)?.version ?? s.action.tag,
              url: release?.html_url ?? repoUrl(this.remoteRepo),
              draft: Boolean(release?.draft)
            }
          })
      : []
    return {
      folder: pack.folder,
      dir: pack.dir,
      id: pack.meta.id,
      type: pack.meta.type,
      name: pack.meta.name,
      description: pack.meta.description,
      coverUrl: this.options.coverUrl?.(pack) ?? null,
      profile: pack.meta.profile,
      github: pack.meta.github,
      curseforge: pack.meta.curseforge,
      modrinth: pack.meta.modrinth,
      hangar: pack.meta.hangar,
      updates: pack.meta.updates,
      source: pack.meta.source,
      minecraftVersions: pack.meta.minecraftVersions,
      group: pack.meta.group,
      contentVersions: [...pack.contentVersions].reverse().map((v) => {
        const status = plan?.statuses.get(contentTag(pack.meta.type, pack.meta.id, v.version))
        return {
          version: v.version,
          files: v.files.map((f) => ({
            fileName: f.fileName,
            path: f.path,
            size: f.size,
            loaders: f.analysis.loaders,
            minecraftVersions: f.analysis.minecraftVersions,
            side: f.analysis.side,
            dependencies: f.analysis.dependencies
          })),
          modifiedAt: new Date(Math.max(...v.files.map((f) => f.mtimeMs))).toISOString(),
          notes: pack.meta.notes[v.version] ?? '',
          remote: blocked || !pack.meta.github ? 'blocked' : (status?.status ?? 'unknown'),
          changes: status?.changes ?? [],
          curseforgeFileId: pack.meta.curseforge?.files[v.version] ?? null,
          modrinthVersionId: pack.meta.modrinth?.versions[v.version] ?? null
        }
      }),
      badJars: pack.badJars.map((j) => ({ fileName: j.fileName, error: j.error ?? 'Illisible.' })),
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
          excluded: excluded.get(v.path) ?? null,
          tests: versionTestsOf(v, tests)
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
      const entry = byId.get(id) ?? { id, name: step.action.label.replace(/ v?[^ ]+$/, ''), versions: [], tags: [] }
      entry.versions.push(parseContentTag(step.action.tag)?.version ?? step.action.tag)
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
    if (!workspace?.exists) throw new StudioError('Le dossier des contenus est introuvable.')
    const plan = computePlan(workspace, this.remote, this.remoteRepo.owner)
    annotatePlan(plan, await this.findExcluded(workspace, plan), await reportsBySignature())
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

  /**
   * Publie sur GitHub les nouvelles versions et changements d'un seul modpack, sans toucher aux autres ni rien retirer
   * (publication d'une mise à jour automatique). Rien à publier : réussi, sans changement.
   */
  publishPack(folder: string, onProgress: (progress: PublishProgress) => void, signal: AbortSignal): Promise<PublishResult> {
    return this.exclusive(`la publication de ${folder}`, async () => {
      let plan: InternalPlan
      try {
        plan = await this.freshPlan()
      } catch (err) {
        return { ok: false, cancelled: false, error: describeError(err), done: 0 }
      }
      const pack = (await this.scan())!.packs.find((p) => p.folder === folder)
      if (!pack) return { ok: false, cancelled: false, error: `Le modpack ${folder} est introuvable.`, done: 0 }
      if (pack.errors.length) return { ok: false, cancelled: false, error: pack.errors[0], done: 0 }
      const steps = plan.steps.filter((s) => s.kind !== 'delete' && s.action.packId === pack.meta.id)
      const auth = await this.client()
      if (!auth) return { ok: false, cancelled: false, error: 'Pas de connexion GitHub.', done: 0 }
      try {
        return await applyPlan(auth.client, { ...plan, steps }, { onProgress, signal })
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

  /** Supprime une version d'un mod : ses jars partent à la corbeille, puis sa release est retirée de GitHub. */
  deleteModVersion(folder: string, version: string): Promise<PublishResult> {
    return this.unpublish(`la suppression de la version ${version} de ${folder}`, true, async (workspace) => {
      const pack = workspace.packs.find((p) => p.folder === folder)
      const local = pack?.contentVersions.find((v) => v.version === version)
      if (!pack || !local) throw new StudioError(`La version ${version} de ${folder} est introuvable : le dossier a changé.`)
      if (pack.errors.length) throw new StudioError(`Corrige d’abord ce mod : ${pack.errors[0]}`)
      for (const file of local.files) await this.trash(file.path)
      return [contentTag(pack.meta.type, pack.meta.id, version)]
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
      return this.remote!.releases
        .map((r) => r.tag_name)
        .filter((tag) => {
          const parsed = parseContentTag(tag)
          return parsed?.kind === pack.meta.type && parsed.id === pack.meta.id
        })
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
          const versions = kept.map((tag) => `v${parseContentTag(tag)?.version ?? tag}`).join(', ')
          const error = `${versions} : le fichier est toujours dans le dossier, rien n’a été retiré de GitHub.`
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

  /** Chemin d'un zip du dossier d'un modpack : jamais en dehors du dossier des contenus. */
  private async packZip(folder: string, fileName: string): Promise<string> {
    const root = resolve(this.requireWorkspace())
    const dir = resolve(root, folder)
    const file = resolve(dir, fileName)
    if (dirname(dir) !== root || dirname(file) !== dir || !/\.zip$/i.test(file)) {
      throw new StudioError('Ce zip n’est pas dans le dossier des contenus.')
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

  // ---------------------------------------------------------------------------------------------
  // Mods

  /**
   * Crée le dossier d'un mod à partir du dossier où son projet dépose ses builds, qui lui reste lié : nom, identifiant
   * et description viennent du jar le plus récent, dont la version est importée (ou celles demandées).
   */
  createModFromSource(sourceDir: string, versions?: string[], kind: 'mod' | 'plugin' = 'mod'): Promise<string> {
    const label = CONTENT_KINDS[kind].label
    return this.exclusive(
      `la création d’un ${label} depuis ${sourceDir}`,
      async () => {
        this.requireWorkspace()
        const available = await sourceVersions(sourceDir, null, jarAnalyzer(kind))
        if (!available.length) throw new StudioError(`Aucun jar de ${label} dans ${sourceDir}.`)
        const latest = available[0].files[0].analysis
        const others = available.filter((v) => v.files.some((f) => f.analysis.contentId !== latest.contentId))
        if (others.length) {
          const ids = [...new Set(available.flatMap((v) => v.files.map((f) => f.analysis.contentId)))].join(', ')
          throw new StudioError(`Ce dossier contient plusieurs ${CONTENT_KINDS[kind].plural} (${ids}) : choisis le dossier d’un seul ${label}.`)
        }
        const chosen = versions?.length ? available.filter((v) => versions.includes(v.version)) : [available[0]]
        if (!chosen.length) throw new StudioError(`Aucune de ces versions dans ${sourceDir} : ${versions!.join(', ')}.`)
        const id = latest.contentId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
        const folder = await createPack((await this.scan())!, latest.name ?? latest.contentId, { type: kind, id, description: latest.description ?? '', source: sourceDir })
        await copyVersions(join(this.requireWorkspace(), folder), chosen)
        // L'icône du mod devient son image (sans elle, une vignette est dessinée d'après son nom).
        if (kind === 'mod') await extractModIcon(available[0].files[0].path, join(this.requireWorkspace(), folder)).catch(() => false)
        return folder
      },
      (folder) => ({ ok: true, detail: folder })
    )
  }

  /** Versions du dossier lié d'un mod qui ne sont pas encore dans le Studio, de la plus récente à la plus ancienne. */
  async availableModVersions(folder: string): Promise<SourceVersion[]> {
    const pack = (await this.scan())?.packs.find((p) => p.folder === folder)
    if (!pack) throw new StudioError(`Le mod ${folder} est introuvable.`)
    if (pack.meta.type !== 'mod' && pack.meta.type !== 'plugin') throw new StudioError(`${folder} n’est ni un mod ni un plugin.`)
    if (!pack.meta.source) throw new StudioError(`${pack.meta.name} n’est lié à aucun dossier : lie-le au dossier où son projet dépose ses jars.`)
    const present = new Set(pack.contentVersions.map((v) => v.version))
    const modId = pack.contentVersions[0]?.files[0]?.analysis.contentId ?? null
    return (await sourceVersions(pack.meta.source, modId, jarAnalyzer(pack.meta.type))).filter((v) => !present.has(v.version))
  }

  /** Copie dans le dossier du mod des versions de son dossier lié (par défaut la plus récente qui manque). */
  importModVersions(folder: string, versions?: string[]): Promise<string[]> {
    return this.exclusive(
      `l’import de versions dans ${folder}`,
      async () => {
        const available = await this.availableModVersions(folder)
        const chosen = versions?.length ? available.filter((v) => versions.includes(v.version)) : available.slice(0, 1)
        if (!chosen.length) throw new StudioError(versions?.length ? `Ces versions ne sont pas à importer : ${versions.join(', ')}.` : 'Aucune nouvelle version dans le dossier lié.')
        await copyVersions(join(this.requireWorkspace(), folder), chosen)
        return chosen.map((v) => v.version)
      },
      (imported) => ({ ok: true, detail: imported.join(', ') })
    )
  }

  /** Lie un mod au dossier où son projet dépose ses jars, ou retire le lien (null). */
  async linkModSource(folder: string, sourceDir: string | null): Promise<void> {
    if (sourceDir && !(await pathExists(sourceDir))) throw new StudioError(`Le dossier ${sourceDir} est introuvable.`)
    await this.logged(sourceDir ? `le lien de ${folder} au dossier ${sourceDir}` : `le retrait du dossier lié de ${folder}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      if (meta.type === 'modpack') throw new StudioError(`${folder} est un modpack : sa source est un profil CurseForge.`)
      await writePackFile(dir, { ...meta, source: sourceDir })
    })
  }

  /**
   * Crée un pack de ressources ou un shader : depuis le dossier du pack en cours de création (il reste lié, et sa v1
   * en est zippée), ou depuis un zip (copié comme v1). Nom d'après le dossier ou le zip ; description et icône
   * d'après pack.mcmeta et pack.png.
   */
  createPackContent(kind: 'resourcepack' | 'shader', source: string): Promise<string> {
    return this.exclusive(
      `la création d’un ${CONTENT_KINDS[kind].label} depuis ${source}`,
      async () => {
        const root = this.requireWorkspace()
        const info = await stat(source).catch(() => null)
        if (!info) throw new StudioError(`${source} est introuvable.`)
        const zipped = info.isFile()
        if (zipped && !/\.zip$/i.test(source)) throw new StudioError('Choisis le dossier du pack, ou son zip.')
        const name = basename(source).replace(/\.zip$/i, '').replace(/[_]+/g, ' ').trim()
        const folder = await createPack((await this.scan())!, name, { type: kind, source: zipped ? null : source })
        const dir = join(root, folder)
        const target = join(dir, versionFileName(folder, 1))
        try {
          if (zipped) await copyFile(source, target)
          else await zipFolder(source, target, packMarker(kind))
          const read = await readPackZip(target, kind)
          await writePackFile(dir, { ...(await loadPackMeta(root, folder)).meta, lastVersion: 1, description: read.description ?? '' })
          if (kind === 'resourcepack') await extractPackIcon(target, dir).catch(() => false)
        } catch (err) {
          // Pas un pack : le dossier tout juste créé ne doit pas rester.
          await rm(dir, { recursive: true, force: true })
          throw err
        }
        return folder
      },
      (folder) => ({ ok: true, detail: folder })
    )
  }

  /** Zippe le dossier lié d'un pack de ressources ou d'un shader comme sa version suivante. */
  zipContentVersion(folder: string): Promise<number> {
    return this.exclusive(
      `la création de la version suivante de ${folder}`,
      async () => {
        const pack = (await this.scan())?.packs.find((p) => p.folder === folder)
        if (!pack) throw new StudioError(`${folder} est introuvable.`)
        if (pack.meta.type !== 'resourcepack' && pack.meta.type !== 'shader') throw new StudioError(`${folder} n’est ni un pack de ressources ni un shader.`)
        if (!pack.meta.source) throw new StudioError(`${pack.meta.name} n’est lié à aucun dossier : lie-le au dossier du pack en cours de création.`)
        if (pack.packFileError) throw new StudioError(pack.packFileError)
        const number = nextVersionNumber(pack)
        await zipFolder(pack.meta.source, join(pack.dir, versionFileName(pack.folder, number)), packMarker(pack.meta.type))
        await writePackFile(pack.dir, { ...pack.meta, lastVersion: number })
        return number
      },
      (number) => ({ ok: true, detail: `v${number}` })
    )
  }

  /** Versions de Minecraft d'un pack de ressources ou d'un shader, à la place de celles du zip ([] : celles du zip). */
  async setMinecraftVersions(folder: string, versions: string[]): Promise<string[]> {
    const normalized = normalizeMinecraftVersions(versions)
    await this.logged(`les versions de Minecraft de ${folder}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      if (meta.type === 'modpack' || meta.type === 'mod') throw new StudioError(`${folder} déclare ses versions de Minecraft dans ses fichiers.`)
      await writePackFile(dir, { ...meta, minecraftVersions: normalized })
    })
    return normalized
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
    requireModpack(pack.meta, folder)
    const number = nextVersionNumber(pack)
    const fileName = versionFileName(pack.folder, number)
    await zipInstance(profile.path, join(pack.dir, fileName), { includeSaves, exclude: pack.meta.exclude, maxSize: pack.meta.github ? MAX_ASSET_SIZE : undefined, onProgress, signal })
    await writePackFile(pack.dir, { ...pack.meta, lastVersion: number, profile: { guid: profile.guid, name: profile.name } })
    return fileName
  }

  /** Lie un modpack au profil CurseForge d'où viennent ses versions, ou retire le lien (null). */
  async linkProfile(folder: string, profilePath: string | null): Promise<void> {
    const profile = profilePath ? await this.profileAt(profilePath) : null
    const label = profile ? `le lien de ${folder} au profil ${profile.name}` : `le retrait du lien de ${folder}`
    await this.logged(label, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      requireModpack(meta, folder)
      await writePackFile(dir, { ...meta, profile: profile ? { guid: profile.guid, name: profile.name } : null })
    })
  }

  // ---------------------------------------------------------------------------------------------
  // Publication sur CurseForge

  /**
   * Lie un modpack à son projet CurseForge (numéro, slug ou page). Pour un projet qui a déjà des versions, la
   * numérotation continue après la plus haute (« _V27 ») et les fichiers joints sont ceux de la dernière.
   */
  async linkCurseForge(folder: string, ref: string): Promise<{ projectId: number; name: string; highestVersion: number; overrides: string[] }> {
    const client = await this.curseForge()
    const { meta: current } = await loadPackMeta(this.requireWorkspace(), folder)
    if (current.type === 'plugin') throw new StudioError(`Les ${CONTENT_KINDS[current.type].plural} ne se publient pas encore sur CurseForge.`)
    const project = await resolveProject(client, ref, current.type)
    // Un mod n'a ni numérotation « _V<N> » ni fichiers joints : seul le lien compte.
    const { highestVersion, overrides } = current.type === 'modpack' ? await inspectProject(client, project.id) : { highestVersion: 0, overrides: [] }
    await this.logged(`le lien de ${folder} au projet CurseForge ${project.name}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      if (meta.type !== current.type) throw new StudioError(`${folder} a changé de type entre-temps.`)
      const files = meta.curseforge?.projectId === project.id ? meta.curseforge.files : {}
      await writePackFile(dir, {
        ...meta,
        lastVersion: Math.max(meta.lastVersion, highestVersion),
        curseforge: { projectId: project.id, url: project.url, overrides, files }
      })
    })
    return { projectId: project.id, name: project.name, highestVersion, overrides }
  }

  /** Réglages de publication : fichiers joints à l'export CurseForge, publication sur GitHub, ou retrait d'un lien. */
  async updatePublishTargets(
    folder: string,
    changes: { overrides?: string[]; github?: boolean; unlinkCurseForge?: boolean; unlinkModrinth?: boolean; unlinkHangar?: boolean }
  ): Promise<void> {
    await this.logged(`les cibles de publication de ${folder}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      if (changes.overrides && !meta.curseforge) throw new StudioError('Lie d’abord ce modpack à son projet CurseForge.')
      const curseforge = changes.unlinkCurseForge ? null : meta.curseforge && { ...meta.curseforge, overrides: changes.overrides ?? meta.curseforge.overrides }
      const modrinth = changes.unlinkModrinth ? null : meta.modrinth
      const hangar = changes.unlinkHangar ? null : meta.hangar
      const github = changes.github ?? meta.github
      if (!github && !curseforge && !modrinth && !hangar) {
        throw new StudioError(`Un ${CONTENT_KINDS[meta.type].label} doit être publié quelque part : sur GitHub, sur CurseForge${meta.type === 'mod' ? ', sur Modrinth' : ''}, ou plusieurs.`)
      }
      await writePackFile(dir, { ...meta, github, curseforge, modrinth, hangar })
    })
  }

  // ---------------------------------------------------------------------------------------------
  // Publication sur Hangar (plugins)

  private async hangar(): Promise<HangarClient> {
    if (!this.options.getHangarClient) throw new StudioError('Publication sur Hangar impossible depuis ce programme.')
    return this.options.getHangarClient()
  }

  /** Lie un plugin à son projet Hangar (adresse hangar.papermc.io/<auteur>/<projet>, ou slug). */
  async linkHangar(folder: string, ref: string): Promise<{ slug: string; owner: string; url: string }> {
    const { meta: current } = await loadPackMeta(this.requireWorkspace(), folder)
    if (current.type !== 'plugin') throw new StudioError(`Seuls les plugins se publient sur Hangar : ${folder} n’en est pas un.`)
    const slug = /hangar\.papermc\.io\/[^/]+\/([^/?#]+)/i.exec(ref.trim())?.[1] ?? ref.trim()
    if (!slug) throw new StudioError('Donne l’adresse du projet Hangar, ou son nom.')
    const project = await (await this.hangar()).getProject(slug)
    if (!project) throw new StudioError(`Aucun projet Hangar « ${slug} ».`)
    const link = { slug: project.namespace.slug, owner: project.namespace.owner, url: `https://hangar.papermc.io/${project.namespace.owner}/${project.namespace.slug}` }
    await this.logged(`le lien de ${folder} au projet Hangar ${link.slug}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      const versions = meta.hangar?.slug === link.slug ? meta.hangar.versions : []
      await writePackFile(dir, { ...meta, hangar: { ...link, versions } })
    })
    return link
  }

  /** Met en ligne une version d'un plugin sur Hangar, pour Paper et les versions de Minecraft du plugin. */
  publishToHangar(folder: string, version: string, releaseType: 'release' | 'beta' | 'alpha', onStep: (text: string) => void): Promise<{ version: string }> {
    return this.exclusive(
      `la publication de la version ${version} de ${folder} sur Hangar`,
      async () => {
        this.requireWorkspace()
        const pack = (await this.scan())!.packs.find((p) => p.folder === folder)
        if (!pack) throw new StudioError(`Le plugin ${folder} est introuvable.`)
        if (pack.meta.type !== 'plugin') throw new StudioError(`${folder} n’est pas un plugin.`)
        if (pack.errors.length) throw new StudioError(`Corrige d’abord ${pack.meta.name} : ${pack.errors[0]}`)
        const hangar = pack.meta.hangar
        if (!hangar) throw new StudioError(`${pack.meta.name} n’est lié à aucun projet Hangar.`)
        const local = pack.contentVersions.find((v) => v.version === version)
        if (!local) throw new StudioError(`${pack.meta.name} n’a pas de version ${version}.`)
        if (hangar.versions.includes(version)) throw new StudioError(`La version ${version} est déjà sur Hangar.`)
        const minecraft = [...new Set(local.files.flatMap((f) => f.analysis.minecraftVersions))]
        if (!minecraft.length) throw new StudioError('Ce plugin ne dit pas pour quelles versions de Minecraft il est fait : Hangar l’exige. Donne-les dans « Versions de Minecraft ».')
        const client = await this.hangar()
        onStep('Versions déjà sur Hangar')
        if ((await client.projectVersions(hangar.slug)).some((v) => v.name === version)) {
          throw new StudioError(`La version ${version} est déjà sur Hangar : publie une nouvelle version du plugin.`)
        }
        onStep('Envoi vers Hangar')
        await client.uploadVersion(hangar.slug, {
          version,
          // Canaux par défaut d'un projet Hangar : Release et Snapshot.
          channel: releaseType === 'release' ? 'Release' : 'Snapshot',
          description: (pack.meta.notes[version] ?? '').trim() || `Version ${version}`,
          platformDependencies: { PAPER: minecraft },
          files: local.files.map((f) => ({ path: f.path, platforms: ['PAPER'] }))
        })
        const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
        if (meta.hangar) await writePackFile(dir, { ...meta, hangar: { ...meta.hangar, versions: [...meta.hangar.versions, version] } })
        return { version }
      },
      (result) => ({ ok: true, detail: `version Hangar ${result.version}` })
    )
  }

  /** Versions du projet Hangar lié, rapprochées des versions locales par leur nom. */
  async hangarVersions(folder: string): Promise<HangarVersionView[]> {
    const { meta } = await loadPackMeta(this.requireWorkspace(), folder)
    if (!meta.hangar) return []
    const hangar = meta.hangar
    const pack = (await this.scan())?.packs.find((p) => p.folder === folder)
    const local = new Set((pack?.contentVersions ?? []).map((v) => v.version))
    return (await (await this.hangar()).projectVersions(hangar.slug)).map((v) => ({
      name: v.name,
      channel: v.channel?.name ?? '',
      date: v.createdAt || null,
      platforms: v.platformDependencies ?? {},
      version: local.has(v.name) ? v.name : null,
      sentByApp: hangar.versions.includes(v.name),
      url: `${hangar.url}/versions/${encodeURIComponent(v.name)}`
    }))
  }

  // ---------------------------------------------------------------------------------------------
  // Publication sur Modrinth (mods)

  private async modrinth(): Promise<ModrinthClient> {
    if (!this.options.getModrinthClient) throw new StudioError('Publication sur Modrinth impossible depuis ce programme.')
    return this.options.getModrinthClient()
  }

  /** Lie un mod à son projet Modrinth (adresse, slug ou identifiant). */
  async linkModrinth(folder: string, ref: string): Promise<{ projectId: string; slug: string; url: string }> {
    const { meta: current } = await loadPackMeta(this.requireWorkspace(), folder)
    if (current.type === 'modpack') throw new StudioError('Les modpacks ne se publient pas encore sur Modrinth.')
    const project = await resolveModrinthProject(await this.modrinth(), ref, current.type)
    await this.logged(`le lien de ${folder} au projet Modrinth ${project.slug}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      const versions = meta.modrinth?.projectId === project.projectId ? meta.modrinth.versions : {}
      await writePackFile(dir, { ...meta, modrinth: { ...project, versions } })
    })
    return { projectId: project.projectId, slug: project.slug, url: project.url }
  }

  /** Met en ligne une version d'un mod sur son projet Modrinth (visible tout de suite si le projet est approuvé). */
  publishModToModrinth(
    folder: string,
    version: string,
    releaseType: 'release' | 'beta' | 'alpha',
    onStep: (text: string) => void
  ): Promise<{ versionId: string; unknownDependencies: string[] }> {
    return this.exclusive(
      `la publication de la version ${version} de ${folder} sur Modrinth`,
      async () => {
        this.requireWorkspace()
        const pack = (await this.scan())!.packs.find((p) => p.folder === folder)
        if (!pack) throw new StudioError(`Le mod ${folder} est introuvable.`)
        if (pack.meta.type === 'modpack') throw new StudioError(`${folder} est un modpack.`)
        if (pack.errors.length) throw new StudioError(`Corrige d’abord ${pack.meta.name} : ${pack.errors[0]}`)
        const modrinth = pack.meta.modrinth
        if (!modrinth) throw new StudioError(`${pack.meta.name} n’est lié à aucun projet Modrinth.`)
        const local = pack.contentVersions.find((v) => v.version === version)
        if (!local) throw new StudioError(`${pack.meta.name} n’a pas de version ${version}.`)
        const newer = pack.contentVersions.filter((v) => modrinth.versions[v.version] && compareVersions(v.version, version) > 0)
        if (newer.length) throw new StudioError(`La version ${newer[newer.length - 1].version} est déjà sur Modrinth : une version plus ancienne n’y a plus sa place.`)
        const client = await this.modrinth()
        const result = await publishToModrinth(
          client,
          {
            name: CONTENT_KINDS[pack.meta.type].versioning === 'number' ? `${pack.meta.name} v${version}` : `${pack.meta.name} ${version}`,
            version,
            files: local.files.map((f) => ({
              path: f.path,
              fileName: f.fileName,
              loaders: f.analysis.loaders,
              minecraftVersions: f.analysis.minecraftVersions,
              dependencies: f.analysis.dependencies
            })),
            notes: pack.meta.notes[version] ?? '',
            releaseType,
            modrinth,
            published: await client.projectVersions(modrinth.projectId)
          },
          onStep
        )
        const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
        if (meta.modrinth) await writePackFile(dir, { ...meta, modrinth: { ...meta.modrinth, versions: { ...meta.modrinth.versions, [version]: result.versionId } } })
        return result
      },
      (result) => ({ ok: true, detail: `version Modrinth ${result.versionId}` })
    )
  }

  /** Versions du projet Modrinth lié, de la plus récente à la plus ancienne, rapprochées des versions locales. */
  async modrinthVersions(folder: string): Promise<ModrinthVersionView[]> {
    const { meta } = await loadPackMeta(this.requireWorkspace(), folder)
    if (!meta.modrinth) return []
    const pack = (await this.scan())?.packs.find((p) => p.folder === folder)
    const localFiles = new Map((pack?.contentVersions ?? []).flatMap((v) => v.files.map((f) => [f.fileName, v.version] as const)))
    return modrinthVersionViews(await (await this.modrinth()).projectVersions(meta.modrinth.projectId), meta.modrinth, localFiles)
  }

  private async versionFor(folder: string, version: number) {
    const workspace = (await this.scan())!
    const pack = workspace.packs.find((p) => p.folder === folder)
    if (!pack) throw new StudioError(`Le modpack ${folder} est introuvable.`)
    requireModpack(pack.meta, folder)
    if (!pack.meta.curseforge) throw new StudioError(`${pack.meta.name} n’est lié à aucun projet CurseForge.`)
    const local = pack.versions.find((v) => v.number === version)
    if (!local || !local.analysis) throw new StudioError(`${pack.meta.name} n’a pas de v${version} utilisable.`)
    return { pack, local, analysis: local.analysis, curseforge: pack.meta.curseforge }
  }

  /** Exporte une version au format CurseForge sans l'envoyer (pour vérifier). */
  async exportCurseForge(folder: string, version: number, destination: string) {
    this.requireWorkspace()
    const { pack, local, curseforge } = await this.versionFor(folder, version)
    return exportToFile({ name: pack.meta.name, versionZip: local.path, curseforge }, destination)
  }

  /** Met une version en ligne sur le projet CurseForge du modpack ; elle passe ensuite en modération. */
  publishToCurseForge(folder: string, version: number, releaseType: 'release' | 'beta' | 'alpha', onStep: (text: string) => void): Promise<number> {
    return this.exclusive(
      `la publication de la v${version} de ${folder} sur CurseForge`,
      async () => {
        this.requireWorkspace()
        if (!this.options.getCurseForgeUploader) throw new StudioError('Publication sur CurseForge impossible depuis ce programme.')
        const { pack, local, analysis, curseforge } = await this.versionFor(folder, version)
        if (!analysis.minecraftVersion) throw new StudioError('Version de Minecraft inconnue pour ce zip.')
        const published = await projectVersions(await this.curseForge(), curseforge)
        const fileId = await publishVersion(
          await this.options.getCurseForgeUploader(),
          {
            name: pack.meta.name,
            version,
            versionZip: local.path,
            minecraftVersion: analysis.minecraftVersion,
            modLoader: analysis.modLoader,
            notes: pack.meta.notes[String(version)] ?? '',
            releaseType,
            curseforge,
            published
          },
          onStep
        )
        const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
        if (meta.curseforge) await writePackFile(dir, { ...meta, curseforge: { ...meta.curseforge, files: { ...meta.curseforge.files, [String(version)]: fileId } } })
        return fileId
      },
      (fileId) => ({ ok: true, detail: `fichier CurseForge ${fileId}, en modération` })
    )
  }

  /**
   * Met en ligne une version d'un mod sur son projet CurseForge : chaque jar, avec ses versions de Minecraft, son
   * chargeur, son côté (client, serveur) et ses dépendances obligatoires connues de CurseForge.
   */
  publishModToCurseForge(
    folder: string,
    version: string,
    releaseType: 'release' | 'beta' | 'alpha',
    onStep: (text: string) => void
  ): Promise<{ fileIds: number[]; unknownDependencies: string[] }> {
    return this.exclusive(
      `la publication de la version ${version} de ${folder} sur CurseForge`,
      async () => {
        this.requireWorkspace()
        if (!this.options.getCurseForgeUploader) throw new StudioError('Publication sur CurseForge impossible depuis ce programme.')
        const pack = (await this.scan())!.packs.find((p) => p.folder === folder)
        if (!pack) throw new StudioError(`Le mod ${folder} est introuvable.`)
        if (pack.meta.type === 'modpack') throw new StudioError(`${folder} est un modpack.`)
        if (pack.meta.type === 'plugin') throw new StudioError('Les plugins ne se publient pas sur CurseForge depuis l’application : utilise Modrinth ou Hangar.')
        if (pack.errors.length) throw new StudioError(`Corrige d’abord ${pack.meta.name} : ${pack.errors[0]}`)
        const curseforge = pack.meta.curseforge
        if (!curseforge) throw new StudioError(`${pack.meta.name} n’est lié à aucun projet CurseForge.`)
        const local = pack.contentVersions.find((v) => v.version === version)
        if (!local) throw new StudioError(`${pack.meta.name} n’a pas de version ${version}.`)
        const newer = pack.contentVersions.filter((v) => curseforge.files[v.version] && compareVersions(v.version, version) > 0)
        if (newer.length) throw new StudioError(`La version ${newer[newer.length - 1].version} est déjà sur CurseForge : une version plus ancienne n’y a plus sa place.`)
        const client = await this.curseForge()
        const result = await publishModVersion(
          await this.options.getCurseForgeUploader(),
          client,
          {
            version,
            files: local.files.map((f) => ({
              path: f.path,
              fileName: f.fileName,
              displayName: contentDisplayName(pack.meta.type, pack.meta.name, version, f.fileName),
              loaders: f.analysis.loaders,
              minecraftVersions: f.analysis.minecraftVersions,
              // Seuls les mods ont un côté sur CurseForge : un pack de ressources ou un shader n'accepte pas « Client ».
              side: pack.meta.type === 'mod' ? f.analysis.side : null,
              dependencies: f.analysis.dependencies
            })),
            notes: pack.meta.notes[version] ?? '',
            releaseType,
            curseforge,
            published: await projectVersions(client, curseforge)
          },
          onStep
        )
        const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
        if (meta.curseforge) await writePackFile(dir, { ...meta, curseforge: { ...meta.curseforge, files: { ...meta.curseforge.files, [version]: result.fileIds[0] } } })
        return result
      },
      (result) => ({ ok: true, detail: `fichier CurseForge ${result.fileIds.join(', ')}, en modération` })
    )
  }

  /**
   * Versions du projet CurseForge lié, de la plus récente à la plus ancienne, avec leur état de modération : celles que
   * l'application a envoyées et celles mises en ligne depuis le site. Pour un mod, chacune est rapprochée de la version
   * locale dont un jar porte son nom.
   */
  async curseForgeVersions(folder: string) {
    const { meta } = await loadPackMeta(this.requireWorkspace(), folder)
    if (!meta.curseforge) return []
    const versions = await projectVersions(await this.curseForge(), meta.curseforge)
    if (meta.type === 'modpack') return versions
    const pack = (await this.scan())?.packs.find((p) => p.folder === folder)
    const byName = new Map(
      (pack?.contentVersions ?? []).flatMap((v) => v.files.map((f) => [contentDisplayName(meta.type, meta.name, v.version, f.fileName), v.version] as const))
    )
    const sent = new Map(Object.entries(meta.curseforge.files).map(([version, id]) => [id, version]))
    return versions.map((v) => ({ ...v, number: null, version: sent.get(v.fileId) ?? byName.get(v.displayName) ?? null }))
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
        const report = await runServerTest((await this.profileAt(profilePath)).path, {
          cacheDir: testServersDir(),
          instancesDir: await this.testInstancesDir(),
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

  /**
   * Partie de test : le serveur démarre, puis de vrais clients (hors ligne, tous les mods du profil) le rejoignent et
   * jouent un moment (quelques minutes). Enregistre aussi le test du serveur qu'elle comprend.
   */
  testPlayers(profilePath: string, onStep: (text: string) => void, options: PlayerTestRequest = {}): Promise<PlayerTestReport> {
    return this.exclusive(
      `le test avec des joueurs de ${basename(profilePath)}`,
      () => this.runPlayers(profilePath, onStep, options),
      (r) => (r.outcome === 'passed' ? { ok: true, detail: r.message } : { ok: false, error: r.message })
    )
  }

  /** Tous les tests, dans l'ordre : fichiers, puis partie avec des joueurs (le serveur compris). */
  testAll(profilePath: string, onStep: (text: string) => void, options: PlayerTestRequest = {}): Promise<ProfileTestReports> {
    return this.exclusive(
      `les tests de ${basename(profilePath)}`,
      async () => {
        onStep('Vérification des fichiers')
        const files = await this.checkProfile(profilePath)
        const players = await this.runPlayers(profilePath, onStep, options)
        return { files, server: players.server, players }
      },
      (r) => {
        const errors = r.files?.findings.filter((f) => f.severity === 'error').length ?? 0
        if (errors) return { ok: false, error: `${errors} erreur(s) dans les fichiers. ${r.players?.message ?? ''}`.trim() }
        return r.players?.outcome === 'passed' ? { ok: true, detail: r.players.message } : { ok: false, error: r.players?.message ?? 'Test incomplet.' }
      }
    )
  }

  private async runPlayers(profilePath: string, onStep: (text: string) => void, options: PlayerTestRequest): Promise<PlayerTestReport> {
    const report = await runPlayerTest((await this.profileAt(profilePath)).path, {
      cacheDir: testServersDir(),
      clientsDir: testClientsDir(),
      instancesDir: await this.testInstancesDir(),
      onStep,
      signal: options.signal,
      players: options.players,
      playMs: options.playMs
    })
    await saveReport(report.profilePath, 'players', report)
    if (report.server) await saveReport(report.profilePath, 'server', report.server)
    return report
  }

  private async testInstancesDir(): Promise<string> {
    const instancesDir = await this.options.getInstancesDir?.()
    if (!instancesDir) throw new StudioError('Dossier Instances de CurseForge introuvable.')
    return instancesDir
  }

  /** Derniers rapports de test d'un profil. */
  async lastTests(profilePath: string): Promise<ProfileTestReports> {
    const [files, server, players] = await Promise.all([
      lastReport<StaticCheckReport>(profilePath, 'files'),
      lastReport<ServerTestReport>(profilePath, 'server'),
      lastReport<PlayerTestReport>(profilePath, 'players')
    ])
    return { files, server, players }
  }

  /** Les derniers tests faits sur les mods actuels d'un profil (sur lui, ou sur un essai qui avait déjà ces mods). */
  async currentTests(profilePath: string): Promise<ProfileTestReports> {
    const signature = (await modsOf((await this.profileAt(profilePath)).path))?.signature
    return signature ? reportsForSignature(signature) : { files: null, server: null, players: null }
  }

  // ---------------------------------------------------------------------------------------------
  // Mises à jour des mods d'un profil, par une copie d'essai

  private async curseForge(): Promise<CurseForgeClient> {
    if (!this.options.getCurseForgeClient) throw new StudioError('Mises à jour impossibles depuis ce programme.')
    return this.options.getCurseForgeClient()
  }

  /** Ce qu'une mise à jour du profil changerait (lecture seule). */
  async checkUpdates(profilePath: string, channel: UpdateChannel = 'release', pinned: number[] = []): Promise<UpdatePlan> {
    const profile = await this.profileAt(profilePath)
    return checkUpdates(profile.path, await this.curseForge(), { channel, pinned })
  }

  /** Crée « <profil> (essai) » avec les mises à jour (toutes, ou celles des projets `only`). */
  applyUpdatesToTrial(
    profilePath: string,
    options: { channel?: UpdateChannel; only?: number[]; pinned?: number[] },
    onProgress: (done: number, total: number, name: string) => void
  ): Promise<TrialResult> {
    return this.exclusive(
      `l’essai des mises à jour de ${basename(profilePath)}`,
      async () => {
        const client = await this.curseForge()
        const plan = await checkUpdates((await this.profileAt(profilePath)).path, client, { channel: options.channel, pinned: options.pinned })
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
          // Un passage des mises à jour automatiques qui attendait cet essai n'attend plus rien.
          await forgetTrial(trialPath, 'Essai reporté dans le profil en dehors des mises à jour automatiques : aucune version créée.')
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
      await forgetTrial(trialPath, 'Essai abandonné.')
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

  /** Fiche d'un modpack ou d'un contenu ; `group` absent : groupe inchangé, vide ou null : retiré de son groupe. */
  async updatePackInfo(folder: string, info: { name: string; description: string; group?: string | null }): Promise<void> {
    const name = info.name.trim().replace(/\s+/g, ' ')
    if (!name) throw new StudioError('Le nom ne peut pas être vide.')
    await this.logged(`la fiche de ${folder}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      const group = info.group === undefined ? meta.group : normalizeGroup(info.group)
      await writePackFile(dir, { ...meta, name, description: info.description.trim(), group })
    })
  }

  /** Range un modpack ou un contenu dans un groupe du Studio (null ou vide : l'en sort). Rend le groupe retenu. */
  async setPackGroup(folder: string, group: string | null): Promise<string | null> {
    const normalized = normalizeGroup(group)
    await this.logged(`le groupe de ${folder}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      await writePackFile(dir, { ...meta, group: normalized })
    })
    return normalized
  }

  /** Enregistre les réglages des versions d'un modpack (fichiers exclus, mods désactivés, configurations). */
  async updatePackSettings(folder: string, settings: PackSettings): Promise<void> {
    await this.logged(`les réglages des versions de ${folder}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      requireModpack(meta, folder)
      await writePackFile(dir, { ...meta, ...normalizePackSettings(settings) })
    })
  }

  /** Enregistre les réglages des mises à jour automatiques d'un modpack. */
  async updatePackUpdates(folder: string, updates: Partial<PackUpdates>): Promise<PackUpdates> {
    let next = DEFAULT_PACK_UPDATES
    await this.logged(`les mises à jour automatiques de ${folder}`, async () => {
      const { dir, meta } = await loadPackMeta(this.requireWorkspace(), folder)
      requireModpack(meta, folder)
      next = normalizePackUpdates({ ...meta.updates, ...updates })
      if (next.autoPublish && !meta.github && !meta.curseforge) throw new StudioError('Ce modpack n’est publié nulle part.')
      await writePackFile(dir, { ...meta, updates: next })
    })
    return next
  }

  /** Notes d'une version : numéro d'un modpack, ou version déclarée d'un mod (`1.2.0-26.3`). */
  async setNotes(folder: string, version: number | string, notes: string): Promise<void> {
    const label = typeof version === 'number' ? `v${version}` : `version ${version}`
    await this.logged(`les notes de la ${label} de ${folder}`, async () => {
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
