import { useEffect, type ReactNode } from 'react'
import { BookOpen, Bug, ExternalLink, FolderCog, FolderOpen, Monitor, RefreshCw, RotateCcw, Sparkles, X } from 'lucide-react'
import { findRelease } from '../../../shared/changelog'
import { APP_REPO_URL, CURSEFORGE_DOWNLOAD_URL } from '../../../shared/config'
import { changelog, CHANGELOG_PAGE, HOME } from '../docs/content'
import { showDocs } from '../docs/store'
import { formatDate } from '../lib/format'
import { useStore } from '../store'
import { Button, IconButton } from './Button'
import { Toggle } from './Toggle'
import { ClaudeCodeSetting, CurseForgeAccountSetting, MaintenanceSetting, WorkspaceFolderSetting } from '../studio/StudioSettings'
import { PlayerUsageSection } from './Usage'
import { APP_NAME } from '../../../shared/config'

const SOURCE_LABELS = {
  settings: 'Choisi manuellement',
  curseforge: 'Détecté automatiquement depuis CurseForge',
  default: 'Emplacement par défaut de CurseForge'
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/[0.06] py-6 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-xs font-semibold tracking-widest text-ink-400 uppercase">{title}</h3>
      {children}
    </section>
  )
}

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const settings = useStore((s) => s.settings)
  const curseForge = useStore((s) => s.curseForge)
  const appVersion = useStore((s) => s.appVersion)
  const updateSettings = useStore((s) => s.updateSettings)
  const pickInstancesDir = useStore((s) => s.pickInstancesDir)
  const restartCurseForge = useStore((s) => s.restartCurseForge)
  const publisher = useStore((s) => s.settings?.role === 'publisher')
  const shortcut = useStore((s) => s.shortcut)
  const createShortcut = useStore((s) => s.createShortcut)
  const update = useStore((s) => s.catalog?.appUpdate ?? null)
  const checking = useStore((s) => s.refreshing)
  const checkAppUpdate = useStore((s) => s.checkAppUpdate)
  const openReport = useStore((s) => s.setReportOpen)
  const releasedOn = findRelease(changelog, appVersion)?.date ?? null
  // L'aide s'affiche sous les fenêtres de dialogue : les paramètres se referment pour la laisser voir.
  const openDocs = (slug: string) => {
    setOpen(false)
    showDocs(slug)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open || !settings) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="animate-fade-in absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paramètres"
        className="animate-rise relative max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-ink-850 p-8 shadow-2xl ring-1 ring-white/10"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold tracking-tight">Paramètres</h2>
          <IconButton icon={X} label="Fermer" onClick={() => setOpen(false)} />
        </div>

        <Section title="Utilisation">
          <PlayerUsageSection />
        </Section>

        {publisher && (
          <Section title="Dossier des modpacks">
            <WorkspaceFolderSetting />
          </Section>
        )}

        <Section title="CurseForge">
          {curseForge?.installed ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-ink-200">
                  CurseForge est installé
                  {curseForge.flavor === 'overwolf' ? ' (version Overwolf)' : ' (application autonome)'}.
                </p>
                <p className="mt-0.5 text-xs text-ink-400">
                  Un modpack installé pendant que CurseForge était ouvert n’y apparaît pas ? Relance-le : il relit ses profils.
                </p>
              </div>
              <Button size="sm" icon={RotateCcw} onClick={() => void restartCurseForge()}>
                Relancer CurseForge
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-xl bg-amber-glow/10 p-4 ring-1 ring-inset ring-amber-glow/30">
              <p className="text-sm text-ink-100">CurseForge n’a pas été trouvé sur ce PC. Il est nécessaire pour jouer.</p>
              <Button
                size="sm"
                variant="primary"
                icon={ExternalLink}
                onClick={() => void window.api.openExternal(CURSEFORGE_DOWNLOAD_URL)}
              >
                Télécharger
              </Button>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between gap-6">
            <div>
              <div className="text-sm font-medium text-ink-100">Ouvrir CurseForge après une installation</div>
              <div className="mt-0.5 text-xs text-ink-400">
                Le modpack y apparaît. S’il était déjà ouvert, l’application propose de le relancer.
              </div>
            </div>
            <Toggle
              label="Ouvrir CurseForge après une installation"
              checked={settings.openCurseForgeAfterInstall}
              onChange={(value) => void updateSettings({ openCurseForgeAfterInstall: value })}
            />
          </div>
        </Section>

        <Section title="Dossier des instances">
          {curseForge && (
            <>
              <div className="rounded-xl bg-ink-950/60 px-4 py-3 font-mono text-[13px] break-all text-ink-100 ring-1 ring-inset ring-white/[0.06] select-text">
                {curseForge.instancesDir}
              </div>
              <p className="mt-2 text-xs text-ink-400">
                {SOURCE_LABELS[curseForge.instancesDirSource]}
                {!curseForge.instancesDirExists && ' · le dossier sera créé à la première installation'}
              </p>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" icon={FolderCog} onClick={() => void pickInstancesDir()}>
              Modifier…
            </Button>
            {curseForge?.instancesDirExists && (
              <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => void window.api.openPath(curseForge.instancesDir)}>
                Ouvrir
              </Button>
            )}
            {settings.instancesDir && (
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => void updateSettings({ instancesDir: null })}>
                Détection automatique
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-400">
            À modifier seulement si tu as changé le dossier d’installation dans les paramètres Minecraft de CurseForge.
          </p>
        </Section>

        <Section title="Raccourci">
          <p className="text-sm text-ink-200">
            {shortcut?.onDesktop
              ? `${APP_NAME} a un raccourci sur ton bureau.`
              : 'Pas de raccourci sur ton bureau pour l’instant.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" icon={Monitor} onClick={() => void createShortcut('desktop')}>
              {shortcut?.onDesktop ? 'Recréer sur le bureau' : 'Ajouter au bureau'}
            </Button>
            <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => void createShortcut('choose')}>
              Autre emplacement…
            </Button>
          </div>
        </Section>

        {publisher && (
          <Section title="Compte CurseForge">
            <CurseForgeAccountSetting />
          </Section>
        )}

        {publisher && (
          <Section title="Mises à jour automatiques">
            <MaintenanceSetting />
          </Section>
        )}

        {publisher && (
          <Section title="Claude Code et terminal">
            <ClaudeCodeSetting />
          </Section>
        )}

        <Section title="À propos">
          <p className="text-sm text-ink-200">
            {APP_NAME} v{appVersion}
            {releasedOn && <span className="text-ink-400"> · publiée le {formatDate(`${releasedOn}T12:00:00`)}</span>}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            {update
              ? `La version ${update.version} est disponible : elle est proposée en haut de la fenêtre.`
              : 'Une nouvelle version est proposée en haut de la fenêtre dès qu’elle sort, et s’installe en un clic.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" icon={RefreshCw} disabled={checking} onClick={() => void checkAppUpdate()}>
              Rechercher une mise à jour
            </Button>
            <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => openDocs(CHANGELOG_PAGE)}>
              Nouveautés
            </Button>
            <Button size="sm" variant="ghost" icon={BookOpen} onClick={() => openDocs(HOME)}>
              Documentation
            </Button>
            <Button size="sm" variant="ghost" icon={Bug} onClick={() => openReport(true)}>
              Signaler un problème
            </Button>
            <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => void window.api.openExternal(APP_REPO_URL)}>
              Dépôt GitHub
            </Button>
          </div>
        </Section>
      </div>
    </div>
  )
}
