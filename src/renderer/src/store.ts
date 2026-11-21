import { create } from 'zustand';
import { findRelease, releaseHasChanges } from '../../shared/changelog';
import { findPresentVersions, type PresentVersion } from '../../shared/presence';
import { sameRepo } from '../../shared/repo';
import type {
  AppUpdateProgress,
  AppView,
  Catalog,
  CurseForgeProfile,
  CurseForgeStatus,
  InstalledModpack,
  InstallProgress,
  InstallResult,
  ModpackVersion,
  RoleResult,
  Settings,
  ShortcutLocation,
  ShortcutStatus,
  WindowState,
} from '../../shared/types';
import type { ToastItem as Toast } from './components/Toasts';
import { changelog, CHANGELOG_PAGE } from './docs/content';
import { showDocs, useDocs } from './docs/store';
import { APP_NAME } from '../../shared/config';
import type { AppearanceSettings } from '../../shared/appearance';

interface State {
  catalog: Catalog | null;
  loading: boolean;
  refreshing: boolean;
  installed: InstalledModpack[];
  /** Tous les profils CurseForge, y compris ceux que l'application n'a pas installés. */
  profiles: CurseForgeProfile[];
  /** Versions publiées retrouvées dans le CurseForge de l'utilisateur (installées ou reconnues à leurs mods). */
  present: PresentVersion[];
  curseForge: CurseForgeStatus | null;
  shortcut: ShortcutStatus | null;
  settings: Settings | null;
  appVersion: string;
  windowState: WindowState;
  progress: InstallProgress | null;
  busyId: string | null;
  selectedId: string | null;
  settingsOpen: boolean;
  /** Formulaire « Signaler un problème ». */
  reportOpen: boolean;
  toasts: Toast[];
  appUpdateProgress: AppUpdateProgress | null;
  /** Version dont la proposition de mise à jour a été remise à plus tard (jusqu'au prochain lancement). */
  updateDismissed: string | null;
  /** Vue affichée : la bibliothèque, ou le studio pour un publieur. */
  view: AppView;

  init(): Promise<void>;
  refresh(force?: boolean): Promise<void>;
  refreshLocal(): Promise<void>;
  install(version: ModpackVersion): Promise<void>;
  cancelInstall(): void;
  launchCurseForge(): Promise<void>;
  /** Ferme puis rouvre CurseForge, pour qu'il affiche un modpack installé pendant qu'il était ouvert. */
  restartCurseForge(): Promise<void>;
  select(id: string | null): void;
  setSettingsOpen(open: boolean): void;
  setReportOpen(open: boolean): void;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  /** Style ou taille de l'interface : appliqué tout de suite, puis enregistré (sans relire les profils). */
  updateAppearance(patch: Partial<AppearanceSettings>): Promise<void>;
  pickInstancesDir(): Promise<void>;
  createShortcut(location: ShortcutLocation): Promise<void>;
  /**
   * Enregistre un changement de rôle réussi : la vue suit le rôle (le studio pour un publieur, la bibliothèque
   * pour un récepteur) et le catalogue est rechargé si le dépôt a changé.
   */
  applyRoleResult(result: RoleResult): Promise<void>;
  setView(view: AppView): void;
  openStudio(): void;
  installAppUpdate(): Promise<void>;
  cancelAppUpdate(): void;
  /** « Plus tard » : la proposition se replie dans la barre de titre. */
  dismissAppUpdate(): void;
  showAppUpdate(): void;
  /** Recherche demandée dans les paramètres : dit aussi quand il n'y a rien de nouveau. */
  checkAppUpdate(): Promise<void>;
  pushToast(toast: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
}

function presentIn(
  catalog: Catalog | null,
  installed: InstalledModpack[],
  profiles: CurseForgeProfile[],
): PresentVersion[] {
  if (!catalog) return [];
  return findPresentVersions(
    catalog.modpacks.flatMap((modpack) => modpack.versions),
    installed,
    profiles,
  );
}

let toastSeq = 0;
let restartingCurseForge = false;
let initialized = false;
// Seule la réponse à la dernière lecture demandée est gardée (changement de dépôt pendant une lecture…).
let catalogSeq = 0;

export const useStore = create<State>((set, get) => ({
  catalog: null,
  loading: true,
  refreshing: false,
  installed: [],
  profiles: [],
  present: [],
  curseForge: null,
  shortcut: null,
  settings: null,
  appVersion: '',
  windowState: 'maximized',
  progress: null,
  busyId: null,
  selectedId: null,
  settingsOpen: false,
  reportOpen: false,
  toasts: [],
  appUpdateProgress: null,
  updateDismissed: null,
  view: 'library',

  async init() {
    if (initialized) return;
    initialized = true;
    window.api.onInstallProgress((progress) => set({ progress }));
    // Vérifications régulières faites par l'application (main/backgroundUpdate.ts), fenêtre ouverte ou cachée.
    window.api.onCatalog((catalog) => {
      if (get().loading) return;
      ++catalogSeq;
      // Panne passagère : on garde la liste affichée plutôt que de l'annoncer.
      if (catalog.error && !get().catalog?.error) return;
      set({ catalog, present: presentIn(catalog, get().installed, get().profiles) });
    });
    // Mise à jour automatique d'un modpack installé : suivie comme une installation lancée à la main.
    window.api.onAutoInstall((event) => {
      if (event.kind === 'start') {
        set({
          busyId: event.version.id,
          progress: {
            id: event.version.id,
            version: event.version.version,
            phase: 'preparing',
            done: 0,
            total: 0,
            bytesPerSecond: 0,
          },
        });
        return;
      }
      set({ busyId: null, progress: null });
      if (event.announce) announceInstall(event.version, event.result, true);
      void get().refreshLocal();
    });
    window.api.onAppUpdateProgress((appUpdateProgress) => set({ appUpdateProgress }));
    window.api.onWindowStateChange((windowState) => set({ windowState }));
    window.api.onActivated((view) => {
      void get().refreshLocal();
      if (view) get().setView(view);
    });
    const [settings, appVersion, launch] = await Promise.all([
      window.api.getSettings(),
      window.api.getAppVersion(),
      window.api.getLaunchInfo(),
    ]);
    // Un publieur retrouve la dernière vue utilisée (ou le studio avec --studio).
    const view = settings.role === 'publisher' ? (launch.view ?? settings.lastView) : 'library';
    set({ settings, appVersion, view });
    if (launch.justUpdated) {
      // Les nouveautés reçues depuis la version précédente sont mises en avant dans l'aide.
      useDocs.getState().setUpdatedFrom(launch.previousVersion);
      const notes = findRelease(changelog, appVersion);
      get().pushToast({
        kind: 'success',
        title: 'Application mise à jour',
        message: `Tu utilises maintenant la version ${appVersion}.`,
        ...(notes && releaseHasChanges(notes)
          ? { action: { label: 'Voir les nouveautés', run: () => showDocs(CHANGELOG_PAGE) }, sticky: true }
          : {}),
      });
    }
    await Promise.all([get().refresh(), get().refreshLocal()]);
    // Paramètres → Démarrage et mises à jour : la version proposée s'installe d'elle-même au lancement (ensuite, en
    // arrière-plan : main/backgroundUpdate.ts).
    const update = get().catalog?.appUpdate;
    if (launch.autoUpdate && update) {
      get().pushToast({
        kind: 'info',
        title: 'Mise à jour automatique',
        message: `Installation de la version ${update.version}…`,
      });
      await get().installAppUpdate();
    }
  },

  async refresh(force = false) {
    const seq = ++catalogSeq;
    set({ refreshing: true });
    try {
      const catalog = await window.api.getCatalog(force);
      if (seq !== catalogSeq) return;
      set({ catalog, present: presentIn(catalog, get().installed, get().profiles) });
      if (force && catalog.error)
        get().pushToast({ kind: 'error', title: 'Actualisation impossible', message: catalog.error });
    } finally {
      if (seq === catalogSeq) set({ loading: false, refreshing: false });
    }
  },

  async refreshLocal() {
    const [installed, profiles, curseForge, shortcut, settings] = await Promise.all([
      window.api.getInstalled(),
      window.api.getProfiles(),
      window.api.getCurseForgeStatus(),
      window.api.getShortcutStatus(),
      window.api.getSettings(),
    ]);
    const catalog = get().catalog;
    set({ installed, profiles, present: presentIn(catalog, installed, profiles), curseForge, shortcut, settings });
    if (settings.role !== 'publisher' && get().view === 'studio') set({ view: 'library' });
    // Le dépôt a pu être changé ailleurs (script, autre session) : on recharge ses modpacks.
    if (catalog && !sameRepo(catalog.repo, settings.repo)) await get().refresh(true);
  },

  async install(version) {
    if (get().busyId) return;
    set({
      busyId: version.id,
      progress: { id: version.id, version: version.version, phase: 'preparing', done: 0, total: 0, bytesPerSecond: 0 },
    });
    try {
      const result = await window.api.install(version);
      announceInstall(version, result, false);
    } finally {
      set({ busyId: null, progress: null });
      await get().refreshLocal();
    }
  },

  cancelInstall() {
    const id = get().busyId;
    if (id) void window.api.cancelInstall(id);
  },

  async restartCurseForge() {
    if (restartingCurseForge) return;
    restartingCurseForge = true;
    get().pushToast({
      kind: 'info',
      title: 'Relance de CurseForge…',
      message: 'Il se ferme puis se rouvre avec tous ses profils.',
    });
    try {
      const result = await window.api.restartCurseForge();
      get().pushToast(
        result.ok
          ? {
              kind: 'success',
              title: 'CurseForge relancé',
              message: 'Les modpacks installés sont dans l’onglet Minecraft.',
            }
          : { kind: 'error', title: 'CurseForge n’a pas été relancé', message: result.error },
      );
    } catch (err) {
      get().pushToast({ kind: 'error', title: 'CurseForge n’a pas été relancé', message: String(err) });
    } finally {
      restartingCurseForge = false;
    }
  },

  async launchCurseForge() {
    const ok = await window.api.launchCurseForge();
    if (!ok) {
      get().pushToast({
        kind: 'error',
        title: 'CurseForge introuvable',
        message: 'Installe l’application CurseForge pour jouer aux modpacks.',
      });
    }
  },

  select(selectedId) {
    set({ selectedId });
  },

  setSettingsOpen(settingsOpen) {
    set({ settingsOpen });
  },

  setReportOpen(reportOpen) {
    // Ouvert depuis les paramètres : un seul dialogue à la fois.
    set(reportOpen ? { reportOpen, settingsOpen: false } : { reportOpen });
  },

  async updateSettings(patch) {
    const settings = await window.api.updateSettings(patch);
    set({ settings });
    await get().refreshLocal();
  },

  async updateAppearance(patch) {
    const current = get().settings;
    if (!current) return;
    const appearance = { ...current.appearance, ...patch };
    set({ settings: { ...current, appearance } });
    set({ settings: await window.api.updateSettings({ appearance }) });
  },

  async pickInstancesDir() {
    const settings = await window.api.pickInstancesDir();
    if (settings) {
      set({ settings });
      await get().refreshLocal();
    }
  },

  async createShortcut(location) {
    const result = await window.api.createShortcut(location);
    if (result.ok) {
      const onDesktop = result.path.toLowerCase() === get().shortcut?.desktopPath.toLowerCase();
      get().pushToast({
        kind: 'success',
        title: 'Raccourci créé',
        message: onDesktop ? `${APP_NAME} est maintenant sur ton bureau.` : result.path,
      });
      set({ settings: await window.api.getSettings(), shortcut: await window.api.getShortcutStatus() });
    } else if (!result.cancelled) {
      get().pushToast({ kind: 'error', title: 'Raccourci non créé', message: result.error });
    }
  },

  async applyRoleResult(result) {
    if (!result.ok) return;
    const previous = get().settings;
    set({ settings: result.settings });
    if (previous?.role !== result.settings.role) {
      // Changement de rôle : on referme les paramètres et on montre tout de suite la vue du nouveau rôle.
      set({ settingsOpen: false });
      get().setView(result.settings.role === 'publisher' ? 'studio' : 'library');
    }
    if (result.warning) get().pushToast({ kind: 'info', title: 'Dépôt privé', message: result.warning });
    if (!previous || !sameRepo(previous.repo, result.settings.repo)) await get().refresh(true);
  },

  setView(view) {
    const next = view === 'studio' && get().settings?.role !== 'publisher' ? 'library' : view;
    if (next === get().view) return;
    set({ view: next, selectedId: null });
    void window.api.updateSettings({ lastView: next });
  },

  openStudio() {
    set({ settingsOpen: false });
    get().setView('studio');
  },

  async installAppUpdate() {
    const update = get().catalog?.appUpdate;
    if (!update || get().appUpdateProgress) return;
    set({ appUpdateProgress: { phase: 'downloading', done: 0, total: update.installerSize } });
    const result = await window.api.installAppUpdate();
    // Réussite : l'installeur est lancé et l'application se ferme d'elle-même.
    if (result.ok) return;
    set({ appUpdateProgress: null });
    if (result.reason === 'busy') {
      get().pushToast({ kind: 'info', title: 'Mise à jour reportée', message: result.error });
    } else if (result.reason === 'failed') {
      get().pushToast({
        kind: 'error',
        title: 'Mise à jour impossible',
        message: result.error,
        action: { label: 'Télécharger depuis GitHub', run: () => void window.api.openExternal(update.releaseUrl) },
      });
    }
  },

  cancelAppUpdate() {
    void window.api.cancelAppUpdate();
  },

  dismissAppUpdate() {
    set({ updateDismissed: get().catalog?.appUpdate?.version ?? null });
  },

  showAppUpdate() {
    set({ updateDismissed: null });
  },

  async checkAppUpdate() {
    await get().refresh(true);
    const catalog = get().catalog;
    // Hors ligne : `refresh` l'a déjà signalé.
    if (!catalog || catalog.error) return;
    if (catalog.appUpdate) {
      // La proposition est en haut de la fenêtre : on la montre, même remise à plus tard.
      set({ updateDismissed: null, settingsOpen: false });
    } else {
      get().pushToast({
        kind: 'success',
        title: 'Application à jour',
        message: `La version ${get().appVersion} est la plus récente.`,
      });
    }
  },

  pushToast(toast) {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    if (!toast.sticky) setTimeout(() => get().dismissToast(id), toast.kind === 'error' ? 10_000 : 7_000);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Notification de fin d'une installation : lancée à la main, ou mise à jour automatique (`auto`). */
function announceInstall(version: ModpackVersion, result: InstallResult, auto: boolean): void {
  const { pushToast, restartCurseForge, launchCurseForge } = useStore.getState();
  if (result.ok) {
    const title = result.updated ? `${version.name} est à jour` : `${version.name} est installé`;
    const n = result.keptConfigs;
    const kept =
      n > 0
        ? ` ${n} fichier${n > 1 ? 's' : ''} de configuration que tu avais modifié${n > 1 ? 's ont' : ' a'} été gardé${n > 1 ? 's' : ''}.`
        : '';
    const done = auto ? `Version ${version.version} installée automatiquement. ` : '';
    if (result.curseForgeRunning) {
      // CurseForge ne relit ses profils qu'au démarrage : ouvert pendant l'installation, il peut ne pas voir celui-ci.
      pushToast({
        kind: 'success',
        title,
        message: `${done}CurseForge était déjà ouvert : s’il n’affiche pas encore ${auto ? 'la nouvelle version' : 'ce modpack'}, relance-le.${kept}`,
        action: { label: 'Relancer CurseForge', run: () => void restartCurseForge() },
        sticky: true,
      });
    } else if (auto) {
      pushToast({ kind: 'success', title, message: `${done.trim()}${kept}` });
    } else {
      pushToast({
        kind: 'success',
        title,
        message: `${
          result.curseForgeLaunched
            ? 'CurseForge est ouvert : lance le profil depuis l’onglet Minecraft.'
            : 'Le profil est disponible dans CurseForge, onglet Minecraft.'
        }${kept}`,
        action: result.curseForgeLaunched
          ? undefined
          : { label: 'Ouvrir CurseForge', run: () => void launchCurseForge() },
      });
    }
  } else if (result.cancelled) {
    pushToast({ kind: 'info', title: auto ? `Mise à jour de ${version.name} annulée` : 'Installation annulée' });
  } else {
    pushToast({
      kind: 'error',
      title: auto
        ? `Mise à jour automatique de ${version.name} impossible`
        : `Échec de l’installation de ${version.name}`,
      message: result.error,
    });
  }
}
