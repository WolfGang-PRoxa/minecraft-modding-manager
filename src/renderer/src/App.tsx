import { useEffect } from 'react'
import { CurseForgeMissingBanner, OfflineBanner, ShortcutBanner } from './components/Banners'
import { ContentSections } from './components/ContentLibrary'
import { DetailsPanel } from './components/DetailsPanel'
import { Hero } from './components/Hero'
import { ModpackCard } from './components/ModpackCard'
import { ReportDialog } from './components/ReportDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { EmptyView, ErrorView, LoadingView } from './components/States'
import { TitleBar } from './components/TitleBar'
import { Toasts } from './components/Toasts'
import { UpdateBar } from './components/UpdateBar'
import { SetupView } from './components/Usage'
import { DocsCenter } from './docs/DocsCenter'
import { useDocs } from './docs/store'
import { StudioView } from './studio/StudioView'
import { useStore } from './store'
import { applyAppearance } from './lib/appearance'
import { stepScale } from '../../shared/appearance'

function Library() {
  const catalog = useStore((s) => s.catalog)
  const loading = useStore((s) => s.loading)

  if (loading && !catalog) return <LoadingView />
  if (!catalog) return <ErrorView message="Réessaie dans un instant." />
  if (catalog.modpacks.length === 0 && catalog.contents.length === 0) {
    return catalog.error ? <ErrorView message={catalog.error} /> : <EmptyView />
  }
  if (catalog.modpacks.length === 0) {
    return (
      <div className="pt-8">
        <ContentSections />
      </div>
    )
  }

  const [featured, ...others] = catalog.modpacks
  return (
    <>
      <Hero modpack={featured} />
      {others.length > 0 && (
        <section className="px-8 pt-12 pb-16">
          <div className="mb-6 flex items-baseline gap-3">
            <h2 className="font-display text-2xl font-bold tracking-tight">Autres modpacks</h2>
            <span className="text-sm text-ink-400">{others.length}</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
            {others.map((modpack, index) => (
              <ModpackCard key={modpack.id} modpack={modpack} index={index} />
            ))}
          </div>
        </section>
      )}
      {others.length === 0 && <div className="h-16" />}
      <ContentSections />
    </>
  )
}

export function App() {
  const init = useStore((s) => s.init)
  const refreshLocal = useStore((s) => s.refreshLocal)
  const autoRefresh = useStore((s) => s.autoRefresh)
  // Premier lancement : le rôle n'est pas encore choisi.
  const needsSetup = useStore((s) => s.settings !== null && s.settings.role === null)
  const studio = useStore((s) => s.view === 'studio' && s.settings?.role === 'publisher')
  const appearance = useStore((s) => s.settings?.appearance)

  useEffect(() => {
    if (appearance) applyAppearance(appearance)
  }, [appearance])

  useEffect(() => {
    void init()
    // Si l'utilisateur supprime un profil dans CurseForge, on le voit au retour sur la fenêtre.
    const onFocus = () => {
      void refreshLocal()
      void autoRefresh()
    }
    window.addEventListener('focus', onFocus)
    // Application laissée ouverte : une nouvelle version finit par être proposée sans la relancer.
    const timer = setInterval(() => void autoRefresh(), 60_000)
    // F1 ouvre ou ferme l'aide, sauf derrière une fenêtre de dialogue, qui garde la main.
    const onKey = (e: KeyboardEvent) => {
      // Ctrl + / Ctrl - / Ctrl 0 : taille de l'interface, partout.
      if (e.ctrlKey && !e.altKey && ['+', '=', '-', '0'].includes(e.key)) {
        const { settings, updateAppearance } = useStore.getState()
        if (!settings) return
        e.preventDefault()
        const scale = e.key === '0' ? 1 : stepScale(settings.appearance.scale, e.key === '-' ? -1 : 1)
        if (scale !== settings.appearance.scale) void updateAppearance({ scale })
        return
      }
      if (e.key !== 'F1' || document.querySelector('[aria-modal="true"]')) return
      e.preventDefault()
      useDocs.getState().toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('keydown', onKey)
      clearInterval(timer)
    }
  }, [init, refreshLocal, autoRefresh])

  return (
    <div className="relative flex h-full flex-col">
      <div className="pointer-events-none fixed inset-0">
        <div className="pixel-grid absolute inset-0" />
        <div className="absolute -top-40 -left-40 size-[640px] rounded-full bg-grass-500/[0.07] blur-[120px]" />
        <div className="absolute -right-40 -bottom-60 size-[720px] rounded-full bg-sky-500/[0.05] blur-[140px]" />
      </div>

      <TitleBar />
      <UpdateBar />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <main className="relative h-full overflow-y-auto">
          {needsSetup ? (
            <SetupView />
          ) : studio ? (
            <StudioView />
          ) : (
            <>
              <CurseForgeMissingBanner />
              <OfflineBanner />
              <ShortcutBanner />
              <Library />
            </>
          )}
        </main>
        <DetailsPanel />
        <DocsCenter />
      </div>

      <SettingsDialog />
      <ReportDialog />
      <Toasts />
    </div>
  )
}
