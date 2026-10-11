import type { ReactNode } from 'react'
import { ExternalLink, FolderOpen, Monitor, TriangleAlert, WifiOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { APP_NAME, CURSEFORGE_DOWNLOAD_URL } from '../../../shared/config'
import { useStore } from '../store'
import { Button } from './Button'

function Banner({ icon: Icon, tone, children, action }: { icon: LucideIcon; tone: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`animate-rise mx-8 mt-6 flex items-center gap-4 rounded-2xl px-5 py-4 ring-1 ring-inset ${tone}`}>
      <Icon size={22} className="shrink-0" />
      <div className="min-w-0 flex-1 text-sm text-ink-100">{children}</div>
      {action}
    </div>
  )
}

export function OfflineBanner() {
  const error = useStore((s) => s.catalog?.error)
  const hasModpacks = useStore((s) => (s.catalog?.modpacks.length ?? 0) > 0)
  const refresh = useStore((s) => s.refresh)
  if (!error || !hasModpacks) return null
  return (
    <Banner
      icon={WifiOff}
      tone="bg-amber-glow/10 text-amber-glow ring-amber-glow/25"
      action={
        <Button size="sm" onClick={() => void refresh(true)}>
          Réessayer
        </Button>
      }
    >
      <strong className="font-semibold">Liste non actualisée.</strong> <span className="text-ink-300">{error}</span>
    </Banner>
  )
}

export function CurseForgeMissingBanner() {
  const curseForge = useStore((s) => s.curseForge)
  if (!curseForge || curseForge.installed) return null
  return (
    <Banner
      icon={TriangleAlert}
      tone="bg-curseforge/10 text-curseforge ring-curseforge/30"
      action={
        <Button size="sm" variant="primary" icon={ExternalLink} onClick={() => void window.api.openExternal(CURSEFORGE_DOWNLOAD_URL)}>
          Télécharger CurseForge
        </Button>
      }
    >
      <strong className="font-semibold">CurseForge n’est pas installé.</strong>{' '}
      <span className="text-ink-300">Il est nécessaire pour jouer aux modpacks. Installe-le puis relance cette application.</span>
    </Banner>
  )
}

/** Proposé au premier lancement : l'installeur ne pose plus de raccourci sur le bureau d'office. */
export function ShortcutBanner() {
  const settings = useStore((s) => s.settings)
  const shortcut = useStore((s) => s.shortcut)
  const createShortcut = useStore((s) => s.createShortcut)
  const updateSettings = useStore((s) => s.updateSettings)
  if (!settings || settings.shortcutPrompted || !shortcut || shortcut.onDesktop) return null
  return (
    <Banner
      icon={Monitor}
      tone="bg-grass-400/10 text-grass-300 ring-grass-400/25"
      action={
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="primary" icon={Monitor} onClick={() => void createShortcut('desktop')}>
            Ajouter au bureau
          </Button>
          <Button size="sm" icon={FolderOpen} onClick={() => void createShortcut('choose')}>
            Ailleurs…
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void updateSettings({ shortcutPrompted: true })}>
            Non merci
          </Button>
        </div>
      }
    >
      <strong className="font-semibold">Ajouter un raccourci ?</strong>{' '}
      <span className="text-ink-300">Pour retrouver {APP_NAME} directement depuis ton bureau, ou l’endroit de ton choix.</span>
    </Banner>
  )
}
