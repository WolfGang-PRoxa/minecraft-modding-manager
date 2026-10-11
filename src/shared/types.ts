/** Contenu de l'asset `modpack.json` attaché à chaque release de modpack. */
export interface ModpackManifest {
  schema: 1
  id: string
  name: string
  version: string
  minecraftVersion: string | null
  modLoader: string | null
  modCount: number | null
  description: string
  archive: string
  archiveSize: number
  archiveSha256: string | null
  cover: string | null
  /** Empreinte de l'image : permet au studio de savoir si elle a changé. */
  coverSha256?: string | null
  /** Empreinte des mods : permet de reconnaître cette version dans un profil CurseForge. */
  modsSignature?: string | null
  /** Fichiers du dossier mods installés désactivés : le joueur peut les activer dans CurseForge. Absent : aucun. */
  disabledMods?: string[]
  /** Une mise à jour garde les fichiers du dossier config que le joueur a modifiés. Absent : non. */
  keepPlayerConfigs?: boolean
  author: string | null
  createdAt: string
}

/** Une version publiée d'un modpack (= une release GitHub). */
export interface ModpackVersion {
  id: string
  name: string
  version: string
  minecraftVersion: string | null
  modLoader: string | null
  modCount: number | null
  description: string
  tag: string
  notes: string
  prerelease: boolean
  publishedAt: string
  archiveUrl: string
  archiveSize: number
  archiveSha256: string | null
  /** Empreinte des mods (absente des versions publiées avant qu'elle existe). */
  modsSignature: string | null
  /** Fichiers du dossier mods installés désactivés. */
  disabledMods: string[]
  /** Une mise à jour garde les fichiers du dossier config que le joueur a modifiés. */
  keepPlayerConfigs: boolean
  coverUrl: string | null
  releaseUrl: string
}

/** Un modpack et toutes ses versions, de la plus récente à la plus ancienne. */
export interface Modpack {
  id: string
  latest: ModpackVersion
  versions: ModpackVersion[]
}

/** Version de l'application publiée sur GitHub. */
export interface AppReleaseNotes {
  version: string
  publishedAt: string
  /** Texte de la release, tiré de CHANGELOG.md par la CI : ses rubriques sont les nouveautés de la version. */
  notes: string
  url: string
}

export interface AppUpdateInfo {
  version: string
  /** Les versions plus récentes que celle qui tourne, jusqu'à celle proposée, de la plus récente à la plus ancienne. */
  releases: AppReleaseNotes[]
  releaseUrl: string
  installerUrl: string
  installerSize: number
  /** Empreinte de l'installeur publiée par GitHub, comparée à celle du fichier téléchargé. */
  installerSha256: string | null
}

export interface Catalog {
  /** Dépôt d'où viennent les modpacks. */
  repo: RepoRef
  modpacks: Modpack[]
  appUpdate: AppUpdateInfo | null
  fetchedAt: string | null
  /** Renseigné quand GitHub n'a pas pu être joint : le catalogue vient alors du cache. */
  error: string | null
}

/** Contenu du fichier marqueur déposé dans une instance installée. */
export interface InstanceMarker {
  id: string
  version: string
  tag: string
  installedAt: string
  /** Entrées de premier niveau fournies par le modpack (pour nettoyer lors d'une mise à jour). */
  managedEntries: string[]
  /**
   * Empreinte SHA-1 de chaque fichier du dossier config fourni par cette version, par chemin (« config/x.toml ») :
   * un fichier qui ne correspond plus a été modifié par le joueur. Absent des installations antérieures.
   */
  configFiles?: Record<string, string>
  /** Mods que cette version installe désactivés (clés de modKey) : un mod dans l'autre état a été changé par le joueur. */
  disabledByDefault?: string[]
}

/** Modpack installé par l'application, tel que la fenêtre le voit (sans les empreintes du marqueur). */
export interface InstalledModpack extends Pick<InstanceMarker, 'id' | 'version' | 'tag' | 'installedAt' | 'managedEntries'> {
  instanceName: string
  instancePath: string
}

export type CurseForgeFlavor = 'overwolf' | 'standalone'

export interface CurseForgeStatus {
  installed: boolean
  flavor: CurseForgeFlavor | null
  instancesDir: string
  instancesDirSource: 'settings' | 'curseforge' | 'default'
  instancesDirExists: boolean
}

/** Profil du dossier Instances de CurseForge, qu'il ait été créé par l'application ou non. */
/** Un profil du dossier Instances de CurseForge (son dossier et son minecraftinstance.json). */
export interface CurseForgeProfile {
  /** Nom du dossier du profil, celui que CurseForge affiche. */
  name: string
  path: string
  /** Empreinte de ses mods (null s'il n'en a pas), à comparer à celle des versions publiées. */
  modsSignature: string | null
  /** Identifiant du profil pour CurseForge : il ne change pas si le profil est renommé. */
  guid: string | null
  /** Dossier de CurseForge où le profil est rangé (CurseForgeGroup), null s'il n'est dans aucun. */
  groupId: string | null
  minecraftVersion: string | null
  /** Chargeur tel que CurseForge l'écrit (« neoforge-21.1.215 »). */
  modLoader: string | null
  /** Mods actifs (.jar du dossier mods). */
  modCount: number | null
  lastPlayed: string | null
  /** Projet CurseForge du modpack dont ce profil est une installation ; null pour un profil personnel. */
  curseforgeProjectId: number | null
  /** Version installée par cette application depuis GitHub (marqueur du profil), sinon null. */
  installedPack: { id: string; version: string } | null
}

/** Un dossier de CurseForge, dans lequel l'utilisateur range ses profils (un seul niveau). */
export interface CurseForgeGroup {
  id: string
  name: string
}

export interface RepoRef {
  owner: string
  name: string
}

/** Récepteur : installe les modpacks. Publieur : les publie aussi, avec le Modpack Studio. */
export type UserRole = 'receiver' | 'publisher'

/** Vues de la fenêtre : la bibliothèque (tout le monde) et le studio (publieurs). */
export type AppView = 'library' | 'studio'

/** Fenêtre normale, agrandie (au lancement) ou en plein écran (F11). */
export type WindowState = 'normal' | 'maximized' | 'fullscreen'

export interface Settings {
  /** Dossier Instances choisi manuellement (null = détection automatique). */
  instancesDir: string | null
  openCurseForgeAfterInstall: boolean
  /** La proposition de raccourci sur le bureau a déjà reçu une réponse. */
  shortcutPrompted: boolean
  /** null tant que le premier lancement n'a pas eu lieu. */
  role: UserRole | null
  /** Dépôt des modpacks : lu par l'application, géré par le studio pour un publieur. */
  repo: RepoRef
  /** Dossier des modpacks du studio (un sous-dossier par modpack). */
  workspaceDir: string | null
  /** Dernière vue affichée, rouverte au lancement suivant. */
  lastView: AppView
  /** Version de l'application au dernier lancement : sert à annoncer qu'une mise à jour vient d'être installée. */
  lastRunVersion: string | null
}

/** D'où vient la connexion GitHub : connexion faite dans l'application, ou repli sur une session existante. */
export type CredentialSource = 'login' | 'env' | 'dotenv' | 'gh'

export interface GitHubAccount {
  login: string
  avatarUrl: string | null
  source: CredentialSource
}

export interface AuthStatus {
  account: GitHubAccount | null
  error: string | null
  /** « Se connecter avec GitHub » est configuré (sinon, seul le jeton est proposé). */
  deviceLoginAvailable: boolean
}

export interface DeviceLogin {
  userCode: string
  verificationUri: string
  expiresAt: string
}

export type LoginResult = { ok: true; account: GitHubAccount } | { ok: false; cancelled: boolean; error: string }

/** Connexion GitHub, commune à l'application et au studio. */
export interface AuthApi {
  getAuthStatus(): Promise<AuthStatus>
  /** Démarre la connexion par code : ouvre github.com/login/device dans le navigateur. */
  startDeviceLogin(): Promise<{ ok: true; login: DeviceLogin } | { ok: false; error: string }>
  /** Attend que le code soit validé sur GitHub. */
  waitDeviceLogin(): Promise<LoginResult>
  cancelDeviceLogin(): Promise<void>
  loginWithToken(token: string): Promise<LoginResult>
  logout(): Promise<AuthStatus>
}

export interface RepoInfo {
  repo: RepoRef
  ownerAvatarUrl: string | null
  private: boolean
}

export type RoleResult =
  | { ok: true; settings: Settings; account: GitHubAccount | null; warning: string | null }
  | { ok: false; error: string; needsLogin: boolean }

export interface ShortcutStatus {
  /** Emplacement du raccourci sur le bureau. */
  desktopPath: string
  onDesktop: boolean
}

export type ShortcutLocation = 'desktop' | 'choose'

export type ShortcutResult = { ok: true; path: string } | { ok: false; cancelled: boolean; error?: string }

export type InstallPhase = 'preparing' | 'downloading' | 'verifying' | 'extracting' | 'finalizing'

export interface InstallProgress {
  id: string
  version: string
  phase: InstallPhase
  /** Octets traités dans la phase courante. */
  done: number
  /** Total de la phase courante (0 si inconnu). */
  total: number
  bytesPerSecond: number
}

export type InstallResult =
  | {
      ok: true
      installed: InstalledModpack
      updated: boolean
      curseForgeLaunched: boolean
      /** CurseForge était déjà ouvert : il peut ne pas afficher le profil avant d'être relancé. */
      curseForgeRunning: boolean
      /** Fichiers de configuration modifiés par le joueur gardés à la place de ceux de la nouvelle version. */
      keptConfigs: number
    }
  | { ok: false; cancelled: boolean; error: string }

export type CurseForgeRestartResult = { ok: true } | { ok: false; error: string }

export interface AppUpdateProgress {
  /** `installing` : l'installeur est lancé, l'application se ferme. */
  phase: 'downloading' | 'installing'
  done: number
  total: number
}

/** `busy` : une opération en cours (installation d'un modpack, publication…) serait interrompue par le redémarrage. */
export type AppUpdateResult = { ok: true } | { ok: false; reason: 'cancelled' | 'busy' | 'failed'; error: string }

export interface LaunchInfo {
  /** Vue demandée au lancement (`--studio`), sinon null. */
  view: AppView | null
  /** L'application vient d'être mise à jour : annoncé une seule fois. */
  justUpdated: boolean
  /** Version utilisée avant cette mise à jour : ses nouveautés depuis sont mises en avant (null si inconnue). */
  previousVersion: string | null
}

export type ReportKind = 'bug' | 'suggestion'

/** Signalement saisi dans l'application : il devient une issue sur le dépôt de l'application. */
export interface IssueReport {
  kind: ReportKind
  title: string
  description: string
  /** Identifiant du modpack concerné, s'il y en a un. */
  modpackId: string | null
  /** Joindre la version de l'application, celle de Windows et l'état de CurseForge. */
  includeDiagnostics: boolean
}

export interface ReportInfo {
  /** Compte GitHub qui signera l'issue ; sans compte, le signalement s'ouvre dans le navigateur. */
  account: GitHubAccount | null
  /** Informations techniques proposées en complément. */
  diagnostics: string[]
}

export type ReportResult = { ok: true; number: number; url: string } | { ok: false; error: string }

/** Choix du rôle, commun à l'application et au studio. */
export interface RoleApi {
  /** Passe en récepteur ; un dépôt peut être fourni pour suivre les modpacks d'un autre publieur. */
  becomeReceiver(repo: string | null): Promise<RoleResult>
  /** Passe en publieur après avoir vérifié que le compte GitHub connecté peut publier sur le dépôt. */
  becomePublisher(repo: string): Promise<RoleResult>
}

/** Connexion de l'application à Claude Code (serveur MCP du moteur), pour les publieurs. */
export interface ClaudeCodeStatus {
  /** Le programme claude est présent sur ce PC. */
  installed: boolean
  /** Le serveur MCP de cette installation est enregistré dans Claude Code. */
  connected: boolean
  /** La commande à taper soi-même, si la connexion automatique est impossible. */
  manualCommand: string
}

export interface ClaudeApi {
  getClaudeCodeStatus(): Promise<ClaudeCodeStatus>
  connectClaudeCode(): Promise<{ ok: true } | { ok: false; error: string }>
}

/** `apiKey` : clé de l'API CurseForge (lire les mods) ; `uploadToken` : jeton d'auteur (mettre en ligne). */
export type CurseForgeSecretKind = 'apiKey' | 'uploadToken'

export interface CurseForgeSecretStatus {
  /** Où il a été trouvé : enregistré dans l'application, variable d'environnement, fichier .env ; null : absent. */
  source: 'saved' | 'env' | 'dotenv' | null
  /** Accepté par CurseForge (true), refusé (false), ou pas vérifié (null : absent ou CurseForge injoignable). */
  valid: boolean | null
  error: string | null
}

export interface CurseForgeAuthStatus {
  apiKey: CurseForgeSecretStatus
  uploadToken: CurseForgeSecretStatus
}

export interface CurseForgeAuthApi {
  getCurseForgeAuth(): Promise<CurseForgeAuthStatus>
  /** Vérifie puis enregistre (chiffré) un secret ; null le retire. */
  saveCurseForgeSecret(kind: CurseForgeSecretKind, value: string | null): Promise<{ ok: true } | { ok: false; error: string }>
}

/** API exposée au renderer par le preload (`window.api`). */
export interface RendererApi extends AuthApi, RoleApi, ClaudeApi, CurseForgeAuthApi {
  getLaunchInfo(): Promise<LaunchInfo>
  /** L'application a été relancée alors qu'elle tournait : relire l'état, et ouvrir la vue demandée. */
  onActivated(listener: (view: AppView | null) => void): () => void
  getCatalog(force?: boolean): Promise<Catalog>
  getInstalled(): Promise<InstalledModpack[]>
  getProfiles(): Promise<CurseForgeProfile[]>
  install(version: ModpackVersion): Promise<InstallResult>
  cancelInstall(id: string): Promise<void>
  onInstallProgress(listener: (progress: InstallProgress) => void): () => void
  getCurseForgeStatus(): Promise<CurseForgeStatus>
  launchCurseForge(): Promise<boolean>
  /** Ferme puis rouvre CurseForge, pour qu'il relise ses profils. */
  restartCurseForge(): Promise<CurseForgeRestartResult>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  pickInstancesDir(): Promise<Settings | null>
  getShortcutStatus(): Promise<ShortcutStatus>
  createShortcut(location: ShortcutLocation): Promise<ShortcutResult>
  openPath(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  getReportInfo(): Promise<ReportInfo>
  /** Crée l'issue avec le compte GitHub connecté. */
  submitReport(report: IssueReport): Promise<ReportResult>
  /** Ouvre la page « nouvelle issue » de GitHub, déjà remplie. */
  openReportInBrowser(report: IssueReport): Promise<void>
  getAppVersion(): Promise<string>
  /** Télécharge puis lance l'installeur de la dernière version : l'application se ferme et se relance toute seule. */
  installAppUpdate(): Promise<AppUpdateResult>
  cancelAppUpdate(): Promise<void>
  onAppUpdateProgress(listener: (progress: AppUpdateProgress) => void): () => void
  minimizeWindow(): void
  /** Agrandit la fenêtre ou la ramène au niveau inférieur ; en plein écran, en sort. */
  toggleMaximize(): void
  closeWindow(): void
  onWindowStateChange(listener: (state: WindowState) => void): () => void
}
