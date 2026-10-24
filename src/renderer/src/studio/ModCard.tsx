// Un mod, un pack de ressources ou un shader dans le Studio : son dossier lié (où son projet dépose ses jars, ou le
// dossier du pack en cours de création), ses versions, et leur publication sur GitHub, CurseForge et Modrinth.
import { useEffect, useState } from 'react'
import { Blocks, FileArchive, FolderOpen, FolderSync, Gamepad2, Hourglass, Image, Link2Off, NotebookPen, PackagePlus, Pencil, Server, Sun, Trash2, Upload } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CONTENT_KINDS, LOADER_LABELS, type ContentKind, type ContentLoader } from '../../../shared/content'
import type { AvailableModVersion, CurseForgeVersion, ContentVersionView, PackView } from '../../../shared/studio'
import { Button, IconButton } from '../components/Button'
import { Cover } from '../components/Cover'
import { formatBytes, formatDate } from '../lib/format'
import { CurseForgeLine, useCurseForgeVersions, type CurseForgeVersions } from './CurseForgePanel'
import { ModrinthLine, ModrinthVersionStatus, useModrinthVersions, type ModrinthVersions } from './ModrinthPanel'
import { HangarLine, HangarVersionStatus, useHangarVersions, type HangarVersions } from './HangarPanel'
import { Field, Modal, Spinner, TextInput } from './Modal'
import { DANGER_HOVER, Message, Pill, RemoteOnlyRow, Row, STATUS, VersionBadge } from './PackCard'
import { openPath, useStudio } from './store'

/** Chargeurs à afficher : Quilt charge les mods Fabric, il n'est cité que pour un mod qui le vise seul. */
function loadersLabel(loaders: ContentLoader[]): string {
  return loaders.filter((l) => !(l === 'quilt' && loaders.includes('fabric'))).map((l) => LOADER_LABELS[l]).join(', ')
}

const SIDES = { client: 'client seulement', server: 'serveur seulement', both: 'client et serveur' }

/** Icône et mention de chaque type de contenu (sauf le modpack, qui a sa propre carte). */
export const KIND_UI: Partial<Record<ContentKind, { icon: LucideIcon; badge: string }>> = {
  mod: { icon: Blocks, badge: 'Mod' },
  resourcepack: { icon: Image, badge: 'Pack de ressources' },
  shader: { icon: Sun, badge: 'Shader' },
  plugin: { icon: Server, badge: 'Plugin' }
}

/** Mod ou plugin : jars, version déclarée, dossier lié dont on importe les versions. */
const jarBased = (pack: PackView) => pack.type === 'mod' || pack.type === 'plugin'

/** Versions numérotées par le Studio (pack de ressources, shader) : « v3 ». */
const numbered = (pack: PackView) => CONTENT_KINDS[pack.type].versioning === 'number'
export const versionLabel = (pack: PackView, version: string) => (numbered(pack) ? `v${version}` : `version ${version}`)

function fileMeta(pack: PackView, file: ContentVersionView['files'][number]): string {
  return [
    formatBytes(file.size),
    file.minecraftVersions.length ? `Minecraft ${file.minecraftVersions.join(', ')}` : 'version de Minecraft non précisée',
    loadersLabel(file.loaders),
    pack.type === 'mod' && SIDES[file.side]
  ]
    .filter(Boolean)
    .join(' · ')
}

const CURSEFORGE_LIVE = 'bg-curseforge/15 text-curseforge ring-curseforge/30'
const CURSEFORGE_REVIEW = 'bg-sky-400/15 text-sky-300 ring-sky-400/30'

/** État sur CurseForge d'une version : rapprochée d'un fichier du projet, ou bouton pour l'y mettre en ligne. */
function ModCurseForgeStatus({ pack, version, latest, curseforge }: { pack: PackView; version: ContentVersionView; latest: boolean; curseforge: CurseForgeVersions }) {
  const openDialog = useStudio((s) => s.openDialog)
  if (!pack.curseforge) return null
  const found: CurseForgeVersion | undefined = curseforge.versions?.find((v) => v.version === version.version)
  if (found) {
    const live = found.status === 4 || found.status === 10
    return <Pill className={live ? CURSEFORGE_LIVE : CURSEFORGE_REVIEW}>{live ? 'Publiée sur CurseForge' : `CurseForge : ${found.label}`}</Pill>
  }
  if (!curseforge.versions) return version.curseforgeFileId ? <span className="text-xs text-ink-500">CurseForge…</span> : null
  // Seule la version la plus récente se publie : une plus ancienne passerait après des versions déjà en ligne.
  if (!latest || pack.errors.length) return null
  return (
    <Button size="sm" variant="ghost" icon={Upload} className="text-curseforge" onClick={() => openDialog({ kind: 'mod-curseforge-publish', folder: pack.folder, version: version.version })}>
      Publier sur CurseForge
    </Button>
  )
}

function ModVersionRow({
  pack,
  version,
  latest,
  curseforge,
  modrinth,
  hangar
}: {
  pack: PackView
  version: ContentVersionView
  latest: boolean
  curseforge: CurseForgeVersions
  modrinth: ModrinthVersions
  hangar: HangarVersions
}) {
  const openDialog = useStudio((s) => s.openDialog)
  const status = STATUS[version.remote]
  return (
    <Row
      badge={<VersionBadge>{numbered(pack) ? `v${version.version}` : version.version.split('-')[0]}</VersionBadge>}
      aside={
        <>
          <Button
            size="sm"
            variant="ghost"
            icon={NotebookPen}
            onClick={() => openDialog({ kind: 'notes', folder: pack.folder, version: version.version })}
            className={version.notes ? 'text-grass-300' : ''}
          >
            {version.notes ? 'Notes' : 'Ajouter des notes'}
          </Button>
          <IconButton
            icon={Trash2}
            size={16}
            label={`Supprimer la ${versionLabel(pack, version.version)}`}
            className={DANGER_HOVER}
            onClick={() => openDialog({ kind: 'delete', target: { type: 'mod-version', folder: pack.folder, version: version.version } })}
          />
        </>
      }
    >
      <p className="font-medium text-ink-100 select-text">{numbered(pack) ? version.files[0]?.fileName : `Version ${version.version}`}</p>
      {version.files.map((file) => (
        <p key={file.fileName} className="mt-0.5 text-xs text-ink-400">
          {!numbered(pack) && <span className="font-mono text-ink-300 select-text">{file.fileName} · </span>}
          {fileMeta(pack, file)} · {formatDate(version.modifiedAt)}
        </p>
      ))}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {pack.github && (
          <Pill className={status.className} title={version.changes.join('\n') || undefined}>
            {status.label}
          </Pill>
        )}
        <ModCurseForgeStatus pack={pack} version={version} latest={latest} curseforge={curseforge} />
        <ModrinthVersionStatus pack={pack} version={version} latest={latest} modrinth={modrinth} />
        <HangarVersionStatus pack={pack} version={version} latest={latest} hangar={hangar} />
      </div>
      {version.remote === 'update' &&
        version.changes.map((change) => (
          <p key={change} className="mt-1 text-xs text-amber-glow/80">
            ↻ {change}
          </p>
        ))}
    </Row>
  )
}

/** Où le contenu prend ses versions : le dossier où le projet d'un mod dépose ses jars, ou celui d'un pack. */
function SourceLine({ pack, available }: { pack: PackView; available: AvailableModVersion[] | null }) {
  const openDialog = useStudio((s) => s.openDialog)
  const run = useStudio((s) => s.run)
  const mod = jarBased(pack)
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-300">
      <FolderSync size={14} className="shrink-0 text-ink-400" />
      {pack.source ? (
        <>
          <span>{mod ? 'Versions prises dans' : 'Pack en cours de création dans'}</span>
          <button type="button" className="max-w-full truncate font-mono text-xs text-ink-200 hover:underline" onClick={() => openPath(pack.source!)} title="Ouvrir dans l’Explorateur">
            {pack.source}
          </button>
          {available && available.length > 0 && (
            <button type="button" className="text-xs font-semibold text-grass-300 hover:text-grass-400" onClick={() => openDialog({ kind: 'mod-import', folder: pack.folder })}>
              {available.length > 1 ? `${available.length} versions à importer` : `Version ${available[0].version} à importer`}
            </button>
          )}
          <button type="button" className="text-xs font-semibold text-ink-400 hover:text-ink-100" onClick={() => void run(window.studio.linkModSource(pack.folder, 'pick'))}>
            Changer
          </button>
          <IconButton icon={Link2Off} size={14} label="Retirer le lien" className="size-7!" onClick={() => void run(window.studio.linkModSource(pack.folder, null), 'Lien retiré')} />
        </>
      ) : (
        <>
          <span>Aucun dossier lié : dépose ses {mod ? 'jars' : 'zips'} dans son dossier, ou</span>
          <button type="button" className="text-xs font-semibold text-grass-300 hover:text-grass-400" onClick={() => void run(window.studio.linkModSource(pack.folder, 'pick'), 'Dossier lié')}>
            {mod ? 'lie-le au dossier de son projet' : 'lie-le au dossier du pack'}
          </button>
        </>
      )}
    </p>
  )
}

/** Versions du dossier lié pas encore importées, relues quand le mod change. */
function useAvailableVersions(pack: PackView): AvailableModVersion[] | null {
  const [available, setAvailable] = useState<AvailableModVersion[] | null>(null)
  const key = JSON.stringify([pack.source, pack.contentVersions.map((v) => v.version)])
  useEffect(() => {
    setAvailable(null)
    if (!pack.source || !jarBased(pack)) return
    let alive = true
    void window.studio.availableModVersions(pack.folder).then((r) => alive && setAvailable(r.ok ? r.versions : []))
    return () => {
      alive = false
    }
  }, [pack.folder, key])
  return available
}

/** Pack de ressources ou shader : versions de Minecraft visées, lues dans le zip ou données à la main. */
function MinecraftLine({ pack }: { pack: PackView }) {
  const openDialog = useStudio((s) => s.openDialog)
  const fromZip = pack.contentVersions[0]?.files[0]?.minecraftVersions ?? []
  const shown = pack.minecraftVersions.length ? pack.minecraftVersions : fromZip
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-300">
      <Gamepad2 size={14} className="shrink-0 text-ink-400" />
      {shown.length ? (
        <span>
          Minecraft {shown.join(', ')}
          <span className="text-ink-500">
            {pack.minecraftVersions.length ? ' (données à la main)' : pack.type === 'plugin' ? ' (d’après api-version : la plus ancienne visée)' : ' (d’après pack.mcmeta)'}
          </span>
        </span>
      ) : (
        <span className="text-amber-glow">Versions de Minecraft à préciser : les sites de publication les exigent.</span>
      )}
      <button type="button" className="text-xs font-semibold text-grass-300 hover:text-grass-400" onClick={() => openDialog({ kind: 'minecraft-versions', folder: pack.folder })}>
        Changer
      </button>
    </p>
  )
}

export function ModCard({ pack, index }: { pack: PackView; index: number }) {
  const openDialog = useStudio((s) => s.openDialog)
  const run = useStudio((s) => s.run)
  const kind = KIND_UI[pack.type] ?? KIND_UI.mod!
  const label = CONTENT_KINDS[pack.type].label
  const curseforge = useCurseForgeVersions(pack.folder, pack.curseforge)
  const modrinth = useModrinthVersions(pack.folder, pack.modrinth)
  const hangar = useHangarVersions(pack.folder, pack.hangar)
  const available = useAvailableVersions(pack)
  const empty = !pack.contentVersions.length && !pack.remoteOnly.length && !pack.pending.length

  return (
    <section
      className="animate-rise relative overflow-hidden rounded-3xl bg-ink-850 ring-1 ring-tint/[0.06]"
      style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
    >
      <div className="flex gap-6 p-6">
        <button
          type="button"
          onClick={() => openDialog({ kind: 'pack-info', folder: pack.folder })}
          className="group relative aspect-square w-32 shrink-0 overflow-hidden rounded-2xl ring-1 ring-tint/10"
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
            <span className="inline-flex items-center gap-1 rounded-md bg-tint/[0.06] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-ink-300 uppercase">
              <kind.icon size={11} /> {kind.badge}
            </span>
            <span className="font-mono text-xs text-ink-500 select-text" title="Identifiant publié sur GitHub">
              {pack.id}
            </span>
          </div>
          {pack.description ? (
            <p className="mt-1.5 line-clamp-2 text-sm text-ink-300">{pack.description}</p>
          ) : (
            <p className="mt-1.5 text-sm text-ink-500 italic">Pas encore de description.</p>
          )}
          <SourceLine pack={pack} available={available} />
          {pack.type !== 'mod' && <MinecraftLine pack={pack} />}
          {pack.type !== 'plugin' && <CurseForgeLine pack={pack} curseforge={curseforge} />}
          <ModrinthLine pack={pack} modrinth={modrinth} />
          {pack.type === 'plugin' && <HangarLine pack={pack} hangar={hangar} />}
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <Button size="sm" icon={Pencil} onClick={() => openDialog({ kind: 'pack-info', folder: pack.folder })}>
              Infos et image
            </Button>
            {pack.source && jarBased(pack) && (
              <Button size="sm" icon={PackagePlus} disabled={!available?.length} onClick={() => openDialog({ kind: 'mod-import', folder: pack.folder })}>
                Importer des versions
              </Button>
            )}
            {pack.source && !jarBased(pack) && (
              <Button size="sm" icon={PackagePlus} onClick={() => void run(window.studio.zipContentVersion(pack.folder), `v${pack.nextVersion} créée depuis le dossier du pack`)}>
                Créer la v{pack.nextVersion} depuis le dossier
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => openPath(pack.dir)}>
              Ouvrir le dossier
            </Button>
            <IconButton
              icon={Trash2}
              size={16}
              label={`Supprimer le ${label}`}
              className={`ml-auto ${DANGER_HOVER}`}
              onClick={() => openDialog({ kind: 'delete', target: { type: 'pack', folder: pack.folder } })}
            />
          </div>
        </div>
      </div>

      {pack.errors.length > 0 && (
        <div className="mx-6 mb-4 rounded-xl bg-red-500/10 px-4 py-3 ring-1 ring-inset ring-red-400/25">
          <p className="text-sm font-semibold text-red-300">Ce {label} ne sera pas publié tant que ceci n’est pas corrigé :</p>
          {pack.errors.map((error) => (
            <p key={error} className="mt-1 text-sm text-ink-200 select-text">
              {error}
            </p>
          ))}
        </div>
      )}

      <div className="border-t border-tint/[0.05] px-2 py-2">
        {pack.pending.map((zip, i) => (
          <Row
            key={zip.fileName}
            badge={<VersionBadge tone="muted">{zip.error ? '—' : `v${pack.nextVersion + i}`}</VersionBadge>}
            aside={
              zip.error ? (
                <Pill className={STATUS.blocked.className}>Refusé</Pill>
              ) : (
                <Pill className="bg-tint/[0.06] text-ink-200 ring-tint/10" icon={Hourglass}>
                  À ranger
                </Pill>
              )
            }
          >
            <p className="font-medium break-all text-ink-200 select-text">{zip.fileName}</p>
            <p className="mt-0.5 text-xs text-ink-400">
              {formatBytes(zip.size)} · {formatDate(zip.modifiedAt)}
            </p>
            {zip.error && <Message tone="error">{zip.error}</Message>}
          </Row>
        ))}
        {pack.contentVersions.map((version, i) => (
          <ModVersionRow key={version.version} pack={pack} version={version} latest={i === 0} curseforge={curseforge} modrinth={modrinth} hangar={hangar} />
        ))}
        {pack.remoteOnly.map((version) => (
          <RemoteOnlyRow key={version.tag} pack={pack} version={version} />
        ))}
        {pack.badJars.map((jar) => (
          <Row key={jar.fileName} badge={<VersionBadge tone="muted">—</VersionBadge>}>
            <p className="font-medium break-all text-ink-200 select-text">{jar.fileName}</p>
            <Message tone="error">{jar.error}</Message>
          </Row>
        ))}
        {empty && !pack.badJars.length && (
          <div className="flex items-center gap-4 px-4 py-5 text-sm text-ink-400">
            <FileArchive size={22} className="shrink-0 text-ink-500" />
            <span>
              {jarBased(pack)
                ? 'Aucune version pour l’instant : importe-en une depuis le dossier lié, ou dépose ses jars dans son dossier.'
                : 'Aucune version pour l’instant : crée-la depuis le dossier lié, ou dépose ses zips dans son dossier.'}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

function usePack(folder: string) {
  return useStudio((s) => s.overview?.packs.find((p) => p.folder === folder) ?? null)
}

/** Choix des versions du dossier lié à copier dans le Studio. */
export function ModImportDialog({ folder }: { folder: string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const [available, setAvailable] = useState<AvailableModVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.studio.availableModVersions(folder).then((r) => {
      if (!r.ok) return setError(r.error)
      setAvailable(r.versions)
      setChosen(new Set(r.versions.slice(0, 1).map((v) => v.version)))
    })
  }, [folder])
  if (!pack) return null

  const toggle = (version: string) => {
    const next = new Set(chosen)
    if (next.has(version)) next.delete(version)
    else next.add(version)
    setChosen(next)
  }

  async function importVersions() {
    setBusy(true)
    try {
      const result = await window.studio.importModVersions(folder, [...chosen])
      if (!result.ok) return pushToast({ kind: 'error', title: 'Import impossible', message: result.error })
      pushToast({
        kind: 'success',
        title: result.imported.length > 1 ? `${result.imported.length} versions importées` : `Version ${result.imported[0]} importée`,
        message: 'Elles partiront sur GitHub à la prochaine publication.'
      })
      close()
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return (
    <Modal
      title="Importer des versions"
      subtitle={`Depuis ${pack.source ?? 'le dossier lié'}. Les jars sont copiés dans le dossier du mod : le dossier de son projet n’est pas touché.`}
      onClose={close}
      closable={!busy}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" disabled={busy} onClick={close}>
            Annuler
          </Button>
          <Button variant="primary" icon={PackagePlus} disabled={busy || !chosen.size} onClick={() => void importVersions()}>
            Importer {chosen.size > 1 ? `${chosen.size} versions` : 'la version'}
          </Button>
        </>
      }
    >
      {error ? (
        <p className="text-sm text-red-300 select-text">{error}</p>
      ) : !available ? (
        <p className="flex items-center gap-2 text-sm text-ink-300">
          <Spinner /> Lecture du dossier lié…
        </p>
      ) : !available.length ? (
        <p className="text-sm text-ink-400">Toutes les versions du dossier lié sont déjà dans le Studio.</p>
      ) : (
        <ul className="divide-y divide-tint/[0.05]">
          {available.map((v) => (
            <li key={v.version}>
              <label className="flex cursor-pointer items-start gap-3 py-3">
                <input type="checkbox" className="mt-0.5" checked={chosen.has(v.version)} onChange={() => toggle(v.version)} />
                <span className="min-w-0">
                  <span className="block font-medium text-ink-100">Version {v.version}</span>
                  {v.files.map((f) => (
                    <span key={f.fileName} className="block text-xs text-ink-400">
                      <span className="font-mono">{f.fileName}</span> · Minecraft {f.minecraftVersions.join(', ') || '?'} · {loadersLabel(f.loaders)}
                    </span>
                  ))}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/** Mise en ligne d'une version du mod sur CurseForge, après confirmation. */
export function PublishModCurseForgeDialog({ folder, version }: { folder: string; version: string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const [releaseType, setReleaseType] = useState<'release' | 'beta' | 'alpha'>('release')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  useEffect(() => window.studio.onCurseForgeProgress(setStep), [])
  const view = pack?.contentVersions.find((v) => v.version === version)
  if (!pack || !view) return null
  const dependencies = [...new Set(view.files.flatMap((f) => f.dependencies))]

  async function publish() {
    setBusy(true)
    try {
      const result = await window.studio.publishModCurseForge(folder, version, releaseType)
      if (!result.ok) return pushToast({ kind: 'error', title: 'Envoi impossible', message: result.error })
      pushToast({
        kind: 'success',
        title: `${versionLabel(pack!, version).replace(/^./, (c) => c.toUpperCase())} envoyée sur CurseForge`,
        message: result.unknownDependencies.length
          ? `Elle sera visible une fois acceptée par la modération. Dépendances introuvables sur CurseForge, à ajouter depuis le site : ${result.unknownDependencies.join(', ')}.`
          : 'Elle sera visible une fois acceptée par la modération.'
      })
      close()
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return (
    <Modal
      title={`Publier la ${versionLabel(pack, version)} sur CurseForge`}
      subtitle="Chaque fichier est envoyé sur le projet du mod et passe en modération avant d’être visible. Un fichier envoyé ne se retire que depuis le site."
      onClose={close}
      closable={!busy}
      footer={
        <>
          {busy ? (
            <span className="flex flex-1 items-center gap-2 text-sm text-ink-300">
              <Spinner /> {step ?? 'Préparation…'}
            </span>
          ) : (
            <div className="flex-1" />
          )}
          <Button variant="ghost" disabled={busy} onClick={close}>
            Annuler
          </Button>
          <Button variant="primary" icon={Upload} disabled={busy} onClick={() => void publish()}>
            Publier sur CurseForge
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {view.files.map((file) => (
          <div key={file.fileName} className="rounded-xl bg-ink-950/50 px-4 py-3 ring-1 ring-inset ring-tint/[0.06]">
            <p className="text-ink-300">
              Nom affiché :{' '}
              <span className="font-mono text-ink-100 select-text">{numbered(pack) ? `${pack.name} v${version}` : file.fileName.replace(/\.jar$/i, '')}</span>
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {fileMeta(pack, file)}
            </p>
          </div>
        ))}
        <p className="text-ink-300">
          Dépendances obligatoires : <span className="text-ink-100">{dependencies.length ? dependencies.join(', ') : 'aucune'}</span>
          {dependencies.length > 0 && <span className="text-ink-400"> (liées à leur projet CurseForge quand il porte le même nom)</span>}
        </p>
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-widest text-ink-400 uppercase">Notes de version</p>
          {view.notes ? (
            <pre className="max-h-40 overflow-auto rounded-xl bg-ink-950/60 p-3 font-sans text-[13px] whitespace-pre-wrap text-ink-200 select-text">{view.notes}</pre>
          ) : (
            <p className="text-amber-glow">Pas encore de notes : « Version {version} » sera affiché. Ajoute-les d’abord pour tes joueurs.</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-widest text-ink-400 uppercase">Type</span>
          {(['release', 'beta', 'alpha'] as const).map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-1.5 text-ink-200">
              <input type="radio" name="mod-release-type" checked={releaseType === type} onChange={() => setReleaseType(type)} />
              {type === 'release' ? 'Version stable' : type === 'beta' ? 'Bêta' : 'Alpha'}
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-500">Modifiée le {formatDate(view.modifiedAt)}.</p>
      </div>
    </Modal>
  )
}

/** Versions de Minecraft d'un pack de ressources ou d'un shader, données à la main. */
export function MinecraftVersionsDialog({ folder }: { folder: string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const [text, setText] = useState((pack?.minecraftVersions ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  if (!pack) return null
  const fromZip = pack.contentVersions[0]?.files[0]?.minecraftVersions ?? []

  async function save(versions: string[]) {
    setBusy(true)
    try {
      const result = await window.studio.setMinecraftVersions(folder, versions)
      if (!result.ok) return pushToast({ kind: 'error', title: 'Enregistrement impossible', message: result.error })
      pushToast({ kind: 'success', title: result.versions.length ? `Minecraft ${result.versions.join(', ')}` : 'Versions lues dans le zip' })
      close()
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return (
    <Modal
      title="Versions de Minecraft"
      subtitle={`${pack.name} · envoyées à CurseForge et Modrinth, et décrites dans ses releases GitHub.`}
      onClose={close}
      closable={!busy}
      footer={
        <>
          {pack.minecraftVersions.length > 0 && pack.type === 'resourcepack' && (
            <Button variant="ghost" disabled={busy} onClick={() => void save([])}>
              Reprendre celles du zip
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" disabled={busy} onClick={close}>
            Annuler
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save(text.split(/[\s,;]+/).filter(Boolean))}>
            Enregistrer
          </Button>
        </>
      }
    >
      <Field
        label="Versions"
        hint={
          pack.type === 'shader'
            ? 'Un shader ne dit pas pour quelles versions il est fait : donne-les, séparées par des virgules (« 1.21.1, 26.3 »).'
            : pack.type === 'plugin'
              ? `Son api-version (${fromZip.join(', ') || 'absente'}) ne donne que la plus ancienne visée : donne toutes celles où il fonctionne (« 1.21.4, 1.21.8 »).`
              : `Lues dans pack.mcmeta : ${fromZip.join(', ') || 'aucune reconnue'}. À donner seulement pour les remplacer.`
        }
      >
        <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="26.3" autoFocus />
      </Field>
    </Modal>
  )
}

/** Créer un mod (depuis le dossier de ses jars), un pack de ressources ou un shader (depuis son dossier ou un zip). */
export function NewContentDialog() {
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const select = useStudio((s) => s.select)
  const [busy, setBusy] = useState(false)

  async function create(run: () => Promise<{ ok: true; folder: string | null } | { ok: false; error: string }>, what: string) {
    setBusy(true)
    try {
      const result = await run()
      if (!result.ok) return pushToast({ kind: 'error', title: 'Création impossible', message: result.error })
      if (!result.folder) return
      await refresh()
      select({ kind: 'pack', folder: result.folder })
      pushToast({ kind: 'success', title: `${what} créé` })
      close()
    } finally {
      setBusy(false)
    }
  }

  const choices: Array<{ kind: ContentKind; text: string; actions: Array<{ label: string; run: () => void }> }> = [
    {
      kind: 'mod',
      text: 'Depuis le dossier où son projet dépose ses jars (releases, build/libs…), qui reste lié : ses nouvelles versions s’y importent en un clic.',
      actions: [{ label: 'Choisir le dossier des jars…', run: () => void create(() => window.studio.createModFromSource(), 'Mod') }]
    },
    {
      kind: 'resourcepack',
      text: 'Depuis le dossier du pack en cours de création (avec pack.mcmeta), qui reste lié et se zippe à chaque version, ou depuis un zip.',
      actions: [
        { label: 'Choisir le dossier…', run: () => void create(() => window.studio.createPackContent('resourcepack', 'folder'), 'Pack de ressources') },
        { label: 'Choisir un zip…', run: () => void create(() => window.studio.createPackContent('resourcepack', 'zip'), 'Pack de ressources') }
      ]
    },
    {
      kind: 'shader',
      text: 'Depuis le dossier du shader en cours de création (avec son dossier shaders/), ou depuis un zip. Ses versions de Minecraft sont à donner ensuite.',
      actions: [
        { label: 'Choisir le dossier…', run: () => void create(() => window.studio.createPackContent('shader', 'folder'), 'Shader') },
        { label: 'Choisir un zip…', run: () => void create(() => window.studio.createPackContent('shader', 'zip'), 'Shader') }
      ]
    },
    {
      kind: 'plugin',
      text: 'Un plugin de serveur (Paper, Spigot…), depuis le dossier où son projet dépose ses jars (target, build/libs…), qui reste lié. Il se publie sur Modrinth et Hangar.',
      actions: [{ label: 'Choisir le dossier des jars…', run: () => void create(() => window.studio.createModFromSource('plugin'), 'Plugin') }]
    }
  ]

  return (
    <Modal title="Nouveau contenu" subtitle="Il aura son dossier dans le dossier des modpacks, comme un modpack." onClose={close} closable={!busy} width="max-w-3xl">
      <div className="space-y-3">
        {choices.map(({ kind, text, actions }) => {
          const ui = KIND_UI[kind]!
          return (
            <div key={kind} className="flex items-start gap-4 rounded-2xl bg-ink-800/50 p-4 ring-1 ring-inset ring-tint/[0.06]">
              <ui.icon size={22} className="mt-0.5 shrink-0 text-grass-300" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold text-ink-100">{ui.badge}</p>
                <p className="mt-0.5 text-sm text-ink-300">{text}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {actions.map((action) => (
                    <Button key={action.label} size="sm" disabled={busy} onClick={action.run}>
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
