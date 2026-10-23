import { Download, Play, RefreshCw, X } from 'lucide-react'
import type { InstallProgress, ModpackVersion } from '../../../shared/types'
import { formatSpeed } from '../lib/format'
import { progressFor, versionStatus } from '../lib/status'
import { useStore } from '../store'
import { Button, sizes, type ButtonSize } from './Button'

const PHASE_LABELS: Record<InstallProgress['phase'], string> = {
  preparing: 'Préparation…',
  downloading: 'Téléchargement',
  verifying: 'Vérification…',
  extracting: 'Extraction',
  finalizing: 'Ajout à CurseForge…'
}

/** Avancement global : le téléchargement pèse 85 %, l'extraction 13 %. */
function overallRatio(p: InstallProgress): number {
  const ratio = p.total > 0 ? Math.min(1, p.done / p.total) : 0
  switch (p.phase) {
    case 'preparing':
      return 0
    case 'downloading':
      return 0.85 * ratio
    case 'verifying':
      return 0.85
    case 'extracting':
      return 0.85 + 0.13 * ratio
    case 'finalizing':
      return 0.98
  }
}

function ProgressBar({
  progress,
  size,
  className,
  onCancel
}: {
  progress: InstallProgress
  size: ButtonSize
  className: string
  onCancel: () => void
}) {
  const overall = overallRatio(progress)
  const phaseRatio = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null
  const cancellable = progress.phase === 'preparing' || progress.phase === 'downloading' || progress.phase === 'extracting'
  const showPercent = (progress.phase === 'downloading' || progress.phase === 'extracting') && phaseRatio !== null

  return (
    <div
      className={`relative flex min-w-56 items-center overflow-hidden bg-ink-800 ring-1 ring-inset ring-grass-400/30 ${sizes[size]} px-0! ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(overall * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="absolute inset-y-0 left-0 bg-linear-to-r from-grass-600/50 to-grass-400/45 transition-[width] duration-300 ease-out"
        style={{ width: `${Math.max(3, overall * 100)}%` }}
      >
        <div className="absolute inset-y-0 right-0 w-0.5 bg-grass-300 shadow-[0_0_12px_2px_color-mix(in_oklab,var(--color-grass-300)_60%,transparent)]" />
      </div>
      <div className="relative flex flex-1 items-center gap-2 px-4 font-semibold text-ink-100 tabular-nums">
        <span>{PHASE_LABELS[progress.phase]}</span>
        {showPercent && <span className="text-grass-300">{phaseRatio} %</span>}
        {progress.phase === 'downloading' && (
          <span className="text-xs font-medium text-ink-300">{formatSpeed(progress.bytesPerSecond)}</span>
        )}
      </div>
      {cancellable && (
        <button
          type="button"
          onClick={onCancel}
          title="Annuler"
          aria-label="Annuler l’installation"
          className="relative mr-1.5 inline-flex size-8 items-center justify-center rounded-lg text-ink-300 transition hover:bg-tint/10 hover:text-ink-100"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

interface InstallButtonProps {
  version: ModpackVersion
  /** Dernière version du modpack, pour distinguer une mise à jour d'un retour en arrière. */
  latest?: ModpackVersion
  size?: ButtonSize
  className?: string
}

export function InstallButton({ version, latest, size = 'md', className = '' }: InstallButtonProps) {
  const installed = useStore((s) => s.installed)
  const busyId = useStore((s) => s.busyId)
  const progress = useStore((s) => progressFor(version.id, s.progress))
  const install = useStore((s) => s.install)
  const cancelInstall = useStore((s) => s.cancelInstall)
  const launchCurseForge = useStore((s) => s.launchCurseForge)

  if (busyId === version.id && progress && progress.version === version.version) {
    return <ProgressBar progress={progress} size={size} className={className} onCancel={cancelInstall} />
  }

  const status = versionStatus(version, installed, latest)
  const disabled = busyId !== null

  switch (status.kind) {
    case 'installed':
      return (
        <Button variant="secondary" size={size} icon={Play} className={className} onClick={() => void launchCurseForge()}>
          Ouvrir CurseForge
        </Button>
      )
    case 'update':
      return (
        <Button variant="primary" size={size} icon={RefreshCw} className={className} disabled={disabled} onClick={() => void install(version)}>
          Mettre à jour
        </Button>
      )
    case 'other-version':
      return (
        <Button variant="secondary" size={size} icon={Download} className={className} disabled={disabled} onClick={() => void install(version)}>
          Installer la v{version.version}
        </Button>
      )
    case 'available':
      return (
        <Button variant="primary" size={size} icon={Download} className={className} disabled={disabled} onClick={() => void install(version)}>
          {latest && latest.version !== version.version ? `Installer la v${version.version}` : 'Installer'}
        </Button>
      )
  }
}
