// Publication d'un mod sur Modrinth depuis sa carte : lien avec le projet, versions du projet, mise en ligne.
import { useEffect, useState } from 'react'
import { ExternalLink, Link2, Upload } from 'lucide-react'
import type { ModrinthVersionView, ModVersionView, PackModrinth, PackView } from '../../../shared/studio'
import { Button } from '../components/Button'
import { Field, Modal, Spinner, TextInput } from './Modal'
import { Pill } from './PackCard'
import { openLink, useStudio } from './store'

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

/** État sur Modrinth d'une version, ou bouton pour l'y mettre en ligne (la plus récente seulement). */
export function ModrinthVersionStatus({ pack, version, latest, modrinth }: { pack: PackView; version: ModVersionView; latest: boolean; modrinth: ModrinthVersions }) {
  const openDialog = useStudio((s) => s.openDialog)
  if (!pack.modrinth) return null
  const found = modrinth.versions?.find((v) => v.version === version.version)
  if (found) {
    return (
      <Pill className={found.status === 'listed' ? LIVE : OTHER} title={`Modrinth : ${found.name} (${found.status})`}>
        {found.status === 'listed' ? 'Publiée sur Modrinth' : `Modrinth : ${found.status}`}
      </Pill>
    )
  }
  if (!modrinth.versions) return version.modrinthVersionId ? <span className="text-xs text-ink-500">Modrinth…</span> : null
  if (!latest || pack.errors.length) return null
  return (
    <Button size="sm" variant="ghost" icon={Upload} className="text-modrinth" onClick={() => openDialog({ kind: 'modrinth-publish', folder: pack.folder, version: version.version })}>
      Publier sur Modrinth
    </Button>
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
      subtitle={pack.modrinth ? `« ${pack.name} » est lié à son projet Modrinth.` : 'Lie ce mod au projet que tu as créé sur Modrinth.'}
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
          <Field label="Projet Modrinth" hint="L’adresse de sa page (modrinth.com/mod/…), son slug ou son identifiant. Le projet se crée une fois sur le site.">
            <TextInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder="https://modrinth.com/mod/…" autoFocus />
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
export function PublishModrinthDialog({ folder, version }: { folder: string; version: string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const [releaseType, setReleaseType] = useState<'release' | 'beta' | 'alpha'>('release')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  useEffect(() => window.studio.onCurseForgeProgress(setStep), [])
  const view = pack?.modVersions.find((v) => v.version === version)
  if (!pack || !view) return null
  const dependencies = [...new Set(view.files.flatMap((f) => f.dependencies))]
  const minecraft = [...new Set(view.files.flatMap((f) => f.minecraftVersions))]
  const loaders = [...new Set(view.files.flatMap((f) => f.loaders))]

  async function publish() {
    setBusy(true)
    try {
      const result = await window.studio.publishModrinth(folder, version, releaseType)
      if (!result.ok) return pushToast({ kind: 'error', title: 'Envoi impossible', message: result.error })
      pushToast({
        kind: 'success',
        title: `Version ${version} publiée sur Modrinth`,
        message: result.unknownDependencies.length ? `Dépendances introuvables sur Modrinth, à ajouter depuis le site : ${result.unknownDependencies.join(', ')}.` : undefined
      })
      close()
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return (
    <Modal
      title={`Publier la version ${version} sur Modrinth`}
      subtitle="Ses jars sont envoyés sur le projet du mod, visibles tout de suite si le projet est approuvé. Une version envoyée se retire depuis le site."
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
            Publier sur Modrinth
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink-300">
          Nom : <span className="text-ink-100">{`${pack.name} ${version}`}</span> · numéro <span className="font-mono text-ink-100">{version}</span>
        </p>
        <p className="text-ink-300">
          Fichiers : <span className="font-mono text-ink-100">{view.files.map((f) => f.fileName).join(', ')}</span>
        </p>
        <p className="text-ink-300">
          Minecraft <span className="text-ink-100">{minecraft.join(', ') || '?'}</span> · chargeurs <span className="text-ink-100">{loaders.join(', ')}</span>
        </p>
        <p className="text-ink-300">
          Dépendances obligatoires : <span className="text-ink-100">{dependencies.length ? dependencies.join(', ') : 'aucune'}</span>
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
              <input type="radio" name="modrinth-release-type" checked={releaseType === type} onChange={() => setReleaseType(type)} />
              {type === 'release' ? 'Version stable' : type === 'beta' ? 'Bêta' : 'Alpha'}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}
