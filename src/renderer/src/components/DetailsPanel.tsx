import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FolderOpen, History, X } from 'lucide-react'
import type { PresentVersion } from '../../../shared/presence'
import type { Modpack, ModpackVersion } from '../../../shared/types'
import { formatBytes, formatDate, formatLoader, formatRelative } from '../lib/format'
import { useStore } from '../store'
import { describePresence, PackBadges } from './Badges'
import { Button, IconButton } from './Button'
import { Cover } from './Cover'
import { InstallButton } from './InstallButton'
import { Notes } from './Notes'

function InfoCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-tint/[0.035] px-4 py-3 ring-1 ring-inset ring-tint/[0.05]">
      <div className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-ink-100">{value ?? '—'}</div>
    </div>
  )
}

function VersionRow({
  version,
  modpack,
  present,
  active,
  onSelect
}: {
  version: ModpackVersion
  modpack: Modpack
  /** Profils CurseForge qui contiennent cette version. */
  present: PresentVersion[]
  active: boolean
  onSelect: () => void
}) {
  const isLatest = version === modpack.latest

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
        active ? 'bg-grass-400/10 ring-1 ring-inset ring-grass-400/30' : 'hover:bg-tint/[0.05]'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold text-ink-100">v{version.version}</span>
          {isLatest && (
            <span className="rounded-md bg-grass-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-grass-300 uppercase">
              Dernière
            </span>
          )}
          {version.prerelease && (
            <span className="rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-sky-300 uppercase">
              Bêta
            </span>
          )}
          {present.length > 0 && (
            <span
              title={present.map(describePresence).join('\n')}
              className="rounded-md bg-curseforge/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-curseforge uppercase"
            >
              Version sur CurseForge
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-ink-400">
          {formatDate(version.publishedAt)} · {formatBytes(version.archiveSize)}
        </div>
      </div>
    </button>
  )
}

export function DetailsPanel() {
  const selectedId = useStore((s) => s.selectedId)
  const modpacks = useStore((s) => s.catalog?.modpacks)
  const installed = useStore((s) => s.installed)
  const present = useStore((s) => s.present)
  const select = useStore((s) => s.select)
  const modpack = modpacks?.find((m) => m.id === selectedId) ?? null
  const mine = useMemo(() => present.filter((p) => p.id === selectedId), [present, selectedId])
  const [versionTag, setVersionTag] = useState<string | null>(null)

  useEffect(() => {
    setVersionTag(null)
  }, [selectedId])

  useEffect(() => {
    if (!modpack) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modpack, select])

  if (!modpack) return null

  const version = modpack.versions.find((v) => v.tag === versionTag) ?? modpack.latest
  const current = installed.find((i) => i.id === modpack.id)
  // Version installée par l'application mais retirée de GitHub : elle ne fait pas partie des versions présentes.
  const unlisted = current && !mine.some((p) => p.profilePath === current.instancePath) ? current : null
  const folder = current?.instancePath ?? mine[0]?.profilePath

  return (
    <div className="absolute inset-0 z-40 flex justify-end">
      <div className="animate-fade-in absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => select(null)} />

      <aside
        className="animate-slide-in relative flex h-full w-[min(640px,94vw)] flex-col overflow-hidden border-l border-tint/[0.07] bg-ink-900 shadow-2xl"
        role="dialog"
        aria-label={modpack.latest.name}
      >
        <div className="relative h-60 shrink-0">
          <Cover id={modpack.id} name={modpack.latest.name} url={modpack.latest.coverUrl} className="absolute inset-0" />
          <div className="absolute inset-0 bg-linear-to-t from-ink-900 via-ink-900/40 to-transparent" />
          <IconButton
            icon={X}
            label="Fermer"
            onClick={() => select(null)}
            className="absolute top-4 right-4 bg-ink-950/60 text-ink-100 backdrop-blur-md"
          />
          <div className="absolute inset-x-8 bottom-5">
            <PackBadges modpack={modpack} />
            <h2 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink-100">{modpack.latest.name}</h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pt-2 pb-10">
          {modpack.latest.description && <p className="text-ink-300">{modpack.latest.description}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <InstallButton version={version} latest={modpack.latest} />
            {folder && (
              <Button icon={FolderOpen} onClick={() => void window.api.openPath(folder)}>
                Ouvrir le dossier
              </Button>
            )}
            <Button variant="ghost" icon={ExternalLink} onClick={() => void window.api.openExternal(version.releaseUrl)}>
              GitHub
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2.5">
            <InfoCell label="Version" value={version.version} />
            <InfoCell label="Minecraft" value={version.minecraftVersion} />
            <InfoCell label="Mod loader" value={formatLoader(version.modLoader)} />
            <InfoCell label="Mods" value={version.modCount !== null ? String(version.modCount) : null} />
            <InfoCell label="Taille" value={formatBytes(version.archiveSize)} />
            <InfoCell label="Publiée" value={formatRelative(version.publishedAt)} />
          </div>

          {(mine.length > 0 || unlisted) && (
            <div className="mt-4 space-y-2 text-xs text-ink-400">
              {mine.map((p) => (
                <p key={`${p.profilePath}|${p.version}`}>
                  <span className="font-semibold text-ink-200">La v{p.version} est dans ton CurseForge</span> : profil «{' '}
                  {p.profileName} »,{' '}
                  {p.source === 'mods'
                    ? 'reconnu à ses mods. L’application n’y touche pas : « Installer » crée un profil à part.'
                    : 'installé par l’application.'}
                  <br />
                  <span className="font-mono text-ink-300 select-text">{p.profilePath}</span>
                </p>
              ))}
              {unlisted && (
                <p>
                  Installé dans <span className="font-mono text-ink-300 select-text">{unlisted.instancePath}</span>
                </p>
              )}
            </div>
          )}

          <h3 className="mt-8 mb-3 text-xs font-semibold tracking-widest text-ink-400 uppercase">
            Notes de la v{version.version}
          </h3>
          <Notes markdown={version.notes} />

          {modpack.versions.length > 1 && (
            <>
              <h3 className="mt-10 mb-3 flex items-center gap-2 text-xs font-semibold tracking-widest text-ink-400 uppercase">
                <History size={14} /> Historique des versions
              </h3>
              <div className="space-y-1">
                {modpack.versions.map((v) => (
                  <VersionRow
                    key={v.tag}
                    version={v}
                    modpack={modpack}
                    present={mine.filter((p) => p.version === v.version)}
                    active={v.tag === version.tag}
                    onSelect={() => setVersionTag(v.tag)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
