// Publication d'un modpack sur CurseForge depuis sa carte : lien avec le projet, réglages (fichiers joints à l'export,
// GitHub ou non), versions déjà sur le projet et leur état, et mise en ligne d'une version.
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Link2, SlidersHorizontal, Upload } from 'lucide-react'
import type { CurseForgeVersion, PackCurseForge, PackView, VersionView } from '../../../shared/studio'
import { Button, IconButton } from '../components/Button'
import { Toggle } from '../components/Toggle'
import { formatDate } from '../lib/format'
import { Field, Modal, Spinner, TextArea, TextInput } from './Modal'
import { openLink, useStudio } from './store'

function usePack(folder: string) {
  return useStudio((s) => s.overview?.packs.find((p) => p.folder === folder) ?? null)
}

/** Versions du projet CurseForge lié (null tant qu'elles ne sont pas lues). */
export interface CurseForgeVersions {
  versions: CurseForgeVersion[] | null
  error: string | null
  /** Version du projet par numéro (la plus récente pour un numéro répété). */
  byNumber: Map<number, CurseForgeVersion>
  /** Plus haut numéro sur CurseForge (0 sans version), null tant qu'il n'est pas connu. */
  highest: number | null
}

/** Relues quand le lien ou les fichiers envoyés par l'application changent. */
export function useCurseForgeVersions(folder: string, curseforge: PackCurseForge | null): CurseForgeVersions {
  const [state, setState] = useState<{ versions: CurseForgeVersion[] | null; error: string | null }>({ versions: null, error: null })
  const key = curseforge ? JSON.stringify([curseforge.projectId, curseforge.files]) : ''
  useEffect(() => {
    setState({ versions: null, error: null })
    if (!key) return
    let alive = true
    void window.studio
      .curseForgeVersions(folder)
      .then((r) => alive && setState(r.ok ? { versions: r.versions, error: null } : { versions: null, error: r.error }))
    return () => {
      alive = false
    }
  }, [folder, key])
  return useMemo(() => {
    const byNumber = new Map<number, CurseForgeVersion>()
    for (const v of state.versions ?? []) if (v.number !== null && !byNumber.has(v.number)) byNumber.set(v.number, v)
    const highest = state.versions ? Math.max(0, ...byNumber.keys()) : null
    return { ...state, byNumber, highest }
  }, [state])
}

const STATUS_TONES = {
  live: 'bg-curseforge/15 text-curseforge ring-curseforge/30',
  review: 'bg-sky-400/15 text-sky-300 ring-sky-400/30',
  refused: 'bg-red-500/15 text-red-300 ring-red-400/30',
  neutral: 'bg-white/[0.04] text-ink-300 ring-white/10'
}

/** Pastille d'une version sur CurseForge, d'après son FileStatus. */
function statusPill(status: number): { tone: keyof typeof STATUS_TONES; label: string } {
  if (status === 4 || status === 10) return { tone: 'live', label: 'Sur CurseForge' }
  if (status === 0) return { tone: 'refused', label: 'Introuvable sur CurseForge' }
  if (status === 7) return { tone: 'refused', label: 'Supprimée' }
  if ([2, 5, 6, 15].includes(status)) return { tone: 'refused', label: 'Refusée par CurseForge' }
  if (status === 8) return { tone: 'neutral', label: 'Archivée' }
  if (status === 12) return { tone: 'neutral', label: 'Obsolète' }
  return { tone: 'review', label: 'En modération' }
}

function CurseForgeStatePill({ state }: { state: CurseForgeVersion }) {
  const { tone, label } = statusPill(state.status)
  return (
    <span
      title={`CurseForge : ${state.label}${state.displayName ? ` (${state.displayName})` : ''}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${STATUS_TONES[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

/** Sur la ligne d'une version : l'état sur CurseForge de la version de même numéro, ou le bouton pour l'y publier. */
export function CurseForgeVersionStatus({ pack, version, curseforge }: { pack: PackView; version: VersionView; curseforge: CurseForgeVersions }) {
  const openDialog = useStudio((s) => s.openDialog)
  if (!pack.curseforge) return null
  const state = curseforge.byNumber.get(version.number)
  if (state) return <CurseForgeStatePill state={state} />
  if (curseforge.highest === null) {
    return pack.curseforge.files[String(version.number)] && !curseforge.error ? <span className="text-xs text-ink-500">CurseForge…</span> : null
  }
  // Seule la dernière version se publie, et seulement au-delà de la plus haute du projet : une version plus ancienne
  // passerait après des versions déjà sur CurseForge.
  if (version.error || !version.analysis || version.number !== pack.versions[0]?.number || version.number <= curseforge.highest) return null
  return (
    <Button size="sm" variant="ghost" icon={Upload} className="text-curseforge" onClick={() => openDialog({ kind: 'curseforge-publish', folder: pack.folder, version: version.number })}>
      Publier sur CurseForge
    </Button>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** Sur la carte : où le modpack est publié, et les versions de son projet CurseForge. */
export function CurseForgeLine({ pack, curseforge }: { pack: PackView; curseforge: CurseForgeVersions }) {
  const openDialog = useStudio((s) => s.openDialog)
  const count = curseforge.versions?.length ?? 0
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-300">
      <span className="size-1.5 shrink-0 rounded-full bg-curseforge" />
      {pack.curseforge ? (
        <>
          <span>
            Publié sur{' '}
            <button type="button" className="font-semibold text-curseforge hover:underline" onClick={() => pack.curseforge?.url && openLink(pack.curseforge.url)}>
              CurseForge
            </button>
            {pack.github ? ' et sur GitHub' : ' seulement'}
          </span>
          {curseforge.versions ? (
            <button
              type="button"
              className="text-ink-400 hover:text-ink-100 hover:underline"
              onClick={() => openDialog({ kind: 'curseforge-versions', folder: pack.folder })}
            >
              · {count ? `${plural(count, 'version')}${curseforge.byNumber.size ? `, dernière : V${curseforge.highest}` : ''}` : 'aucune version encore'}
            </button>
          ) : curseforge.error ? (
            <span className="text-ink-500" title={curseforge.error}>
              · versions illisibles
            </span>
          ) : (
            <span className="text-ink-500">· versions…</span>
          )}
          <button type="button" className="text-xs font-semibold text-grass-300 hover:text-grass-400" onClick={() => openDialog({ kind: 'curseforge', folder: pack.folder })}>
            Réglages
          </button>
        </>
      ) : (
        <>
          <span>Publié sur GitHub.</span>
          <button type="button" className="text-xs font-semibold text-grass-300 hover:text-grass-400" onClick={() => openDialog({ kind: 'curseforge', folder: pack.folder })}>
            Publier aussi sur CurseForge
          </button>
        </>
      )}
    </p>
  )
}

const RELEASE_TYPES: Record<number, string> = { 1: 'Version stable', 2: 'Bêta', 3: 'Alpha' }

/** Toutes les versions du projet CurseForge : envoyées par l'application ou mises en ligne depuis le site. */
export function CurseForgeVersionsDialog({ folder }: { folder: string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const { versions, error } = useCurseForgeVersions(folder, pack?.curseforge ?? null)
  if (!pack) return null
  const local = new Set(pack.versions.map((v) => v.number))

  return (
    <Modal
      title="Versions sur CurseForge"
      subtitle={
        versions
          ? `${plural(versions.length, 'version')} sur le projet de « ${pack.name} », de la plus récente à la plus ancienne. Les packs serveur n’y figurent pas.`
          : `Projet de « ${pack.name} ».`
      }
      onClose={close}
      width="max-w-3xl"
      footer={
        <>
          {pack.curseforge?.url && (
            <Button variant="ghost" icon={ExternalLink} onClick={() => openLink(pack.curseforge!.url!)}>
              Ouvrir la page du projet
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="primary" onClick={close}>
            Fermer
          </Button>
        </>
      }
    >
      {error ? (
        <p className="text-sm text-red-300 select-text">{error}</p>
      ) : !versions ? (
        <p className="flex items-center gap-2 text-sm text-ink-300">
          <Spinner /> Lecture de CurseForge…
        </p>
      ) : !versions.length ? (
        <p className="text-sm text-ink-400">Aucune version sur ce projet pour l’instant.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {versions.map((v) => (
            <li key={v.fileId} className="flex items-center gap-4 py-3">
              <span className="w-14 shrink-0 font-mono text-sm font-semibold text-ink-100">{v.number === null ? '—' : `V${v.number}`}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-100 select-text" title={v.displayName}>
                  {v.displayName || `Fichier ${v.fileId}`}
                </p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {[
                    v.date && formatDate(v.date),
                    RELEASE_TYPES[v.releaseType],
                    v.gameVersions.join(', '),
                    v.sentByApp && 'envoyée par l’application',
                    v.number !== null && local.has(v.number) && `v${v.number} dans ton dossier`
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <CurseForgeStatePill state={v} />
              {v.url && <IconButton icon={ExternalLink} size={16} label="Ouvrir sur CurseForge" onClick={() => openLink(v.url!)} />}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/** Lien avec le projet CurseForge et réglages de publication. */
export function CurseForgeDialog({ folder }: { folder: string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const run = useStudio((s) => s.run)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const [ref, setRef] = useState('')
  const [overrides, setOverrides] = useState((pack?.curseforge?.overrides ?? []).join('\n'))
  const [github, setGithub] = useState(pack?.github ?? true)
  const [busy, setBusy] = useState(false)
  if (!pack) return null

  async function link() {
    setBusy(true)
    try {
      const result = await window.studio.linkCurseForge(folder, ref)
      if (!result.ok) return pushToast({ kind: 'error', title: 'Lien impossible', message: result.error })
      setOverrides(result.overrides.join('\n'))
      pushToast({
        kind: 'success',
        title: `Lié à « ${result.name} »`,
        message: result.highestVersion ? `Dernière version publiée : V${result.highestVersion}. La prochaine sera la v${Math.max(result.highestVersion, pack!.nextVersion - 1) + 1}.` : undefined
      })
      void refresh()
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    const ok = await run(
      window.studio.updatePublishTargets(folder, { overrides: overrides.split('\n').map((l) => l.trim()).filter(Boolean), github }),
      'Réglages de publication enregistrés'
    )
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal
      title="Publication sur CurseForge"
      subtitle={pack.curseforge ? `« ${pack.name} » est lié à son projet CurseForge.` : 'Lie ce modpack au projet que tu as créé sur CurseForge.'}
      onClose={close}
      closable={!busy}
      footer={
        pack.curseforge ? (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(window.studio.updatePublishTargets(folder, { unlinkCurseForge: true }), 'Lien avec CurseForge retiré').then((ok) => ok && close())}
            >
              Retirer le lien
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" onClick={close}>
              Annuler
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              Enregistrer
            </Button>
          </>
        ) : undefined
      }
    >
      {!pack.curseforge ? (
        <div className="space-y-4">
          <Field
            label="Projet CurseForge"
            hint="L’adresse de sa page (curseforge.com/minecraft/modpacks/…), ou son numéro. Pour un projet qui a déjà des versions, la numérotation continue après la plus haute, et les fichiers joints sont ceux de sa dernière version."
          >
            <TextInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder="https://www.curseforge.com/minecraft/modpacks/…" autoFocus />
          </Field>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => openLink('https://authors.curseforge.com/')}>
              Créer un projet sur CurseForge
            </Button>
            <Button variant="primary" icon={Link2} disabled={busy || !ref.trim()} onClick={() => void link()}>
              {busy ? 'Recherche…' : 'Lier'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {pack.curseforge.url && (
            <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openLink(pack.curseforge!.url!)}>
              Ouvrir la page du projet
            </Button>
          )}
          <Field
            label="Fichiers joints à l’export"
            hint="Un chemin par ligne, depuis la racine du profil (jokers * et ?) : packs de textures, réglages des shaders… comme dans la fenêtre d’export de CurseForge. Les mods n’y vont jamais : CurseForge les installe lui-même."
          >
            <TextArea rows={5} value={overrides} onChange={(e) => setOverrides(e.target.value)} className="font-mono text-[13px]" />
          </Field>
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="text-sm font-medium text-ink-100">Publier aussi sur GitHub</div>
              <div className="mt-0.5 text-xs text-ink-400">
                Désactivé : seulement sur CurseForge. Les joueurs de l’application ne voient plus ses nouvelles versions, et ses
                releases GitHub ne sont plus touchées.
              </div>
            </div>
            <Toggle label="Publier aussi sur GitHub" checked={github} onChange={setGithub} />
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Mise en ligne d'une version sur CurseForge, après confirmation. */
export function PublishCurseForgeDialog({ folder, version }: { folder: string; version: number }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const openDialog = useStudio((s) => s.openDialog)
  const [releaseType, setReleaseType] = useState<'release' | 'beta' | 'alpha'>('release')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  useEffect(() => window.studio.onCurseForgeProgress(setStep), [])
  const view = pack?.versions.find((v) => v.number === version)
  if (!pack || !view) return null

  async function publish() {
    setBusy(true)
    try {
      const result = await window.studio.publishCurseForge(folder, version, releaseType)
      if (result.ok) {
        pushToast({ kind: 'success', title: `v${version} envoyée sur CurseForge`, message: 'Elle sera visible une fois acceptée par la modération.' })
        close()
      } else pushToast({ kind: 'error', title: 'Envoi impossible', message: result.error })
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return (
    <Modal
      title={`Publier la v${version} sur CurseForge`}
      subtitle="Exportée au format de CurseForge, puis envoyée : elle passe en modération avant d’être visible. Une version envoyée ne se retire que depuis le site."
      onClose={close}
      closable={!busy}
      footer={
        <>
          {busy && (
            <span className="flex flex-1 items-center gap-2 text-sm text-ink-300">
              <Spinner /> {step ?? 'Préparation…'}
            </span>
          )}
          {!busy && <div className="flex-1" />}
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
        <p className="text-ink-300">
          Nom affiché : <span className="font-mono text-ink-100 select-text">{`${pack.name}_V${version}.zip`}</span>
        </p>
        <p className="text-ink-300">
          Fichiers joints :{' '}
          <span className="font-mono text-ink-100">{pack.curseforge?.overrides.join(', ') || 'aucun'}</span>{' '}
          <button type="button" className="font-semibold text-grass-300 hover:text-grass-400" onClick={() => openDialog({ kind: 'curseforge', folder })}>
            <SlidersHorizontal size={13} className="mr-1 inline" />
            changer
          </button>
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
              <input type="radio" name="release-type" checked={releaseType === type} onChange={() => setReleaseType(type)} className="accent-grass-400" />
              {type === 'release' ? 'Version stable' : type === 'beta' ? 'Bêta' : 'Alpha'}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}
