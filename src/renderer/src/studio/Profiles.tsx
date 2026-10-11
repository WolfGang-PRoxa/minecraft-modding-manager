// La vue du publieur par profil CurseForge : l'arborescence des dossiers de CurseForge (à gauche) et le détail d'un
// profil face au modpack qui en vient.
import { useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Download,
  ExternalLink,
  FlaskConical,
  Folder,
  FolderOpen,
  FolderPlus,
  History,
  LayoutGrid,
  Link2,
  PackagePlus,
  RefreshCw,
  Search,
  Unlink
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PackView, ProfileState, ProfileView } from '../../../shared/studio'
import { Button } from '../components/Button'
import { formatLoader, formatRelative } from '../lib/format'
import { PackCard } from './PackCard'
import { ProfileUpdates } from './ProfileUpdates'
import { openLink, openPath, useStudio, type Selection } from './store'

const STATE_DOT: Record<ProfileState, { className: string; label: (p: ProfileView) => string } | null> = {
  unlinked: null,
  'no-version': { className: 'bg-ink-400', label: () => 'Modpack sans version' },
  'up-to-date': { className: 'bg-grass-400', label: (p) => `À jour (v${p.matchingVersion})` },
  older: { className: 'bg-amber-glow', label: (p) => `Mods d’une version plus ancienne (v${p.matchingVersion})` },
  changed: { className: 'bg-sky-400', label: () => 'Changé depuis la dernière version' }
}

const CLOSED_KEY = 'studio.closedFolders'

function loadClosed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

const sameSelection = (a: Selection, b: Selection) =>
  a.kind === b.kind &&
  (a.kind !== 'profile' || a.path === (b as typeof a).path) &&
  (a.kind !== 'pack' || a.folder === (b as typeof a).folder)

function SidebarItem({
  selected,
  onClick,
  children,
  title
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
        selected ? 'bg-grass-400/12 text-ink-100 ring-1 ring-inset ring-grass-400/30' : 'text-ink-300 hover:bg-white/[0.05] hover:text-ink-100'
      }`}
    >
      {children}
    </button>
  )
}

function ProfileItem({ profile, selected, onClick }: { profile: ProfileView; selected: boolean; onClick: () => void }) {
  const dot = STATE_DOT[profile.state]
  const meta = [profile.minecraftVersion, formatLoader(profile.modLoader)?.split(' ')[0]].filter(Boolean).join(' · ')
  return (
    <SidebarItem selected={selected} onClick={onClick} title={dot?.label(profile)}>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{profile.name}</span>
        <span className="block truncate text-[11px] text-ink-500">
          {meta}
          {profile.pack && <span className="text-ink-400"> · {profile.pack.name}</span>}
        </span>
      </span>
      {profile.installedPack && <Download size={13} className="shrink-0 text-ink-500" aria-label="Installé par l’application" />}
      {(profile.trialOf || profile.trialPath) && (
        <FlaskConical
          size={13}
          className="shrink-0 text-violet-300"
          aria-label={profile.trialOf ? 'Copie d’essai' : 'Essai en cours'}
        />
      )}
      {profile.curseforgeProjectId && !profile.installedPack && (
        <span className="shrink-0 text-[10px] font-bold text-curseforge" title="Installation d’un modpack de CurseForge">
          CF
        </span>
      )}
      {dot && <span className={`size-2 shrink-0 rounded-full ${dot.className}`} />}
    </SidebarItem>
  )
}

/** Arborescence : tous les modpacks, les dossiers de CurseForge et leurs profils, les modpacks sans profil. */
export function ProfilesSidebar() {
  const library = useStudio((s) => s.library)
  const overview = useStudio((s) => s.overview)
  const selection = useStudio((s) => s.selection)
  const select = useStudio((s) => s.select)
  const refresh = useStudio((s) => s.refresh)
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState(loadClosed)

  const wanted = query.trim().toLowerCase()
  const matches = (p: ProfileView) => !wanted || p.name.toLowerCase().includes(wanted) || Boolean(p.pack?.name.toLowerCase().includes(wanted))
  const toggle = (key: string) => {
    const next = new Set(closed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setClosed(next)
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]))
    } catch {
      // préférence facultative
    }
  }
  const packName = (folder: string) => overview?.packs.find((p) => p.folder === folder)?.name ?? folder

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-white/[0.05] bg-ink-900/40">
      <div className="flex items-center gap-2 p-4 pb-3">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un profil…"
            className="w-full rounded-lg bg-ink-950/60 py-2 pr-3 pl-9 text-sm text-ink-100 ring-1 ring-white/[0.06] outline-none placeholder:text-ink-500 focus:ring-grass-400/50"
          />
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          title="Relire les profils CurseForge"
          className="rounded-lg p-2 text-ink-400 transition hover:bg-white/[0.06] hover:text-ink-100"
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-6">
        <SidebarItem selected={selection.kind === 'all'} onClick={() => select({ kind: 'all' })}>
          <LayoutGrid size={16} className="shrink-0" />
          <span className="flex-1 font-medium">Tous mes modpacks</span>
          <span className="text-xs text-ink-500">{overview?.packs.length ?? 0}</span>
        </SidebarItem>

        {library?.error && <p className="px-2.5 text-xs leading-relaxed text-amber-glow">{library.error}</p>}
        {!library && <p className="px-2.5 text-xs text-ink-500">Lecture des profils CurseForge…</p>}

        {library?.folders.map((folder) => {
          const key = folder.id ?? '(aucun)'
          const shown = folder.profiles.filter(matches)
          if (wanted && !shown.length) return null
          const open = Boolean(wanted) || !closed.has(key)
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => toggle(key)}
                className="flex w-full items-center gap-1.5 px-1.5 py-1 text-xs font-semibold tracking-wide text-ink-400 uppercase transition hover:text-ink-200"
              >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Folder size={13} />
                <span className="flex-1 truncate text-left">{folder.name}</span>
                <span className="font-normal text-ink-500">{folder.profiles.length}</span>
              </button>
              {open && (
                <div className="mt-0.5 space-y-0.5">
                  {shown.map((profile) => {
                    const target: Selection = { kind: 'profile', path: profile.path }
                    return (
                      <ProfileItem
                        key={profile.path}
                        profile={profile}
                        selected={sameSelection(selection, target)}
                        onClick={() => select(target)}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {library && library.packsWithoutProfile.length > 0 && !wanted && (
          <div>
            <p className="px-1.5 py-1 text-xs font-semibold tracking-wide text-ink-400 uppercase">Modpacks sans profil</p>
            {library.packsWithoutProfile.map((folder) => {
              const target: Selection = { kind: 'pack', folder }
              return (
                <SidebarItem key={folder} selected={sameSelection(selection, target)} onClick={() => select(target)}>
                  <span className="truncate">{packName(folder)}</span>
                </SidebarItem>
              )
            })}
          </div>
        )}
      </nav>
    </aside>
  )
}

function Banner({
  icon: Icon,
  tone,
  children,
  actions
}: {
  icon: LucideIcon
  tone: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className={`mt-5 flex flex-wrap items-center gap-4 rounded-2xl px-5 py-4 ring-1 ring-inset ${tone}`}>
      <Icon size={20} className="shrink-0" />
      <div className="min-w-0 flex-1 text-sm text-ink-100">{children}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** Choix d'un modpack (ou d'un profil) à lier, et bouton « Lier ». */
function LinkPicker({ options, onLink }: { options: Array<{ value: string; label: string }>; onLink: (value: string) => void }) {
  const [value, setValue] = useState('')
  if (!options.length) return null
  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="max-w-56 rounded-lg bg-ink-950/60 px-3 py-1.5 text-sm text-ink-100 ring-1 ring-white/10 outline-none focus:ring-grass-400/50"
      >
        <option value="">Choisir…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Button size="sm" icon={Link2} disabled={!value} onClick={() => onLink(value)}>
        Lier
      </Button>
    </div>
  )
}

function ProfileStatus({ profile, pack }: { profile: ProfileView; pack: PackView | null }) {
  const openDialog = useStudio((s) => s.openDialog)
  const run = useStudio((s) => s.run)
  const packs = useStudio((s) => s.overview?.packs ?? [])
  const createVersion = (label: string, variant: 'primary' | 'secondary' = 'primary') =>
    pack && (
      <Button
        size="sm"
        variant={variant}
        icon={PackagePlus}
        onClick={() => openDialog({ kind: 'import', folder: pack.folder, profilePath: profile.path })}
      >
        {label}
      </Button>
    )

  if (profile.trialOf) return null
  if (profile.installedPack) {
    return (
      <Banner icon={Download} tone="bg-white/[0.04] text-ink-300 ring-white/[0.08]">
        Installé par l’application depuis GitHub ({profile.installedPack.id}, v{profile.installedPack.version}) : c’est une copie
        de joueur, pas la source d’un modpack.
      </Banner>
    )
  }
  if (!pack) {
    return (
      <Banner
        icon={FolderPlus}
        tone="bg-white/[0.04] text-ink-200 ring-white/[0.08]"
        actions={
          <>
            <Button
              size="sm"
              variant="primary"
              icon={FolderPlus}
              onClick={() => openDialog({ kind: 'from-profile', profilePath: profile.path, profileName: profile.name })}
            >
              Créer un modpack depuis ce profil
            </Button>
            <LinkPicker
              options={packs.map((p) => ({ value: p.folder, label: p.name }))}
              onLink={(folder) => void run(window.studio.linkProfile(folder, profile.path), 'Profil lié au modpack')}
            />
          </>
        }
      >
        {profile.curseforgeProjectId ? (
          <>
            <strong className="font-semibold">Installation d’un modpack publié sur CurseForge.</strong>{' '}
            <span className="text-ink-300">Si c’est l’un des tiens, lie-le au modpack qui lui correspond.</span>
          </>
        ) : (
          <>
            <strong className="font-semibold">Aucun modpack ne vient de ce profil.</strong>{' '}
            <span className="text-ink-300">Crée-en un (sa v1 est zippée tout de suite), ou lie-le à un modpack existant.</span>
          </>
        )}
      </Banner>
    )
  }

  const latest = pack.versions[0]
  const banner = (() => {
    switch (profile.state) {
      case 'no-version':
        return (
          <Banner icon={PackagePlus} tone="bg-white/[0.04] text-ink-200 ring-white/[0.08]" actions={createVersion('Créer la v1 depuis ce profil')}>
            <strong className="font-semibold">{pack.name} n’a encore aucune version.</strong>
          </Banner>
        )
      case 'up-to-date':
        return (
          <Banner icon={CircleCheck} tone="bg-grass-400/10 text-grass-400 ring-grass-400/25">
            <strong className="font-semibold">À jour.</strong>{' '}
            <span className="text-ink-300">Le profil a exactement les mods de la v{profile.matchingVersion}, la dernière version.</span>
          </Banner>
        )
      case 'older':
        return (
          <Banner
            icon={History}
            tone="bg-amber-glow/10 text-amber-glow ring-amber-glow/25"
            actions={createVersion(`Créer la v${pack.nextVersion} depuis ce profil`, 'secondary')}
          >
            <strong className="font-semibold">Le profil a les mods de la v{profile.matchingVersion}</strong>{' '}
            <span className="text-ink-300">, plus ancienne que la dernière version (v{latest?.number}).</span>
          </Banner>
        )
      default:
        return (
          <Banner
            icon={RefreshCw}
            tone="bg-sky-400/10 text-sky-300 ring-sky-400/25"
            actions={createVersion(`Créer la v${pack.nextVersion} depuis ce profil`)}
          >
            <strong className="font-semibold">Le profil a changé depuis la v{latest?.number}.</strong>{' '}
            <span className="text-ink-300">Ses mods ne sont plus ceux de la dernière version : de quoi créer la suivante.</span>
          </Banner>
        )
    }
  })()

  return (
    <>
      {profile.link === 'guessed' && (
        <Banner
          icon={Link2}
          tone="bg-white/[0.04] text-ink-200 ring-white/[0.08]"
          actions={
            <Button size="sm" icon={Link2} onClick={() => void run(window.studio.linkProfile(pack.folder, profile.path), 'Lien enregistré')}>
              Confirmer
            </Button>
          }
        >
          <strong className="font-semibold">Ce profil semble être la source de {pack.name}</strong>{' '}
          <span className="text-ink-300">(mêmes mods qu’une de ses versions, ou même nom). Confirme le lien pour le garder.</span>
        </Banner>
      )}
      {banner}
    </>
  )
}

/** Le détail d'un profil CurseForge, et le modpack qui en vient. */
export function ProfileDetail({ profile }: { profile: ProfileView }) {
  const library = useStudio((s) => s.library)
  const pack = useStudio((s) => (profile.pack ? (s.overview?.packs.find((p) => p.folder === profile.pack!.folder) ?? null) : null))
  const run = useStudio((s) => s.run)
  const folder = library?.folders.find((f) => f.profiles.some((p) => p.path === profile.path))
  const meta = [
    profile.minecraftVersion && `Minecraft ${profile.minecraftVersion}`,
    formatLoader(profile.modLoader),
    profile.modCount !== null && `${profile.modCount} mod${profile.modCount > 1 ? 's' : ''}`,
    profile.lastPlayed && `joué ${formatRelative(profile.lastPlayed)}`
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-6">
      <section className="animate-rise rounded-3xl bg-ink-850 p-6 ring-1 ring-white/[0.06]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-curseforge uppercase">
              <Folder size={13} /> {folder?.name ?? 'CurseForge'}
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-100">{profile.name}</h2>
            <p className="mt-1 text-sm text-ink-400">{meta}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.curseforgeProjectId && (
              <Button
                size="sm"
                variant="ghost"
                icon={ExternalLink}
                onClick={() => openLink(`https://www.curseforge.com/projects/${profile.curseforgeProjectId}`)}
              >
                Sur CurseForge
              </Button>
            )}
            {pack && profile.link === 'saved' && (
              <Button size="sm" variant="ghost" icon={Unlink} onClick={() => void run(window.studio.linkProfile(pack.folder, null), 'Lien retiré')}>
                Délier
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => openPath(profile.path)}>
              Ouvrir le dossier
            </Button>
          </div>
        </div>
        <ProfileStatus profile={profile} pack={pack} />
        <ProfileUpdates profile={profile} />
      </section>
      {pack && <PackCard pack={pack} index={1} />}
    </div>
  )
}

/** Un modpack dont le profil source n'est pas connu : sa carte, et de quoi le lier à un profil. */
export function UnlinkedPackDetail({ pack }: { pack: PackView }) {
  const library = useStudio((s) => s.library)
  const run = useStudio((s) => s.run)
  const options = useMemo(
    () =>
      (library?.folders ?? [])
        .flatMap((f) => f.profiles)
        .filter((p) => !p.installedPack)
        .map((p) => ({ value: p.path, label: p.pack ? `${p.name} (${p.pack.name})` : p.name })),
    [library]
  )
  return (
    <div className="space-y-6">
      <Banner
        icon={Link2}
        tone="bg-white/[0.04] text-ink-200 ring-white/[0.08]"
        actions={
          <LinkPicker options={options} onLink={(path) => void run(window.studio.linkProfile(pack.folder, path), 'Profil lié au modpack')} />
        }
      >
        <strong className="font-semibold">
          {pack.profile ? `Le profil « ${pack.profile.name} » n’est plus dans CurseForge.` : 'Aucun profil CurseForge n’est lié à ce modpack.'}
        </strong>{' '}
        <span className="text-ink-300">Lie-le au profil d’où viennent ses versions pour suivre ses changements.</span>
      </Banner>
      <PackCard pack={pack} index={0} />
    </div>
  )
}
