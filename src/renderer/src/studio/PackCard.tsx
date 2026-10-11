import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CircleAlert,
  CloudOff,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  FileArchive,
  FolderOpen,
  Hourglass,
  NotebookPen,
  PackagePlus,
  Pencil,
  PowerOff,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Upload
} from 'lucide-react'
import { findPresentVersions, type PresentVersion } from '../../../shared/presence'
import type { CurseForgeFileState, ExcludedInZip, PackView, PendingZip, RemoteOnlyVersion, RemoteStatus, VersionView } from '../../../shared/studio'
import type { CurseForgeProfile } from '../../../shared/types'
import { describePresence } from '../components/Badges'
import { Button, IconButton } from '../components/Button'
import { Cover } from '../components/Cover'
import { formatBytes, formatDate, formatLoader } from '../lib/format'
import { useStore } from '../store'
import { CurseForgeLine, CurseForgeVersionStatus, useCurseForgeStatuses } from './CurseForgePanel'
import { UpdatesLine } from './MaintenancePanel'
import { describeExcluded, type SettingsTab } from './PackSettingsDialog'
import { errorMessage, openLink, openPath, useStudio } from './store'

const STATUS: Record<RemoteStatus, { label: string; className: string }> = {
  published: { label: 'En ligne', className: 'bg-grass-400/15 text-grass-300 ring-grass-400/30' },
  create: { label: 'À publier', className: 'bg-sky-400/15 text-sky-300 ring-sky-400/30' },
  update: { label: 'Modifiée', className: 'bg-amber-glow/15 text-amber-glow ring-amber-glow/35' },
  blocked: { label: 'Non publiable', className: 'bg-red-500/15 text-red-300 ring-red-400/30' },
  unknown: { label: 'GitHub non vérifié', className: 'bg-white/[0.06] text-ink-300 ring-white/10' }
}

export function Pill({
  className,
  children,
  title,
  icon: Icon
}: {
  className: string
  children: ReactNode
  title?: string
  icon?: LucideIcon
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${className}`}
    >
      {Icon ? <Icon size={12} strokeWidth={2.5} /> : <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

function Message({ tone, children }: { tone: 'warning' | 'error'; children: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : TriangleAlert
  return (
    <p className={`mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed ${tone === 'error' ? 'text-red-300' : 'text-amber-glow/90'}`}>
      <Icon size={13} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** Un zip qui partira à la prochaine publication contient des fichiers exclus dans les réglages du modpack. */
function ExcludedWarning({
  folder,
  fileName,
  label,
  excluded,
  pending
}: {
  folder: string
  fileName: string
  label: string
  excluded: ExcludedInZip
  pending: boolean
}) {
  const openDialog = useStudio((s) => s.openDialog)
  return (
    <Message tone="warning">
      Contient {describeExcluded(excluded)} : {pending ? 'ils partiront avec ce zip' : 'ils seront publiés avec cette version'}.{' '}
      <button
        type="button"
        onClick={() => openDialog({ kind: 'strip', folder, fileName, label })}
        className="inline-flex items-center gap-1 font-semibold text-amber-glow underline-offset-2 hover:underline"
      >
        <Eraser size={12} /> Retirer du zip
      </button>
    </Message>
  )
}

/** Résumé des réglages des versions du modpack ; chaque pastille ouvre l'onglet correspondant. */
function SettingsSummary({ pack }: { pack: PackView }) {
  const openDialog = useStudio((s) => s.openDialog)
  const { exclude, disabledMods, keepPlayerConfigs } = pack.settings
  const items: Array<{ tab: SettingsTab; icon: LucideIcon; label: string }> = []
  if (exclude.length) items.push({ tab: 'files', icon: EyeOff, label: `${exclude.length} exclusion${exclude.length > 1 ? 's' : ''}` })
  if (disabledMods.length) {
    items.push({
      tab: 'mods',
      icon: PowerOff,
      label: `${disabledMods.length} mod${disabledMods.length > 1 ? 's' : ''} désactivé${disabledMods.length > 1 ? 's' : ''} chez les joueurs`
    })
  }
  if (keepPlayerConfigs) items.push({ tab: 'configs', icon: ShieldCheck, label: 'Configurations des joueurs gardées' })
  if (!items.length) return null
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {items.map(({ tab, icon: Icon, label }) => (
        <button
          key={tab}
          type="button"
          onClick={() => openDialog({ kind: 'pack-settings', folder: pack.folder, tab })}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-300 ring-1 ring-inset ring-white/[0.08] transition hover:bg-white/[0.09] hover:text-ink-100"
        >
          <Icon size={12} strokeWidth={2.5} /> {label}
        </button>
      ))}
    </div>
  )
}

function Row({ badge, children, aside }: { badge: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-start gap-4 rounded-xl px-4 py-3 transition hover:bg-white/[0.03]">
      <div className="w-14 shrink-0 pt-0.5">{badge}</div>
      <div className="min-w-48 flex-1">{children}</div>
      {aside && <div className="flex flex-wrap items-center justify-end gap-2">{aside}</div>}
    </div>
  )
}

function VersionBadge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'muted' | 'removed' }) {
  const styles = {
    default: 'bg-white/[0.08] text-ink-100',
    muted: 'bg-white/[0.04] text-ink-400',
    removed: 'bg-red-500/10 text-red-300/80 line-through'
  }[tone]
  return <span className={`inline-block rounded-lg px-2 py-1 font-display text-sm font-bold ${styles}`}>{children}</span>
}

function versionMeta(version: VersionView): string {
  const a = version.analysis
  return [
    formatBytes(version.size),
    a?.minecraftVersion && `Minecraft ${a.minecraftVersion}`,
    a && formatLoader(a.modLoader),
    a?.modCount != null && `${a.modCount} mod${a.modCount > 1 ? 's' : ''}`,
    formatDate(version.modifiedAt)
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Bouton discret qui rougit au survol : supprimer est une action rare. */
const DANGER_HOVER = 'hover:bg-red-500/15! hover:text-red-300!'

/** Où en est sur GitHub la version que contient le CurseForge du publieur. */
const ONLINE: Record<RemoteStatus, string> = {
  published: ', en ligne sur GitHub.',
  update: ', en ligne sur GitHub (avec des changements à publier).',
  create: ' : elle n’est pas encore publiée.',
  blocked: ' : elle n’est pas publiable pour l’instant.',
  unknown: '.'
}

const sameName = (a: string, b: string) => {
  const normalize = (text: string) => text.replace(/[_\s]+/g, ' ').trim().toLowerCase()
  return normalize(a) === normalize(b)
}

/**
 * Dit au publieur quelle version de ce modpack son CurseForge contient, et si elle est en ligne. Sans
 * correspondance, signale le profil du même nom : ses mods ne sont ceux d'aucune version du dossier.
 */
function CurseForgeNote({
  pack,
  present,
  profiles
}: {
  pack: PackView
  present: PresentVersion[]
  profiles: CurseForgeProfile[]
}) {
  const dot = <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-curseforge" />
  if (present.length > 0) {
    return (
      <div className="mt-2.5 space-y-1">
        {present.map((p) => {
          const version = pack.versions.find((v) => String(v.number) === p.version)
          return (
            <p key={`${p.profilePath}|${p.version}`} className="flex gap-2 text-sm text-ink-300" title={describePresence(p)}>
              {dot}
              <span>
                Ton CurseForge contient la <strong className="font-semibold text-ink-100">v{p.version}</strong> (profil «{' '}
                {p.profileName} »){ONLINE[version?.remote ?? 'unknown']}
              </span>
            </p>
          )
        })}
      </div>
    )
  }
  const namesake = profiles.find((profile) => sameName(profile.name, pack.name) || sameName(profile.name, pack.folder))
  if (!namesake || pack.versions.length === 0) return null
  return (
    <p className="mt-2.5 flex gap-2 text-sm text-ink-400">
      {dot}
      <span>
        Le profil CurseForge « {namesake.name} » n’a les mods d’aucune version de ce dossier : s’il a changé depuis la v
        {pack.versions[0].number}, crée la v{pack.nextVersion} pour le publier.
      </span>
    </p>
  )
}

function VersionRow({
  pack,
  version,
  present,
  curseforge
}: {
  pack: PackView
  version: VersionView
  present: PresentVersion[]
  curseforge: CurseForgeFileState | undefined
}) {
  const openDialog = useStudio((s) => s.openDialog)
  const status = STATUS[version.remote]
  return (
    <Row
      badge={<VersionBadge>v{version.number}</VersionBadge>}
      aside={
        <>
          {present.length > 0 && (
            <Pill
              className="bg-curseforge/15 text-curseforge ring-curseforge/30"
              title={present.map(describePresence).join('\n')}
            >
              Version sur CurseForge
            </Pill>
          )}
          <CurseForgeVersionStatus pack={pack} version={version} state={curseforge} />
          {pack.github && (
            <Pill className={status.className} title={version.changes.join('\n') || undefined}>
              {status.label}
            </Pill>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={Eye}
            onClick={() =>
              openDialog({ kind: 'contents', folder: pack.folder, fileName: version.fileName, label: `la v${version.number}` })
            }
          >
            Contenu
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={NotebookPen}
            onClick={() => openDialog({ kind: 'notes', folder: pack.folder, version: version.number })}
            className={version.notes ? 'text-grass-300' : ''}
          >
            {version.notes ? 'Notes' : 'Ajouter des notes'}
          </Button>
          <IconButton
            icon={Trash2}
            size={16}
            label={`Supprimer la v${version.number}`}
            className={DANGER_HOVER}
            onClick={() => openDialog({ kind: 'delete', target: { type: 'version', folder: pack.folder, version: version.number } })}
          />
        </>
      }
    >
      <p className="truncate font-medium text-ink-100 select-text">{version.fileName}</p>
      <p className="mt-0.5 text-xs text-ink-400">{versionMeta(version)}</p>
      {version.error && <Message tone="error">{version.error}</Message>}
      {version.remote === 'update' &&
        version.changes.map((change) => (
          <p key={change} className="mt-1 text-xs text-amber-glow/80">
            ↻ {change}
          </p>
        ))}
      {version.analysis?.warnings.map((warning) => (
        <Message key={warning} tone="warning">
          {warning}
        </Message>
      ))}
      {version.excluded && (
        <ExcludedWarning
          folder={pack.folder}
          fileName={version.fileName}
          label={`la v${version.number}`}
          excluded={version.excluded}
          pending={false}
        />
      )}
    </Row>
  )
}

function PendingRow({ folder, zip, number }: { folder: string; zip: PendingZip; number: number | null }) {
  const openDialog = useStudio((s) => s.openDialog)
  return (
    <Row
      badge={<VersionBadge tone="muted">{number ? `v${number}` : '—'}</VersionBadge>}
      aside={
        <>
          {zip.error ? (
            <Pill className={STATUS.blocked.className}>Refusé</Pill>
          ) : (
            <Pill className="bg-white/[0.06] text-ink-200 ring-white/10" icon={Hourglass}>
              À ranger
            </Pill>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={Eye}
            onClick={() => openDialog({ kind: 'contents', folder, fileName: zip.fileName, label: zip.fileName })}
          >
            Contenu
          </Button>
        </>
      }
    >
      <p className="truncate font-medium text-ink-200 select-text">{zip.fileName}</p>
      <p className="mt-0.5 text-xs text-ink-400">
        {formatBytes(zip.size)} · {formatDate(zip.modifiedAt)}
        {number && !zip.error && ` · deviendra la v${number}`}
      </p>
      {zip.error && <Message tone="error">{zip.error}</Message>}
      {zip.warnings.map((warning) => (
        <Message key={warning} tone="warning">
          {warning}
        </Message>
      ))}
      {zip.excluded && <ExcludedWarning folder={folder} fileName={zip.fileName} label={zip.fileName} excluded={zip.excluded} pending />}
    </Row>
  )
}

function RemoteOnlyRow({ pack, version }: { pack: PackView; version: RemoteOnlyVersion }) {
  const openDialog = useStudio((s) => s.openDialog)
  return (
    <Row
      badge={<VersionBadge tone="removed">v{version.version}</VersionBadge>}
      aside={
        <>
          <Pill className={STATUS.blocked.className} icon={CloudOff}>
            Sera retirée
          </Pill>
          <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openLink(version.url)}>
            GitHub
          </Button>
          <IconButton
            icon={Trash2}
            size={16}
            label="Retirer de GitHub maintenant"
            className={DANGER_HOVER}
            onClick={() =>
              openDialog({
                kind: 'delete',
                target: { type: 'releases', name: pack.name, versions: [version.version], tags: [version.tag], orphan: false }
              })
            }
          />
        </>
      }
    >
      <p className="font-medium text-ink-300">{version.draft ? 'Brouillon abandonné sur GitHub' : 'Toujours sur GitHub'}</p>
      <p className="mt-0.5 text-xs text-ink-400">
        {version.draft
          ? 'Reste d’une publication interrompue : il sera supprimé.'
          : 'Son zip n’est plus dans le dossier : la release sera supprimée à la prochaine publication.'}
      </p>
    </Row>
  )
}

function useFileDrop(folder: string) {
  const [over, setOver] = useState(false)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  return {
    over,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOver(true)
      },
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      },
      onDrop: async (e: DragEvent) => {
        e.preventDefault()
        setOver(false)
        const paths = [...e.dataTransfer.files].map((file) => window.studio.getPathForFile(file)).filter(Boolean)
        if (!paths.length) return
        try {
          const result = await window.studio.importFiles(folder, paths)
          if (!result.ok) {
            pushToast({ kind: 'error', title: 'Copie impossible', message: result.error })
            return
          }
          const parts = [
            result.zips && `${result.zips} zip${result.zips > 1 ? 's' : ''} ajouté${result.zips > 1 ? 's' : ''}`,
            result.cover && 'image de couverture remplacée'
          ].filter(Boolean)
          if (parts.length) {
            pushToast({
              kind: 'success',
              title: parts.join(', ').replace(/^./, (c) => c.toUpperCase()),
              message: result.zips ? 'Clique sur « Ranger les zips » pour leur donner un numéro de version.' : undefined
            })
          }
          if (result.ignored.length) {
            pushToast({ kind: 'info', title: 'Fichiers ignorés', message: `Seuls les zips et les images sont acceptés : ${result.ignored.join(', ')}` })
          }
        } catch (err) {
          pushToast({ kind: 'error', title: 'Copie impossible', message: errorMessage(err) })
        } finally {
          void refresh()
        }
      }
    }
  }
}

export function PackCard({ pack, index }: { pack: PackView; index: number }) {
  const openDialog = useStudio((s) => s.openDialog)
  const installed = useStore((s) => s.installed)
  const profiles = useStore((s) => s.profiles)
  // Versions de ce dossier retrouvées dans le CurseForge du publieur (son profil d'origine, le plus souvent).
  const present = useMemo(() => {
    const known = pack.versions.map((v) => ({
      id: pack.id,
      version: String(v.number),
      modsSignature: v.analysis?.modsSignature ?? null
    }))
    return findPresentVersions(known, installed, profiles)
  }, [pack, installed, profiles])
  const { over, handlers } = useFileDrop(pack.folder)
  const curseforge = useCurseForgeStatuses(pack)
  const empty = !pack.versions.length && !pack.pending.length && !pack.remoteOnly.length
  let next = pack.nextVersion

  return (
    <section
      {...handlers}
      className={`animate-rise relative overflow-hidden rounded-3xl bg-ink-850 ring-1 transition ${
        over ? 'ring-2 ring-grass-400/70' : 'ring-white/[0.06]'
      }`}
      style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
    >
      <div className="flex gap-6 p-6">
        <button
          type="button"
          onClick={() => openDialog({ kind: 'pack-info', folder: pack.folder })}
          className="group relative aspect-[16/9] w-60 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10"
          title="Modifier l’image"
        >
          <Cover id={pack.id} name={pack.name} url={pack.coverUrl} className="absolute inset-0" />
          <span className="absolute inset-0 flex items-center justify-center bg-ink-950/60 text-sm font-semibold text-ink-100 opacity-0 transition group-hover:opacity-100">
            <Pencil size={16} className="mr-2" /> Image
          </span>
        </button>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink-100">{pack.name}</h2>
            <span className="font-mono text-xs text-ink-500 select-text" title="Identifiant publié sur GitHub">
              {pack.id}
            </span>
          </div>
          {pack.description ? (
            <p className="mt-1.5 line-clamp-2 text-sm text-ink-300">{pack.description}</p>
          ) : (
            <p className="mt-1.5 text-sm text-ink-500 italic">Pas encore de description.</p>
          )}
          <CurseForgeNote pack={pack} present={present} profiles={profiles} />
          <CurseForgeLine pack={pack} />
          <UpdatesLine pack={pack} />
          <SettingsSummary pack={pack} />
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <Button size="sm" icon={Pencil} onClick={() => openDialog({ kind: 'pack-info', folder: pack.folder })}>
              Infos et image
            </Button>
            <Button size="sm" icon={SlidersHorizontal} onClick={() => openDialog({ kind: 'pack-settings', folder: pack.folder })}>
              Réglages
            </Button>
            <Button size="sm" icon={PackagePlus} onClick={() => openDialog({ kind: 'import', folder: pack.folder })}>
              Créer la v{pack.nextVersion} depuis CurseForge
            </Button>
            <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => openPath(pack.dir)}>
              Ouvrir le dossier
            </Button>
            <IconButton
              icon={Trash2}
              size={16}
              label="Supprimer le modpack"
              className={`ml-auto ${DANGER_HOVER}`}
              onClick={() => openDialog({ kind: 'delete', target: { type: 'pack', folder: pack.folder } })}
            />
          </div>
        </div>
      </div>

      {pack.errors.length > 0 && (
        <div className="mx-6 mb-4 rounded-xl bg-red-500/10 px-4 py-3 ring-1 ring-inset ring-red-400/25">
          <p className="text-sm font-semibold text-red-300">Ce modpack ne sera pas publié tant que ceci n’est pas corrigé :</p>
          {pack.errors.map((error) => (
            <p key={error} className="mt-1 text-sm text-ink-200 select-text">
              {error}
            </p>
          ))}
        </div>
      )}

      <div className="border-t border-white/[0.05] px-2 py-2">
        {pack.pending.map((zip) => (
          <PendingRow key={zip.fileName} folder={pack.folder} zip={zip} number={zip.error ? null : next++} />
        ))}
        {pack.versions.map((version) => (
          <VersionRow
            key={version.fileName}
            pack={pack}
            version={version}
            present={present.filter((p) => p.version === String(version.number))}
            curseforge={curseforge[String(version.number)]}
          />
        ))}
        {pack.remoteOnly.map((version) => (
          <RemoteOnlyRow key={version.tag} pack={pack} version={version} />
        ))}
        {empty && (
          <div className="flex items-center gap-4 px-4 py-5 text-sm text-ink-400">
            <FileArchive size={22} className="shrink-0 text-ink-500" />
            <span>
              Aucun zip pour l’instant. Dépose les zips de ce modpack dans{' '}
              <button type="button" className="font-semibold text-grass-300 hover:text-grass-400" onClick={() => openPath(pack.dir)}>
                son dossier
              </button>
              , glisse-les ici, ou crée une version depuis CurseForge.
            </span>
          </div>
        )}
      </div>

      {over && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-950/75 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl bg-grass-400/15 px-6 py-4 font-semibold text-grass-300 ring-1 ring-grass-400/40">
            <Upload size={20} /> Déposer dans {pack.name}
          </div>
        </div>
      )}
    </section>
  )
}
