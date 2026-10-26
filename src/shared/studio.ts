// Types du Studio : l'outil de l'auteur pour ranger ses zips et les publier sur GitHub.
import type { ContentKind, ContentLoader } from './content'
import type { CredentialSource, CurseForgeProfile, RepoRef, UserRole } from './types'

export interface StudioSettings {
  /** Dossier qui contient un sous-dossier par contenu (null tant qu'il n'a pas été choisi). */
  workspaceDir: string | null
  defaultWorkspaceDir: string
  /** Rôle et dépôt choisis dans l'application (Paramètres → Utilisation). */
  role: UserRole | null
  repo: RepoRef
}

/** Mod que les joueurs reçoivent désactivé : il est installé, et ils peuvent l'activer dans CurseForge. */
export interface DisabledMod {
  /** Projet CurseForge du mod : il le reconnaît d'une version à l'autre, même quand son fichier change. */
  addonId: number | null
  /** Fichier du dossier mods : il reconnaît un mod que CurseForge ne connaît pas. */
  file: string
  name: string | null
}

/** Réglages des versions d'un modpack, enregistrés dans son pack.json. */
export interface PackSettings {
  /** Fichiers et dossiers jamais publiés, depuis la racine de l'instance (voir shared/exclusions.ts). */
  exclude: string[]
  disabledMods: DisabledMod[]
  /** Une mise à jour garde les fichiers du dossier config que le joueur a modifiés. */
  keepPlayerConfigs: boolean
}

export const DEFAULT_PACK_SETTINGS: PackSettings = { exclude: [], disabledMods: [], keepPlayerConfigs: false }

/**
 * Un mod d'un zip (fichier sans `.disabled`) correspond à un mod désactivé des réglages : même projet CurseForge
 * quand les deux le connaissent, sinon même fichier.
 */
export function matchesDisabledMod(mod: { addonId: number | null; file: string }, entry: DisabledMod): boolean {
  if (mod.addonId !== null && entry.addonId !== null) return mod.addonId === entry.addonId
  return mod.file.toLowerCase() === entry.file.toLowerCase()
}

/** Fichiers exclus du modpack trouvés dans un zip qui va être publié. */
export interface ExcludedInZip {
  /** Nombre de fichiers concernés. */
  files: number
  /** Chemins exclus trouvés (un dossier exclu compte pour un seul chemin). */
  paths: string[]
}

/** Ce qu'on lit dans un zip de modpack. */
export interface ZipAnalysis {
  sha256: string
  minecraftVersion: string | null
  modLoader: string | null
  modCount: number | null
  /** Empreinte des mods du zip, pour reconnaître cette version dans un profil CurseForge. */
  modsSignature: string | null
  warnings: string[]
}

export type RemoteStatus = 'published' | 'create' | 'update' | 'blocked' | 'unknown'

export interface VersionView {
  number: number
  fileName: string
  path: string
  size: number
  modifiedAt: string
  analysis: ZipAnalysis | null
  /** Zip inutilisable : il ne sera pas publié. */
  error: string | null
  notes: string
  remote: RemoteStatus
  /** Ce qui changera sur GitHub à la prochaine publication. */
  changes: string[]
  /** Fichiers exclus du modpack présents dans un zip qui partira à la prochaine publication. */
  excluded: ExcludedInZip | null
  /** Ce que disent les derniers tests faits sur ces mods (null : jamais testée). */
  tests: VersionTests | null
}

/** Bilan des derniers tests d'une version : `partial` = serveur ou fichiers seulement, pas de partie avec des joueurs. */
export interface VersionTests {
  state: 'passed' | 'partial' | 'failed'
  summary: string
  /** Date du test le plus récent. */
  at: string
}

/** Un fichier (.jar) d'une version de mod. */
export interface ContentFileView {
  fileName: string
  path: string
  size: number
  loaders: ContentLoader[]
  minecraftVersions: string[]
  /** Côté où le mod fonctionne. */
  side: 'client' | 'server' | 'both'
  /** Dépendances obligatoires (identifiants de mods, hors jeu, Java et chargeur). */
  dependencies: string[]
}

/** Une version d'un mod : un ou plusieurs jars (un par chargeur ou par version de Minecraft) de même version déclarée. */
export interface ContentVersionView {
  /** Version déclarée par le jar (`1.2.0-26.3`). */
  version: string
  files: ContentFileView[]
  modifiedAt: string
  notes: string
  remote: RemoteStatus
  changes: string[]
  /** Fichier CurseForge envoyé par l'application pour cette version. */
  curseforgeFileId: number | null
  /** Version Modrinth envoyée par l'application pour cette version. */
  modrinthVersionId: string | null
}

/** Jar du dossier d'un mod qui n'a pas pu être lu (pas un mod, autre mod, illisible). */
export interface BadJar {
  fileName: string
  error: string
}

/** Zip déposé dans le dossier mais pas encore numéroté. */
export interface PendingZip {
  fileName: string
  size: number
  modifiedAt: string
  /** Zip inutilisable : il ne sera pas rangé. */
  error: string | null
  warnings: string[]
  excluded: ExcludedInZip | null
}

/** Version présente sur GitHub dont le zip n'existe plus sur le PC. */
export interface RemoteOnlyVersion {
  tag: string
  version: string
  url: string
  draft: boolean
}

/** Le profil CurseForge d'où viennent les versions d'un modpack (pack.json). */
export interface PackProfileLink {
  /** Identifiant du profil (minecraftinstance.json) ; null si CurseForge n'en donne pas. */
  guid: string | null
  /** Nom du profil quand le lien a été fait : retrouve le profil sans guid, et l'affiche s'il a disparu. */
  name: string
}

/** État sur CurseForge d'une version publiée par l'application. */
/** Une version du projet CurseForge d'un modpack : envoyée par l'application, ou mise en ligne depuis le site. */
export interface CurseForgeVersion {
  fileId: number
  /** Numéro de la version : celui donné par l'application, sinon le « _V<N> » du nom affiché ; null sans numéro. */
  number: number | null
  /** Version d'un mod (déclarée par son jar) à laquelle ce fichier correspond ; null pour un modpack ou si inconnue. */
  version?: string | null
  /** FileStatus de CurseForge (3 en modération, 4 approuvé, 5 refusé, 10 publié…), 0 si le fichier est introuvable. */
  status: number
  label: string
  displayName: string
  /** 1 version stable, 2 bêta, 3 alpha (0 inconnu). */
  releaseType: number
  /** Date de mise en ligne (ISO). */
  date: string | null
  /** Versions de Minecraft et chargeur, comme CurseForge les affiche. */
  gameVersions: string[]
  /** Envoyée par l'application (`curseforge.files` de pack.json). */
  sentByApp: boolean
  /** Page du fichier sur CurseForge. */
  url: string | null
}

/** Le projet CurseForge d'un modpack (pack.json). */
export interface PackCurseForge {
  projectId: number
  /** Page du projet. */
  url: string | null
  /** Fichiers joints à l'export (chemins depuis la racine de l'instance, jokers permis), comme dans l'export de CurseForge. */
  overrides: string[]
  /** Fichier CurseForge de chaque version publiée, par numéro. */
  files: Record<string, number>
}

/** Le projet Modrinth d'un mod (pack.json). */
export interface PackModrinth {
  projectId: string
  slug: string
  /** Page du projet. */
  url: string
  /** Version Modrinth de chaque version envoyée par l'application, par version déclarée. */
  versions: Record<string, string>
}

/** Le projet Hangar d'un plugin (pack.json). */
export interface PackHangar {
  /** Slug du projet (« MonPlugin »). */
  slug: string
  owner: string
  url: string
  /** Versions envoyées par l'application (leur nom sur Hangar est la version du plugin). */
  versions: string[]
}

/** Une version du projet Hangar. */
export interface HangarVersionView {
  name: string
  channel: string
  date: string | null
  /** Versions de Minecraft, par plateforme. */
  platforms: Record<string, string[]>
  /** Version locale de même nom, sinon null. */
  version: string | null
  sentByApp: boolean
  url: string
}

/** Une version du projet Modrinth : envoyée par l'application, ou mise en ligne depuis le site. */
export interface ModrinthVersionView {
  versionId: string
  versionNumber: string
  name: string
  /** listed, draft, unlisted, archived… */
  status: string
  versionType: 'release' | 'beta' | 'alpha'
  date: string | null
  gameVersions: string[]
  loaders: string[]
  /** Version locale correspondante (envoyée par l'application, ou mêmes noms de fichiers), sinon null. */
  version: string | null
  sentByApp: boolean
  url: string
}

export interface PackView {
  folder: string
  dir: string
  id: string
  /** Ce que contient le dossier : un modpack, ou un autre contenu (mods, packs de ressources…). */
  type: ContentKind
  name: string
  description: string
  coverUrl: string | null
  settings: PackSettings
  /** Profil CurseForge source, s'il est connu. */
  profile: PackProfileLink | null
  /** Publié sur GitHub (faux : modpack seulement sur CurseForge, jamais touché sur GitHub). */
  github: boolean
  curseforge: PackCurseForge | null
  /** Mod : son projet Modrinth, s'il en a un. */
  modrinth: PackModrinth | null
  /** Plugin : son projet Hangar, s'il en a un. */
  hangar: PackHangar | null
  updates: PackUpdates
  /** Mod : dossier d'où il importe ses versions ; pack de ressources ou shader : dossier du pack, zippé à chaque version. */
  source: string | null
  /** Pack de ressources ou shader : versions de Minecraft données à la main (vide : celles du zip). */
  minecraftVersions: string[]
  /** Groupe du Studio : sous-dossier de la colonne de gauche où il est rangé (null : aucun). */
  group: string | null
  /** Versions d'un mod, de la plus récente à la plus ancienne (vide pour un modpack). */
  contentVersions: ContentVersionView[]
  badJars: BadJar[]
  /** Versions numérotées, de la plus récente à la plus ancienne. */
  versions: VersionView[]
  pending: PendingZip[]
  remoteOnly: RemoteOnlyVersion[]
  /** Erreurs qui empêchent toute publication de ce modpack. */
  errors: string[]
  nextVersion: number
}

export interface GitHubStatus {
  state: 'ok' | 'no-token' | 'error' | 'unchecked'
  repo: string
  repoUrl: string
  login: string | null
  tokenSource: CredentialSource | null
  repoPrivate: boolean | null
  canPush: boolean | null
  error: string | null
  checkedAt: string | null
}

export type SyncActionKind = 'create' | 'update' | 'delete'

export interface SyncAction {
  kind: SyncActionKind
  tag: string
  packId: string
  label: string
  details: string[]
  warnings: string[]
  uploadBytes: number
}

export interface SyncPlan {
  actions: SyncAction[]
  /** Empreinte du plan : la publication est refusée si le dossier a changé entre-temps. */
  fingerprint: string
  warnings: string[]
  uploadBytes: number
  /** Zips pas encore rangés, ignorés par la publication. */
  pendingZips: number
}

/** Modpack publié sur GitHub dont le dossier n'existe plus : il sera retiré. */
export interface OrphanPack {
  id: string
  name: string
  versions: string[]
  /** Tags de ses releases, pour les retirer sans attendre la publication. */
  tags: string[]
}

/**
 * Un profil CurseForge face à son modpack :
 * - `unlinked` : aucun modpack ne vient de ce profil ;
 * - `no-version` : son modpack n'a encore aucune version ;
 * - `up-to-date` : il a exactement les mods de la dernière version ;
 * - `older` : il a les mods d'une version plus ancienne ;
 * - `changed` : ses mods ne sont ceux d'aucune version, il y a de quoi créer la suivante.
 */
export type ProfileState = 'unlinked' | 'no-version' | 'up-to-date' | 'older' | 'changed'

export interface ProfileView extends CurseForgeProfile {
  pack: { folder: string; id: string; name: string } | null
  /** `saved` : lien enregistré dans pack.json ; `guessed` : déduit (mêmes mods qu'une version, ou même nom). */
  link: 'saved' | 'guessed' | null
  state: ProfileState
  /** Version dont il a exactement les mods. */
  matchingVersion: number | null
  /** Sa copie d'essai en cours (mises à jour à tester), s'il en a une. */
  trialPath: string | null
  /** Ce profil est la copie d'essai de ce profil-là. */
  trialOf: string | null
}

/** Ce qu'un profil contient depuis CurseForge (catégorie du projet). */
export type AddonKind = 'mod' | 'resourcepack' | 'shader'

/** Canal des mises à jour : `release` seulement, ou aussi les versions `beta`. */
export type UpdateChannel = 'release' | 'beta'

export interface AddonFileRef {
  fileId: number
  fileName: string
  date: string | null
  /** 1 release, 2 beta, 3 alpha. */
  releaseType: number
}

/** Un changement proposé : un fichier plus récent, ou une dépendance obligatoire à ajouter. */
export interface AddonUpdate {
  projectId: number
  name: string
  kind: AddonKind
  /** null : projet absent du profil, ajouté comme dépendance. */
  from: AddonFileRef | null
  to: AddonFileRef
  /** Projets qui le demandent (dépendance ajoutée). */
  requiredBy: string[]
  url: string | null
  /** Faux : son auteur n'autorise le téléchargement que depuis CurseForge, la mise à jour s'y fait à la main. */
  downloadable: boolean
}

/** Ce qu'une mise à jour du profil changerait (même version de Minecraft, même chargeur). */
export interface UpdatePlan {
  profile: string
  profilePath: string
  minecraftVersion: string
  modLoader: string | null
  channel: UpdateChannel
  /** Projets CurseForge vérifiés. */
  checked: number
  updates: AddonUpdate[]
  /** Projets figés par le publieur, laissés tels quels. */
  pinned: string[]
  /** Fichiers posés à la main dans mods (inconnus de CurseForge) : jamais mis à jour. */
  untracked: string[]
  warnings: string[]
}

/** Une copie d'essai créée avec des mises à jour. */
export interface TrialResult {
  trialPath: string
  applied: AddonUpdate[]
  /** Mises à jour laissées de côté, avec la raison (téléchargement interdit hors de CurseForge…). */
  skipped: Array<{ update: AddonUpdate; reason: string }>
}

/** Rythme des mises à jour automatiques : `manual` seulement à la demande, `never` jamais (pas même « tous »). */
export type UpdateFrequency = 'weekly' | 'biweekly' | 'monthly' | 'manual' | 'never'

/** Réglages des mises à jour d'un modpack (pack.json `updates`, écrit seulement s'il change quelque chose). */
export interface PackUpdates {
  frequency: UpdateFrequency
  channel: UpdateChannel
  /** Projets CurseForge laissés tels quels (mod figé volontairement). */
  pinned: Array<{ projectId: number; name: string }>
  /** Une version qui passe les tests est publiée seule ; sinon elle attend d'être validée. */
  autoPublish: boolean
}

export const DEFAULT_PACK_UPDATES: PackUpdates = { frequency: 'manual', channel: 'release', pinned: [], autoPublish: false }

/**
 * Ce qu'a donné le passage d'un modpack : `up-to-date` rien à faire ; `manual` des mises à jour seulement faisables
 * dans CurseForge ; `ready` essai testé, à valider ; `failed` essai qui échoue aux tests (ou erreur) ; `created`
 * version créée ; `published` version créée et publiée ; `skipped` passage remis à plus tard (essai en attente…).
 */
export type MaintenanceOutcome = 'up-to-date' | 'manual' | 'ready' | 'failed' | 'created' | 'published' | 'skipped'

export interface MaintenanceRecord {
  packId: string
  folder: string
  name: string
  at: string
  outcome: MaintenanceOutcome
  message: string
  /** Mises à jour essayées, une ligne par projet. */
  changes: string[]
  /** Mises à jour à faire dans CurseForge (téléchargement réservé à CurseForge). */
  manual: string[]
  profilePath: string | null
  /** Copie d'essai (`ready`, `failed`). */
  trialPath: string | null
  /** Version créée (`created`, `published`). */
  version: number | null
  /** Ce que Claude a conclu, s'il a été appelé. */
  claude: string | null
  /**
   * À regarder avant de publier, sans que les tests aient échoué : erreurs apparues dans les journaux depuis le profil
   * d'origine, partie de test impossible… Retient la publication automatique. Absent avant la 1.8.0.
   */
  warnings?: string[]
}

/** Mises à jour automatiques d'un modpack : réglages, dernier passage et prochain. */
export interface PackMaintenance {
  folder: string
  packId: string
  name: string
  updates: PackUpdates
  /** Dernière recherche de mises à jour (un passage `skipped` ne compte pas). */
  checkedAt: string | null
  /** Prochain passage prévu (null : `manual` ou `never`). */
  dueAt: string | null
  last: MaintenanceRecord | null
}

/** La tâche planifiée de Windows qui lance les passages automatiques. */
export interface MaintenanceTask {
  installed: boolean
  /** Heure du passage quotidien, « HH:MM ». */
  time: string | null
  /** Réveille le PC en veille. */
  wake: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  /** Pointe vers une autre installation de l'application (ou une version de développement). */
  foreign: boolean
}

export interface MaintenanceStatus {
  packs: PackMaintenance[]
  task: MaintenanceTask | null
  /** Passage en cours dans un processus (null sinon). */
  running: string | null
}

/** Ce qu'une vérification a trouvé : `error` empêche le jeu de démarrer, `warning` le risque, `info` est à savoir. */
export interface CheckFinding {
  severity: 'error' | 'warning' | 'info'
  message: string
  /** Fichiers concernés, dans le dossier mods. */
  files: string[]
}

/** Vérification des fichiers d'un profil, sans lancer le jeu. */
export interface StaticCheckReport {
  profile: string
  profilePath: string
  checkedAt: string
  jars: number
  findings: CheckFinding[]
  /** Mods qui ne fonctionnent que dans le jeu (laissés de côté par le test du serveur). */
  clientOnly: string[]
  /** Empreinte des mods testés (modsSignature) : relie le rapport aux versions qui ont ces mods. */
  modsSignature?: string | null
}

/**
 * Une erreur relevée dans un journal du jeu (serveur ou client), même quand il démarre : script ou recette en erreur,
 * mixin refusé, mod qui échoue à se charger… Les messages identiques (aux nombres près) sont regroupés.
 */
export interface LogIssue {
  level: 'error' | 'warning'
  /** Ce qui l'a écrit (dernier mot du nom du journal : « ModSorter », « RecipeManager »…). */
  source: string | null
  message: string
  /** Première ligne de l'exception qui suit, s'il y en a une. */
  detail: string | null
  count: number
  /** Identique d'un test à l'autre pour la même erreur : sert à trouver celles qu'une mise à jour fait apparaître. */
  key: string
}

/** Démarrage d'un serveur dédié avec les mods du profil. */
export interface ServerTestReport {
  profile: string
  profilePath: string
  startedAt: string
  durationMs: number
  /** `started` : le serveur a fini de démarrer (puis a été arrêté) ; sinon, pourquoi pas. */
  outcome: 'started' | 'crashed' | 'timeout' | 'failed'
  message: string
  minecraftVersion: string
  modLoader: string | null
  /** Mods laissés de côté parce qu'ils ne fonctionnent que dans le jeu. */
  clientOnly: string[]
  /** Dernières lignes du journal du serveur. */
  logTail: string[]
  crashReport: { file: string; description: string | null; suspects: string[]; excerpt: string } | null
  /** Erreurs du journal, du démarrage à l'arrêt (absent dans les rapports d'avant la 1.8.0). */
  logIssues?: LogIssue[]
  modsSignature?: string | null
}

/** Un joueur du test : un vrai client Minecraft, hors ligne, sur le serveur de test. */
export interface TestPlayer {
  name: string
  /**
   * `played` : il a rejoint et joué jusqu'au bout. `crashed` : son jeu a planté. `kicked` : le serveur l'a déconnecté.
   * `not-joined` : il n'a pas rejoint à temps.
   */
  outcome: 'played' | 'crashed' | 'kicked' | 'not-joined'
  message: string
  /** Temps mis pour rejoindre, lancement du jeu compris. */
  joinedAfterMs: number | null
  crashReport: { file: string; description: string | null; suspects: string[]; excerpt: string } | null
  logTail: string[]
}

/** Partie de test : serveur dédié, puis de vrais clients qui le rejoignent, se dispersent et jouent un moment. */
export interface PlayerTestReport {
  profile: string
  profilePath: string
  startedAt: string
  durationMs: number
  /**
   * `passed` : tous les joueurs ont joué jusqu'au bout. `failed` : l'un d'eux (ou le serveur) a échoué.
   * `unavailable` : le test n'a pas pu être lancé (jeu jamais lancé depuis CurseForge, mémoire insuffisante…).
   */
  outcome: 'passed' | 'failed' | 'unavailable'
  message: string
  players: TestPlayer[]
  /** Le serveur de la partie (son démarrage et son journal). */
  server: ServerTestReport | null
  /** Erreurs du journal du premier client (tous ont les mêmes mods). */
  clientIssues: LogIssue[]
  modsSignature?: string | null
}

/** Derniers tests d'un profil, ou de la version qui a ces mods. */
export interface ProfileTestReports {
  files: StaticCheckReport | null
  server: ServerTestReport | null
  players: PlayerTestReport | null
}

/** Le bilan de ces tests, du plus complet au moins complet ; null s'il n'y en a aucun. */
export function testVerdict({ files, server, players }: ProfileTestReports): VersionTests | null {
  const dates = [files?.checkedAt, server?.startedAt, players?.startedAt].filter((d): d is string => Boolean(d)).sort()
  if (!dates.length) return null
  const at = dates.at(-1)!
  const errors = files?.findings.filter((f) => f.severity === 'error').length ?? 0
  if (errors) return { state: 'failed', summary: `${errors} erreur(s) dans les fichiers.`, at }
  if (players && players.outcome !== 'unavailable') {
    return players.outcome === 'passed' ? { state: 'passed', summary: players.message, at } : { state: 'failed', summary: players.message, at }
  }
  if (server) {
    return server.outcome === 'started'
      ? { state: 'partial', summary: 'Le serveur démarre, mais aucune partie avec des joueurs n’a été faite.', at }
      : { state: 'failed', summary: server.message, at }
  }
  return { state: 'partial', summary: 'Seuls les fichiers ont été vérifiés.', at }
}

/** Un dossier de CurseForge et ses profils ; `id` null : les profils rangés dans aucun dossier. */
export interface ProfileFolder {
  id: string | null
  name: string
  profiles: ProfileView[]
}

/** La vue du publieur : ses profils CurseForge, rangés comme dans CurseForge, face à ses modpacks. */
export interface PublisherLibrary {
  instancesDir: string | null
  /** Les dossiers de CurseForge par ordre alphabétique, puis les profils hors dossier. */
  folders: ProfileFolder[]
  /** Modpacks du dossier dont le profil source n'est pas (ou plus) dans CurseForge. */
  packsWithoutProfile: string[]
  error: string | null
}

export interface StudioOverview {
  settings: StudioSettings
  workspaceExists: boolean
  packs: PackView[]
  /** Zips posés à la racine du dossier, hors de tout modpack. */
  strayZips: string[]
  orphanPacks: OrphanPack[]
  /** Nombre de fichiers que « Ranger » renommerait. */
  toRange: number
  github: GitHubStatus
  /** null tant que GitHub n'a pas pu être lu. */
  plan: SyncPlan | null
}

export interface RangerRename {
  from: string
  to: string
  number: number
  /** Nouveau zip numéroté, ou zip déjà numéroté qu'on renomme au nom du dossier. */
  kind: 'new' | 'rename'
  warning: string | null
}

export interface RangerPackPlan {
  folder: string
  name: string
  renames: RangerRename[]
  errors: string[]
}

export interface RangerPlan {
  packs: RangerPackPlan[]
  total: number
}

/** Ordre choisi pour les zips à ranger, par dossier de modpack. */
export type RangerOrders = Record<string, string[]>

export type PublishStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface PublishProgress {
  steps: Array<{ tag: string; kind: SyncActionKind; label: string; status: PublishStepStatus; error?: string }>
  current: { text: string; done: number; total: number; bytesPerSecond: number } | null
}

export type PublishResult =
  | { ok: true; done: number }
  | { ok: false; cancelled: boolean; error: string; done: number }

export type CurseForgeInstanceInfo = CurseForgeProfile

export interface ZipProgress {
  done: number
  total: number
}

export type ActionResult = { ok: true } | { ok: false; error: string }

/** Une version du dossier lié d'un mod, pas encore dans le Studio. */
export interface AvailableModVersion {
  version: string
  files: Array<{ fileName: string; loaders: ContentLoader[]; minecraftVersions: string[] }>
}

/** Fichier d'un zip de modpack, chemin relatif au dossier de l'instance. */
export interface ZipFileEntry {
  path: string
  size: number
}

/** Mod d'un zip : un .jar du dossier mods, avec son nom CurseForge quand minecraftinstance.json le connaît. */
export interface ZipMod {
  fileName: string
  size: number
  /** `.jar.disabled` : désactivé dans CurseForge, ignoré par le jeu. */
  disabled: boolean
  /** Projet CurseForge du mod, quand minecraftinstance.json le connaît. */
  addonId: number | null
  name: string | null
  author: string | null
  /** Page CurseForge du mod. */
  url: string | null
}

export interface ZipContents {
  /** Dossier de l'instance dans le zip ('' : à la racine). */
  root: string
  files: ZipFileEntry[]
  mods: ZipMod[]
}

export type ZipEntryPreview =
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'binary' }
  | { kind: 'too-large' }

export type ImportResult = { ok: true; zips: number; cover: boolean; ignored: string[] } | { ok: false; error: string }

/** API exposée à la fenêtre du studio par son preload (`window.studio`). */
export interface StudioApi {
  getOverview(options?: { refreshRemote?: boolean }): Promise<StudioOverview>
  onChanged(listener: () => void): () => void
  onAnalyzing(listener: (fileName: string | null) => void): () => void

  pickWorkspaceDir(): Promise<boolean>
  useDefaultWorkspace(): Promise<ActionResult>

  createPack(name: string): Promise<ActionResult>
  /** Fiche ; `group` absent : groupe inchangé, vide ou null : retiré de son groupe. */
  updatePackInfo(folder: string, info: { name: string; description: string; group?: string | null }): Promise<ActionResult>
  updatePackSettings(folder: string, settings: PackSettings): Promise<ActionResult>
  pickCover(folder: string): Promise<ActionResult>
  removeCover(folder: string): Promise<ActionResult>
  /** Notes d'une version : numéro d'un modpack, ou version déclarée d'un mod. */
  setNotes(folder: string, version: number | string, notes: string): Promise<ActionResult>
  importFiles(folder: string, paths: string[]): Promise<ImportResult>

  getRangerPlan(orders?: RangerOrders): Promise<RangerPlan>
  applyRanger(orders?: RangerOrders): Promise<ActionResult & { renamed?: number }>

  publish(fingerprint: string): Promise<PublishResult>
  cancelPublish(): Promise<void>
  onPublishProgress(listener: (progress: PublishProgress) => void): () => void

  /** Zip à la corbeille et release retirée de GitHub. */
  deleteVersion(folder: string, version: number): Promise<PublishResult>
  /** Jars d'une version de mod à la corbeille et release retirée de GitHub. */
  deleteModVersion(folder: string, version: string): Promise<PublishResult>

  /** Choisit le dossier où le projet d'un mod dépose ses jars, puis crée le mod avec sa version la plus récente. */
  createModFromSource(kind?: 'mod' | 'plugin'): Promise<{ ok: true; folder: string | null } | { ok: false; error: string }>
  /** Versions du dossier lié d'un mod qui ne sont pas encore dans le Studio. */
  availableModVersions(folder: string): Promise<{ ok: true; versions: AvailableModVersion[] } | { ok: false; error: string }>
  importModVersions(folder: string, versions: string[]): Promise<{ ok: true; imported: string[] } | { ok: false; error: string }>
  /** Lie un mod, un pack de ressources ou un shader à un autre dossier (choisi dans une fenêtre), ou retire le lien (null). */
  linkModSource(folder: string, mode: 'pick' | null): Promise<ActionResult>
  /** Crée un pack de ressources ou un shader depuis un dossier (qui reste lié) ou un zip, choisi dans une fenêtre. */
  createPackContent(kind: 'resourcepack' | 'shader', from: 'folder' | 'zip'): Promise<{ ok: true; folder: string | null } | { ok: false; error: string }>
  /** Zippe le dossier lié d'un pack comme sa version suivante. */
  zipContentVersion(folder: string): Promise<{ ok: true; number: number } | { ok: false; error: string }>
  /** Versions de Minecraft d'un pack, à la place de celles de son zip ([] : celles du zip). */
  setMinecraftVersions(folder: string, versions: string[]): Promise<{ ok: true; versions: string[] } | { ok: false; error: string }>
  publishModCurseForge(
    folder: string,
    version: string,
    releaseType: 'release' | 'beta' | 'alpha'
  ): Promise<{ ok: true; fileIds: number[]; unknownDependencies: string[] } | { ok: false; error: string }>
  /** Lie un mod à son projet Modrinth (adresse, slug ou identifiant). */
  linkModrinth(folder: string, ref: string): Promise<{ ok: true; projectId: string; slug: string; url: string } | { ok: false; error: string }>
  publishModrinth(
    folder: string,
    version: string,
    releaseType: 'release' | 'beta' | 'alpha'
  ): Promise<{ ok: true; versionId: string; unknownDependencies: string[] } | { ok: false; error: string }>
  modrinthVersions(folder: string): Promise<{ ok: true; versions: ModrinthVersionView[] } | { ok: false; error: string }>
  /** Lie un plugin à son projet Hangar (adresse ou nom). */
  linkHangar(folder: string, ref: string): Promise<{ ok: true; slug: string; owner: string; url: string } | { ok: false; error: string }>
  publishHangar(folder: string, version: string, releaseType: 'release' | 'beta' | 'alpha'): Promise<{ ok: true; version: string } | { ok: false; error: string }>
  hangarVersions(folder: string): Promise<{ ok: true; versions: HangarVersionView[] } | { ok: false; error: string }>
  /** Dossier à la corbeille et toutes les releases du modpack retirées de GitHub. */
  deletePack(folder: string): Promise<PublishResult>
  /** Releases sans zip dans le dossier, retirées sans attendre la publication. */
  deleteReleases(tags: string[]): Promise<PublishResult>

  listInstances(): Promise<{ dir: string; instances: CurseForgeInstanceInfo[] }>
  zipInstance(folder: string, instancePath: string, includeSaves: boolean): Promise<ActionResult & { fileName?: string }>
  getLibrary(): Promise<PublisherLibrary>
  /** Lie un modpack à un profil CurseForge (son dossier), ou retire le lien (null). */
  linkProfile(folder: string, profilePath: string | null): Promise<ActionResult>
  /** Mises à jour des mods d'un profil (lecture seule). */
  checkUpdates(profilePath: string, channel: UpdateChannel): Promise<{ ok: true; plan: UpdatePlan } | { ok: false; error: string }>
  /** Crée la copie d'essai du profil avec ces mises à jour (projets `only`). */
  applyUpdates(
    profilePath: string,
    channel: UpdateChannel,
    only: number[]
  ): Promise<{ ok: true; result: TrialResult } | { ok: false; error: string }>
  onUpdateProgress(listener: (progress: { done: number; total: number; name: string }) => void): () => void
  promoteTrial(profilePath: string): Promise<{ ok: true; promoted: string[] } | { ok: false; error: string }>
  /** Lie un modpack à son projet CurseForge (numéro, slug ou page). */
  linkCurseForge(
    folder: string,
    ref: string
  ): Promise<{ ok: true; projectId: number; name: string; highestVersion: number; overrides: string[] } | { ok: false; error: string }>
  /** Fichiers joints à l'export CurseForge, publication sur GitHub, ou retrait du lien. */
  updatePublishTargets(
    folder: string,
    changes: { overrides?: string[]; github?: boolean; unlinkCurseForge?: boolean; unlinkModrinth?: boolean; unlinkHangar?: boolean }
  ): Promise<ActionResult>
  publishCurseForge(folder: string, version: number, releaseType: 'release' | 'beta' | 'alpha'): Promise<{ ok: true; fileId: number } | { ok: false; error: string }>
  onCurseForgeProgress(listener: (text: string) => void): () => void
  /** Toutes les versions du projet CurseForge du modpack, de la plus récente à la plus ancienne. */
  curseForgeVersions(folder: string): Promise<{ ok: true; versions: CurseForgeVersion[] } | { ok: false; error: string }>
  /** Mises à jour automatiques : réglages et derniers passages de chaque modpack, tâche planifiée, Claude. */
  maintenanceStatus(): Promise<MaintenanceStatus & { claude: boolean }>
  configureUpdates(folder: string, changes: Partial<PackUpdates>): Promise<{ ok: true; updates: PackUpdates } | { ok: false; error: string }>
  /** Passage immédiat des modpacks donnés (mises à jour, essai, tests). */
  runMaintenance(folders: string[]): Promise<{ ok: true; records: MaintenanceRecord[] } | { ok: false; error: string }>
  cancelMaintenance(): Promise<void>
  onMaintenanceProgress(listener: (text: string) => void): () => void
  /** Valide l'essai en attente : version suivante créée, publiée si `publish`. */
  validateUpdate(folder: string, publish: boolean): Promise<{ ok: true; record: MaintenanceRecord } | { ok: false; error: string }>
  discardUpdate(folder: string): Promise<{ ok: true; record: MaintenanceRecord } | { ok: false; error: string }>
  /** Crée (ou remplace) la tâche planifiée, ou la retire (null). */
  scheduleMaintenance(schedule: { time: string; wake: boolean } | null): Promise<{ ok: true; task: MaintenanceTask } | { ok: false; error: string }>
  setMaintenanceClaude(enabled: boolean): Promise<void>
  /** Vérifie les fichiers du profil sans lancer le jeu. */
  checkProfile(profilePath: string): Promise<{ ok: true; report: StaticCheckReport } | { ok: false; error: string }>
  /** Démarre un serveur dédié avec les mods du profil (étapes : onTestProgress). */
  testServer(profilePath: string): Promise<{ ok: true; report: ServerTestReport } | { ok: false; error: string }>
  /** Partie de test : serveur, puis `players` vrais clients qui le rejoignent et jouent (étapes : onTestProgress). */
  testPlayers(profilePath: string, players?: number): Promise<{ ok: true; report: PlayerTestReport } | { ok: false; error: string }>
  /** Tous les tests à la suite : fichiers, puis partie avec des joueurs (serveur compris). */
  testAll(profilePath: string, players?: number): Promise<{ ok: true; reports: ProfileTestReports } | { ok: false; error: string }>
  onTestProgress(listener: (text: string) => void): () => void
  cancelTest(): Promise<void>
  /** Derniers rapports de test du profil. */
  lastTests(profilePath: string): Promise<ProfileTestReports>
  discardTrial(profilePath: string): Promise<ActionResult>
  /** Crée un modpack depuis un profil, et sa v1 : le profil lui est lié. */
  createPackFromProfile(name: string, profilePath: string, includeSaves: boolean): Promise<ActionResult & { folder?: string }>
  /** Retire d'un zip du modpack les fichiers exclus dans ses réglages (même progression que la création d'un zip). */
  stripExcluded(folder: string, fileName: string): Promise<ActionResult & { removed?: number }>
  cancelZip(): Promise<void>
  onZipProgress(listener: (progress: ZipProgress) => void): () => void

  /** Contenu d'un zip du dossier d'un modpack (version rangée ou zip déposé). */
  getZipContents(folder: string, fileName: string): Promise<ZipContents>
  previewZipEntry(folder: string, fileName: string, path: string): Promise<ZipEntryPreview>

  openPath(path: string): Promise<void>
  getPathForFile(file: File): string
}
