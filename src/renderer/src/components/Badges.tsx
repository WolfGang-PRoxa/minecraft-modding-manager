import { useMemo, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Blocks, Cpu, HardDrive, Package } from 'lucide-react'
import { formatPresentVersions, type PresentVersion } from '../../../shared/presence'
import type { Modpack, ModpackVersion } from '../../../shared/types'
import { formatBytes, formatLoader } from '../lib/format'
import { packStatus } from '../lib/status'
import { useStore } from '../store'

export function MetaChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-tint/[0.06] px-2.5 py-1 text-xs font-medium text-ink-200 ring-1 ring-inset ring-tint/[0.06]">
      <Icon size={13} strokeWidth={2.25} className="text-ink-300" />
      {children}
    </span>
  )
}

export function VersionMeta({ version, withSize = true }: { version: ModpackVersion; withSize?: boolean }) {
  const loader = formatLoader(version.modLoader)
  return (
    <div className="flex flex-wrap gap-2">
      {version.minecraftVersion && <MetaChip icon={Blocks}>Minecraft {version.minecraftVersion}</MetaChip>}
      {loader && <MetaChip icon={Cpu}>{loader}</MetaChip>}
      {version.modCount !== null && <MetaChip icon={Package}>{version.modCount} mod{version.modCount > 1 ? 's' : ''}</MetaChip>}
      {withSize && version.archiveSize > 0 && <MetaChip icon={HardDrive}>{formatBytes(version.archiveSize)}</MetaChip>}
    </div>
  )
}

const TONES = {
  grass: 'bg-grass-400/15 text-grass-300 ring-grass-400/30',
  sky: 'bg-sky-400/15 text-sky-300 ring-sky-400/30',
  amber: 'bg-amber-glow/15 text-amber-glow ring-amber-glow/35'
}

// Posées sur l'image d'un modpack : un fond sombre, pour rester lisibles quelle que soit l'image.
const SOLID_TONES: typeof TONES = {
  grass: 'bg-ink-950/75 text-grass-300 ring-grass-400/40',
  sky: 'bg-ink-950/75 text-sky-300 ring-sky-400/40',
  amber: 'bg-ink-950/75 text-amber-glow ring-amber-glow/45'
}

function Badge({
  tone,
  solid = false,
  title,
  children
}: {
  tone: keyof typeof TONES
  solid?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset backdrop-blur-md ${(solid ? SOLID_TONES : TONES)[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

/** « v2 : profil « Mon pack », reconnu à ses mods » : d'où vient une version trouvée dans CurseForge. */
export function describePresence(present: PresentVersion): string {
  const origin = present.source === 'mods' ? 'reconnu à ses mods' : 'installé par l’application'
  return `v${present.version} : profil « ${present.profileName} », ${origin}`
}

/**
 * Ce que l'utilisateur a de ce modpack : la ou les versions présentes dans son CurseForge (même si ce n'est pas
 * la dernière, et même si le profil n'a pas été installé par l'application), et si une mise à jour l'attend.
 */
export function PackBadges({
  modpack,
  onCover = false
}: {
  modpack: Modpack
  /** Sur l'image d'une carte : pastilles empilées, sur fond sombre. */
  onCover?: boolean
}) {
  const installed = useStore((s) => s.installed)
  const present = useStore((s) => s.present)
  const mine = useMemo(() => present.filter((p) => p.id === modpack.id), [present, modpack.id])
  const status = packStatus(modpack, installed)
  // Version installée par l'application mais retirée de GitHub : elle n'apparaît pas parmi les versions présentes.
  const unlisted = status.kind !== 'available' && !mine.some((p) => p.profilePath === status.installed.instancePath)

  if (mine.length === 0 && status.kind === 'available') return null
  const hasLatest = mine.some((p) => p.version === modpack.latest.version)
  const several = new Set(mine.map((p) => p.version)).size > 1
  return (
    <div className={`flex gap-1.5 ${onCover ? 'flex-col items-start' : 'flex-wrap items-center'}`}>
      {mine.length > 0 && (
        <Badge tone={hasLatest ? 'grass' : 'sky'} solid={onCover} title={mine.map(describePresence).join('\n')}>
          {several ? 'Versions' : 'Version'} sur CurseForge : {formatPresentVersions(mine)}
        </Badge>
      )}
      {unlisted && (
        <Badge tone="sky" solid={onCover}>
          v{status.installed.version} installée
        </Badge>
      )}
      {status.kind === 'update' && (
        <Badge tone="amber" solid={onCover}>
          Mise à jour disponible
        </Badge>
      )}
    </div>
  )
}
