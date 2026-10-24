import { create } from 'zustand'
import type { ActionResult, PublisherLibrary, StudioOverview } from '../../../shared/studio'
import type { ToastItem } from '../components/Toasts'
import { useStore } from '../store'
import { useMaintenance } from './maintenanceStore'
import type { SettingsTab } from './PackSettingsDialog'

export type Dialog =
  | { kind: 'new-pack' }
  | { kind: 'pack-info'; folder: string }
  | { kind: 'pack-settings'; folder: string; tab?: SettingsTab }
  /** Retirer d'un zip les fichiers exclus dans les réglages ; `label` comme pour « contents ». */
  | { kind: 'strip'; folder: string; fileName: string; label: string }
  /** Notes d'une version : numéro d'un modpack, ou version déclarée d'un mod. */
  | { kind: 'notes'; folder: string; version: number | string }
  /** Importer des versions du dossier lié d'un mod. */
  | { kind: 'mod-import'; folder: string }
  /** Mettre une version d'un mod en ligne sur CurseForge. */
  | { kind: 'mod-curseforge-publish'; folder: string; version: string }
  /** Lien d'un mod avec son projet Modrinth, et mise en ligne d'une version. */
  | { kind: 'modrinth'; folder: string }
  /** Versions de Minecraft d'un pack de ressources ou d'un shader. */
  | { kind: 'minecraft-versions'; folder: string }
  /** Créer un mod, un pack de ressources ou un shader. */
  | { kind: 'new-content' }
  | { kind: 'modrinth-publish'; folder: string; version: string }
  /** Créer la version suivante depuis CurseForge ; `profilePath` : profil déjà choisi. */
  | { kind: 'import'; folder: string; profilePath?: string }
  /** Lien avec le projet CurseForge et réglages de publication. */
  | { kind: 'curseforge'; folder: string }
  | { kind: 'curseforge-versions'; folder: string }
  /** Mettre une version en ligne sur CurseForge. */
  | { kind: 'curseforge-publish'; folder: string; version: number }
  /** Réglages des mises à jour automatiques d'un modpack. */
  | { kind: 'updates'; folder: string }
  /** Créer un modpack (et sa v1) depuis un profil CurseForge. */
  | { kind: 'from-profile'; profilePath: string; profileName: string }
  | { kind: 'ranger' }
  | { kind: 'publish' }
  | { kind: 'delete'; target: DeleteTarget }
  /** `label` : « la v3 », ou le nom d'un zip pas encore rangé. */
  | { kind: 'contents'; folder: string; fileName: string; label: string }

/** Ce que le publieur supprime : une version, tout un modpack, ou des releases dont le zip n'existe plus. */
export type DeleteTarget =
  | { type: 'version'; folder: string; version: number }
  | { type: 'mod-version'; folder: string; version: string }
  | { type: 'pack'; folder: string }
  | { type: 'releases'; name: string; versions: string[]; tags: string[]; orphan: boolean }

/** Ce que montre la vue Studio à côté de l'arborescence : tous les modpacks, un profil CurseForge, ou un modpack. */
export type Selection = { kind: 'all' } | { kind: 'profile'; path: string } | { kind: 'pack'; folder: string }

interface StudioState {
  overview: StudioOverview | null
  /** Profils CurseForge du publieur face à ses modpacks (null avant la première lecture). */
  library: PublisherLibrary | null
  selection: Selection
  /** Nombre de lectures du dossier en cours. */
  pending: number
  checkingGitHub: boolean
  analyzing: string | null
  dialog: Dialog | null

  init(): Promise<void>
  refresh(options?: { remote?: boolean }): Promise<void>
  select(selection: Selection): void
  openDialog(dialog: Dialog): void
  closeDialog(): void
  /** Affiche l'erreur d'une action du studio ; renvoie true si elle a réussi. */
  run(result: Promise<ActionResult>, success?: string): Promise<boolean>
  /** Notifications communes à toute l'application. */
  pushToast(toast: Omit<ToastItem, 'id'>): void
  /** Paramètres communs de l'application (rôle, dépôt, compte, dossier des modpacks). */
  openSettings(): void
}

/** Retire l'enrobage ajouté par Electron aux erreurs levées dans le processus principal. */
export function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

let initialized = false

export const useStudio = create<StudioState>((set, get) => ({
  overview: null,
  library: null,
  selection: { kind: 'all' },
  pending: 0,
  checkingGitHub: false,
  analyzing: null,
  dialog: null,

  /** Appelé à la première ouverture de la vue Studio. */
  async init() {
    if (initialized) return
    initialized = true
    window.studio.onChanged(() => void get().refresh())
    window.studio.onAnalyzing((analyzing) => set({ analyzing }))
    await get().refresh()
    await get().refresh({ remote: true })
  },

  async refresh({ remote = false } = {}) {
    set((s) => ({ pending: s.pending + 1, checkingGitHub: s.checkingGitHub || remote }))
    try {
      // Chaque réponse est appliquée à son arrivée : une vérification de GitHub plus lente
      // qu'une simple relecture du dossier apporte quand même le dernier état de GitHub.
      const library = window.studio.getLibrary().then(
        (library) => set({ library }),
        () => {}
      )
      void useMaintenance.getState().refresh()
      set({ overview: await window.studio.getOverview({ refreshRemote: remote }) })
      await library
    } catch (err) {
      get().pushToast({ kind: 'error', title: 'Lecture du dossier impossible', message: errorMessage(err) })
    } finally {
      set((s) => ({ pending: s.pending - 1, checkingGitHub: remote ? false : s.checkingGitHub }))
    }
  },

  select(selection) {
    set({ selection })
  },

  openDialog(dialog) {
    set({ dialog })
  },

  closeDialog() {
    set({ dialog: null })
  },

  async run(result, success) {
    let outcome: ActionResult
    try {
      outcome = await result
    } catch (err) {
      outcome = { ok: false, error: errorMessage(err) }
    }
    if (!outcome.ok) {
      get().pushToast({ kind: 'error', title: 'Opération impossible', message: outcome.error })
      return false
    }
    if (success) get().pushToast({ kind: 'success', title: success })
    void get().refresh()
    return true
  },

  pushToast(toast) {
    useStore.getState().pushToast(toast)
  },

  openSettings() {
    useStore.getState().setSettingsOpen(true)
  }
}))

/** Relit la vue Studio si elle a déjà été ouverte (changement de dépôt, de compte, de dossier…). */
export function refreshStudioIfOpen(options?: { remote?: boolean }): void {
  if (initialized) void useStudio.getState().refresh(options)
}

export const openLink = (url: string) => void window.api.openExternal(url)
export const openPath = (path: string) =>
  void window.studio.openPath(path).catch((err: unknown) =>
    useStudio.getState().pushToast({ kind: 'error', title: 'Ouverture impossible', message: errorMessage(err) })
  )
