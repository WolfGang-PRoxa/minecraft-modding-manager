// Publication d'un mod sur Modrinth depuis sa carte : lien avec le projet, versions du projet, mise en ligne.
import { useEffect, useState, type ReactNode } from 'react'
import { ExternalLink, Link2, Upload } from 'lucide-react'
import { CONTENT_KINDS } from '../../../shared/content'
import type { ModrinthVersionView, ContentVersionView, PackModrinth, PackView } from '../../../shared/studio'
import { Button } from '../components/Button'
import { Field, Modal, TextInput } from './Modal'
import { Pill } from './PackCard'
import { openLink, useStudio } from './store'
import { publishEach, runPublication, useRunningPublication } from './publications'
import { PublishNotes } from './ModCard'
import { releaseVersion } from '../../../shared/releases'
import { PublicationBusyNote } from './PublicationsTray'

export interface ModrinthVersions {
  versions: ModrinthVersionView[] | null
  error: string | null
}

/** Versions du projet Modrinth lié, relues quand le lien ou les versions envoyées par l'application changent. */
export function useModrinthVersions(folder: string, modrinth: PackModrinth | null): ModrinthVersions {
  const [state, setState] = useState<ModrinthVersions>({ versions: null, error: null })
  const key = modrinth ? JSON.stringify([modrinth.projectId, modrinth.versions]) : ''
  useEffect(() => {
    setState({ versions: null, error: null })
    if (!key) return
    let alive = true
    void window.studio.modrinthVersions(folder).then((r) => alive && setState(r.ok ? { versions: r.versions, error: null } : { versions: null, error: r.error }))
    return () => {
      alive = false
    }
  }, [folder, key])
  return state
}

const LIVE = 'bg-modrinth/15 text-modrinth ring-modrinth/30'
const OTHER = 'bg-tint/[0.04] text-ink-300 ring-tint/10'

/**
 * État sur Modrinth d'une version, ou des versions d'un groupe, ou bouton pour mettre en ligne celles qui n'y sont
 * pas (la plus récente seulement).
 */
export function ModrinthVersionStatus({ pack, versions, latest, modrinth }: { pack: PackView; versions: ContentVersionView[]; latest: boolean; modrinth: ModrinthVersions }) {
  const openDialog = useStudio((s) => s.openDialog)
  if (!pack.modrinth) return null
  const found = versions.map((version) => modrinth.versions?.find((v) => v.version === version.version))
  const sent = found.filter((v): v is ModrinthVersionView => !!v)
  const missing = versions.filter((_, i) => !found[i])
  let pill: ReactNode = null
  if (sent.length) {
    const other = sent.find((v) => v.status !== 'listed')
    pill = (
      <Pill className={other ? OTHER : LIVE} title={sent.map((v) => `Modrinth : ${v.name} (${v.status})`).join('\n')}>
        {other ? `Modrinth : ${other.status}` : 'Publiée sur Modrinth'}
        {versions.length > 1 && missing.length ? ` (${sent.length}/${versions.length})` : ''}
      </Pill>
    )
  }
  if (!missing.length) return pill
  if (!modrinth.versions) return pill ?? (versions.some((v) => v.modrinthVersionId) ? <span className="text-xs text-ink-500">Modrinth…</span> : null)
  if (!latest || pack.errors.length) return pill
  return (
    <>
      {pill}
      <Button
        size="sm"
        variant="ghost"
        icon={Upload}
        className="text-modrinth"
        onClick={() => openDialog({ kind: 'modrinth-publish', folder: pack.folder, version: missing[0].version, versions: missing.length > 1 ? missing.map((v) => v.version) : undefined })}
      >
        {sent.length ? `Publier ${missing.length > 1 ? `les ${missing.length} autres` : 'l’autre'} sur Modrinth` : 'Publier sur Modrinth'}
      </Button>
    </>
  )
}

/** Sur la carte du mod : son projet Modrinth, ou de quoi l'y lier. */
export function ModrinthLine({ pack, modrinth }: { pack: PackView; modrinth: ModrinthVersions }) {
  const openDialog = useStudio((s) => s.openDialog)
  const count = modrinth.versions?.length ?? 0
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-300">
      <span className="size-1.5 shrink-0 rounded-full bg-modrinth" />
      {pack.modrinth ? (
        <>
          <span>
            Sur{' '}
            <button type="button" className="font-semibold text-modrinth hover:underline" onClick={() => openLink(pack.modrinth!.url)}>
              Modrinth
            </button>
          </span>
          {modrinth.versions ? (
            <span className="text-ink-400">· {count ? `${count} version${count > 1 ? 's' : ''}` : 'aucune version encore'}</span>
          ) : modrinth.error ? (
            <span className="text-ink-500" title={modrinth.error}>
              · versions illisibles
            </span>
          ) : (
            <span className="text-ink-500">· versions…</span>
          )}
          <button type="button" className="text-xs font-semibold text-grass-300 hover:text-grass-400" onClick={() => openDialog({ kind: 'modrinth', folder: pack.folder })}>
            Réglages
          </button>
        </>
      ) : (
        <button type="button" className="text-xs font-semibold text-grass-300 hover:text-grass-400" onClick={() => openDialog({ kind: 'modrinth', folder: pack.folder })}>
          Publier aussi sur Modrinth
        </button>
      )}
    </p>
  )
}

function usePack(folder: string) {
  return useStudio((s) => s.overview?.packs.find((p) => p.folder === folder) ?? null)
}

/** Lien avec le projet Modrinth du mod. */
export function ModrinthDialog({ folder }: { folder: string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const run = useStudio((s) => s.run)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  if (!pack) return null

  async function link() {
    setBusy(true)
    try {
      const result = await window.studio.linkModrinth(folder, ref)
      if (!result.ok) return pushToast({ kind: 'error', title: 'Lien impossible', message: result.error })
      pushToast({ kind: 'success', title: `Lié au projet Modrinth « ${result.slug} »` })
      close()
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return (
    <Modal
      title="Publication sur Modrinth"
      subtitle={pack.modrinth ? `« ${pack.name} » est lié à son projet Modrinth.` : `Lie ce ${CONTENT_KINDS[pack.type].label} au projet que tu as créé sur Modrinth.`}
      onClose={close}
      closable={!busy}
      footer={
        pack.modrinth ? (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(window.studio.updatePublishTargets(folder, { unlinkModrinth: true }), 'Lien avec Modrinth retiré').then((ok) => ok && close())}
            >
              Retirer le lien
            </Button>
            <div className="flex-1" />
            <Button variant="primary" onClick={close}>
              Fermer
            </Button>
          </>
        ) : undefined
      }
    >
      {pack.modrinth ? (
        <div className="space-y-3 text-sm text-ink-300">
          <p>
            Projet <span className="font-mono text-ink-100 select-text">{pack.modrinth.slug}</span> ({pack.modrinth.projectId}). Les versions déjà
            mises en ligne depuis le site sont reconnues au nom de leurs fichiers.
          </p>
          <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openLink(pack.modrinth!.url)}>
            Ouvrir la page du projet
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field
            label="Projet Modrinth"
            hint={`L’adresse de sa page (modrinth.com/${CONTENT_KINDS[pack.type].modrinth}/…), son slug ou son identifiant. Le projet se crée une fois sur le site.`}
          >
            <TextInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder={`https://modrinth.com/${CONTENT_KINDS[pack.type].modrinth}/…`} autoFocus />
          </Field>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => openLink('https://modrinth.com/dashboard/projects')}>
              Créer un projet sur Modrinth
            </Button>
            <Button variant="primary" icon={Link2} disabled={busy || !ref.trim()} onClick={() => void link()}>
              {busy ? 'Recherche…' : 'Lier'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Mise en ligne d'une version du mod sur Modrinth, après confirmation. */
export function PublishModrinthDialog({ folder, version, versions }: { folder: string; version: string; versions?: string[] }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const [releaseType, setReleaseType] = useState<'release' | 'beta' | 'alpha'>('release')
  const busy = useRunningPublication()
  const wanted = versions ?? [version]
  const views = pack?.contentVersions.filter((v) => wanted.includes(v.version)) ?? []
  if (!pack || views.length !== wanted.length) return null
  const group = views.length > 1
  const numbered = CONTENT_KINDS[pack.type].versioning === 'number'
  const dependencies = [...new Set(views.flatMap((v) => v.files.flatMap((f) => f.dependencies)))]
  const label = group ? `version ${releaseVersion(version)} (${views.length} versions)` : numbered ? `v${version}` : `version ${version}`
  const notes = [...new Set(views.map((v) => v.notes))]

  function publish() {
    // La fenêtre se ferme : l'envoi continue en arrière-plan.
    close()
    void runPublication({
      target: 'modrinth',
      subject: `${pack!.name}, ${label}`,
      run: () => publishEach(wanted, (v) => window.studio.publishModrinth(folder, v, releaseType)),
      onSuccess: (result) =>
        pushToast({
          kind: 'success',
          title: `${pack!.name} : ${label} publiée${group ? 's' : ''} sur Modrinth`,
          message: result.unknownDependencies.length ? `Dépendances introuvables sur Modrinth, à ajouter depuis le site : ${result.unknownDependencies.join(', ')}.` : undefined,
          sticky: result.unknownDependencies.length > 0
        })
    })
  }

  return (
    <Modal
      title={`Publier la ${label} sur Modrinth`}
      subtitle={
        group
          ? 'Chaque version devient une version Modrinth avec son jar, envoyées l’une après l’autre, visibles tout de suite si le projet est approuvé. Une version envoyée se retire depuis le site.'
          : 'Ses jars sont envoyés sur le projet du mod, visibles tout de suite si le projet est approuvé. Une version envoyée se retire depuis le site.'
      }
      onClose={close}
      footer={
        <>
          <PublicationBusyNote busy={busy} />
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button variant="primary" icon={Upload} disabled={!!busy} onClick={publish}>
            Publier sur Modrinth
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className={group ? 'max-h-64 space-y-2 overflow-auto' : 'space-y-4'}>
          {views.map((view) => {
            const minecraft = [...new Set(view.files.flatMap((f) => f.minecraftVersions))]
            const loaders = [...new Set(view.files.flatMap((f) => f.loaders))]
            return (
              <div key={view.version} className={group ? 'rounded-xl bg-ink-950/50 px-3 py-2 ring-1 ring-inset ring-tint/[0.06]' : 'space-y-4'}>
                <p className="text-ink-300">
                  Nom : <span className="text-ink-100">{numbered ? `${pack.name} v${view.version}` : `${pack.name} ${view.version}`}</span> · numéro{' '}
                  <span className="font-mono text-ink-100">{view.version}</span>
                </p>
                <p className={group ? 'mt-1 text-xs text-ink-400' : 'text-ink-300'}>
                  Fichiers : <span className="font-mono text-ink-100">{view.files.map((f) => f.fileName).join(', ')}</span>
                </p>
                <p className={group ? 'mt-0.5 text-xs text-ink-400' : 'text-ink-300'}>
                  Minecraft <span className="text-ink-100">{minecraft.join(', ') || '?'}</span> · chargeurs <span className="text-ink-100">{loaders.join(', ') || 'minecraft'}</span>
                </p>
              </div>
            )
          })}
        </div>
        <p className="text-ink-300">
          Dépendances obligatoires : <span className="text-ink-100">{dependencies.length ? dependencies.join(', ') : 'aucune'}</span>
        </p>
        <PublishNotes notes={notes} version={group ? releaseVersion(version) : version} />
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-widest text-ink-400 uppercase">Type</span>
          {(['release', 'beta', 'alpha'] as const).map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-1.5 text-ink-200">
              <input type="radio" name="modrinth-release-type" checked={releaseType === type} onChange={() => setReleaseType(type)} />
              {type === 'release' ? 'Version stable' : type === 'beta' ? 'Bêta' : 'Alpha'}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}
