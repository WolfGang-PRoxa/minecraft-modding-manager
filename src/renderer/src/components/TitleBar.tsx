import { Bug, CircleArrowUp, CircleHelp, CloudUpload, Copy, Library, Minimize2, Minus, RefreshCw, Settings, Square, X } from 'lucide-react'
import type { AppView, WindowState } from '../../../shared/types'
import { useDocs } from '../docs/store'
import { useStudio } from '../studio/store'
import { useStore } from '../store'
import { APP_NAME } from '../../../shared/config'
import { IconButton } from './Button'
import { Logo } from './Logo'

function CurseForgeChip() {
  const curseForge = useStore((s) => s.curseForge)
  const launch = useStore((s) => s.launchCurseForge)
  const openSettings = useStore((s) => s.setSettingsOpen)
  if (!curseForge) return null

  const ok = curseForge.installed
  return (
    <button
      type="button"
      onClick={() => (ok ? void launch() : openSettings(true))}
      title={ok ? 'Ouvrir CurseForge' : 'CurseForge est introuvable'}
      className="no-drag flex items-center gap-2 rounded-full bg-white/[0.05] py-1.5 pr-3.5 pl-3 text-xs font-medium text-ink-200 ring-1 ring-inset ring-white/[0.07] transition hover:bg-white/[0.09]"
    >
      <span className="relative flex size-2">
        {ok && <span className="absolute inset-0 animate-ping rounded-full bg-curseforge/60" />}
        <span className={`relative size-2 rounded-full ${ok ? 'bg-curseforge' : 'bg-ink-500'}`} />
      </span>
      {ok ? 'CurseForge' : 'CurseForge introuvable'}
    </button>
  )
}

/** Mise à jour remise à plus tard : un rappel discret, qui rouvre la proposition. */
function UpdateChip() {
  const version = useStore((s) => s.catalog?.appUpdate?.version ?? null)
  const dismissed = useStore((s) => s.updateDismissed)
  const updating = useStore((s) => s.appUpdateProgress !== null)
  const show = useStore((s) => s.showAppUpdate)
  if (!version || dismissed !== version || updating) return null
  return (
    <button
      type="button"
      onClick={show}
      title={`Mettre à jour vers la version ${version}`}
      className="no-drag mr-1 flex shrink-0 items-center gap-2 rounded-full bg-sky-400/10 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-sky-200 ring-1 ring-inset ring-sky-400/25 transition hover:bg-sky-400/20 lg:pr-3.5 lg:pl-3"
    >
      <CircleArrowUp size={14} />
      {/* Fenêtre étroite : l'icône seule, pour laisser sa place au reste de la barre de titre. */}
      <span className="hidden lg:inline">Mise à jour</span>
    </button>
  )
}

/** Bouton agrandir / niveau inférieur, comme celui de Windows ; en plein écran (F11), il en fait sortir. */
const MAXIMIZE_BUTTON: Record<WindowState, { icon: typeof Square; label: string; size: number }> = {
  normal: { icon: Square, label: 'Agrandir', size: 14 },
  maximized: { icon: Copy, label: 'Niveau inférieur', size: 14 },
  fullscreen: { icon: Minimize2, label: 'Quitter le plein écran (F11)', size: 16 }
}

const VIEWS: Array<{ view: AppView; label: string; icon: typeof Library }> = [
  { view: 'library', label: 'Bibliothèque', icon: Library },
  { view: 'studio', label: 'Studio', icon: CloudUpload }
]

/** Bibliothèque et Studio : deux vues de la même fenêtre, le Studio n'existant que pour un publieur. */
function ViewTabs() {
  const publisher = useStore((s) => s.settings?.role === 'publisher')
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  // L'aide recouvre la vue : aucun onglet n'est alors actif, et un clic sur l'un d'eux la referme.
  const docsOpen = useDocs((s) => s.open)
  const closeDocs = useDocs((s) => s.close)
  if (!publisher) return null
  return (
    <nav className="no-drag ml-4 flex rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.06]" aria-label="Vues">
      {VIEWS.map((tab) => (
        <button
          key={tab.view}
          type="button"
          aria-current={!docsOpen && view === tab.view ? 'page' : undefined}
          onClick={() => {
            closeDocs()
            setView(tab.view)
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
            !docsOpen && view === tab.view ? 'bg-white/10 text-ink-100' : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          <tab.icon size={15} /> {tab.label}
        </button>
      ))}
    </nav>
  )
}

export function TitleBar() {
  const libraryRefreshing = useStore((s) => s.refreshing)
  const refresh = useStore((s) => s.refresh)
  const refreshLocal = useStore((s) => s.refreshLocal)
  const maximizeButton = MAXIMIZE_BUTTON[useStore((s) => s.windowState)]
  const openSettings = useStore((s) => s.setSettingsOpen)
  const openReport = useStore((s) => s.setReportOpen)
  const studio = useStore((s) => s.view === 'studio' && s.settings?.role === 'publisher')
  const studioRefreshing = useStudio((s) => s.pending > 0)
  const refreshStudio = useStudio((s) => s.refresh)
  const refreshing = studio ? studioRefreshing : libraryRefreshing
  const docsOpen = useDocs((s) => s.open)
  const toggleDocs = useDocs((s) => s.toggle)

  return (
    <header className="drag-region relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] bg-ink-900/70 pr-2 pl-5 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <Logo size={26} />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-semibold tracking-tight text-ink-100">{APP_NAME}</div>
        </div>
      </div>
      <ViewTabs />

      <div className="flex-1" />

      <div className="no-drag flex items-center gap-1">
        <UpdateChip />
        <CurseForgeChip />
        <div className="mx-2 h-5 w-px bg-white/10" />
        <IconButton
          icon={RefreshCw}
          label={studio ? 'Relire le dossier et GitHub' : 'Actualiser'}
          onClick={() => void (studio ? refreshStudio({ remote: true }) : Promise.all([refresh(true), refreshLocal()]))}
          disabled={refreshing}
          className={refreshing ? '[&_svg]:animate-spin' : ''}
        />
        <IconButton
          icon={CircleHelp}
          label={docsOpen ? 'Fermer l’aide (F1)' : 'Aide (F1)'}
          aria-pressed={docsOpen}
          onClick={toggleDocs}
          className={docsOpen ? 'bg-white/10 text-ink-100' : ''}
        />
        <IconButton icon={Bug} label="Signaler un problème" onClick={() => openReport(true)} />
        <IconButton icon={Settings} label="Paramètres" onClick={() => openSettings(true)} />
        <div className="mx-2 h-5 w-px bg-white/10" />
        <IconButton icon={Minus} label="Réduire" onClick={() => window.api.minimizeWindow()} />
        <IconButton {...maximizeButton} onClick={() => window.api.toggleMaximize()} />
        <IconButton
          icon={X}
          label="Fermer"
          onClick={() => window.api.closeWindow()}
          className="hover:bg-red-500/85! hover:text-white!"
        />
      </div>
    </header>
  )
}
