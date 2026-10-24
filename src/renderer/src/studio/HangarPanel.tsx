// Publication d'un plugin sur Hangar (hangar.papermc.io) depuis sa carte : lien avec le projet, versions, mise en ligne.
import { useEffect, useState } from 'react'
import { ExternalLink, Link2, Upload } from 'lucide-react'
import type { ContentVersionView, HangarVersionView, PackHangar, PackView } from '../../../shared/studio'
import { Button } from '../components/Button'
import { Field, Modal, Spinner, TextInput } from './Modal'
import { Pill } from './PackCard'
import { openLink, useStudio } from './store'

export interface HangarVersions {
  versions: HangarVersionView[] | null
  error: string | null
}

export function useHangarVersions(folder: string, hangar: PackHangar | null): HangarVersions {
  const [state, setState] = useState<HangarVersions>({ versions: null, error: null })
  const key = hangar ? JSON.stringify([hangar.slug, hangar.versions]) : ''
  useEffect(() => {
    setState({ versions: null, error: null })
    if (!key) return
    let alive = true
    void window.studio.hangarVersions(folder).then((r) => alive && setState(r.ok ? { versions: r.versions, error: null } : { versions: null, error: r.error }))
    return () => {
      alive = false
    }
  }, [folder, key])
  return state
}

const LIVE = 'bg-sky-400/15 text-sky-300 ring-sky-400/30'

/** État sur Hangar d'une version, ou bouton pour l'y mettre en ligne (la plus récente seulement). */
export function HangarVersionStatus({ pack, version, latest, hangar }: { pack: PackView; version: ContentVersionView; latest: boolean; hangar: HangarVersions }) {
  const openDialog = useStudio((s) => s.openDialog)
  if (!pack.hangar) return null
  const found = hangar.versions?.find((v) => v.version === version.version)
  if (found) return <Pill className={LIVE} title={`Hangar : canal ${found.channel}`}>Publiée sur Hangar</Pill>
  if (!hangar.versions) return pack.hangar.versions.includes(version.version) ? <span className="text-xs text-ink-500">Hangar…</span> : null
  if (!latest || pack.errors.length) return null
  return (
    <Button size="sm" variant="ghost" icon={Upload} className="text-sky-300" onClick={() => openDialog({ kind: 'hangar-publish', folder: pack.folder, version: version.version })}>
      Publier sur Hangar
    </Button>
  )
}

/** Sur la carte du plugin : son projet Hangar, ou de quoi l'y lier. */
export function HangarLine({ pack, hangar }: { pack: PackView; hangar: HangarVersions }) {
  const openDialog = useStudio((s) => s.openDialog)
  const count = hangar.versions?.length ?? 0
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-300">
      <span className="size-1.5 shrink-0 rounded-full bg-sky-400" />
      {pack.hangar ? (
        <>
          <span>
            Sur{' '}
            <button type="button" className="font-semibold text-sky-300 hover:underline" onClick={() => openLink(pack.hangar!.url)}>
              Hangar
            </button>
          </span>
          {hangar.versions ? (
            <span className="text-ink-400">· {count ? `${count} version${count > 1 ? 's' : ''}` : 'aucune version encore'}</span>
          ) : hangar.error ? (
            <span className="text-ink-500" title={hangar.error}>
              · versions illisibles
            </span>
          ) : (
            <span className="text-ink-500">· versions…</span>
          )}
          <button type="button" className="text-xs font-semibold text-grass-300 hover:text-grass-400" onClick={() => openDialog({ kind: 'hangar', folder: pack.folder })}>
            Réglages
          </button>
        </>
      ) : (
        <button type="button" className="text-xs font-semibold text-grass-300 hover:text-grass-400" onClick={() => openDialog({ kind: 'hangar', folder: pack.folder })}>
          Publier aussi sur Hangar
        </button>
      )}
    </p>
  )
}

function usePack(folder: string) {
  return useStudio((s) => s.overview?.packs.find((p) => p.folder === folder) ?? null)
}

/** Lien avec le projet Hangar du plugin. */
export function HangarDialog({ folder }: { folder: string }) {
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
      const result = await window.studio.linkHangar(folder, ref)
      if (!result.ok) return pushToast({ kind: 'error', title: 'Lien impossible', message: result.error })
      pushToast({ kind: 'success', title: `Lié au projet Hangar « ${result.slug} »` })
      close()
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return (
    <Modal
      title="Publication sur Hangar"
      subtitle={pack.hangar ? `« ${pack.name} » est lié à son projet Hangar.` : 'Lie ce plugin au projet que tu as créé sur Hangar (hangar.papermc.io).'}
      onClose={close}
      closable={!busy}
      footer={
        pack.hangar ? (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void run(window.studio.updatePublishTargets(folder, { unlinkHangar: true }), 'Lien avec Hangar retiré').then((ok) => ok && close())}
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
      {pack.hangar ? (
        <div className="space-y-3 text-sm text-ink-300">
          <p>
            Projet <span className="font-mono text-ink-100 select-text">{pack.hangar.owner}/{pack.hangar.slug}</span>. Ses versions sont reconnues à leur nom,
            qui est la version du plugin.
          </p>
          <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openLink(pack.hangar!.url)}>
            Ouvrir la page du projet
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Projet Hangar" hint="L’adresse de sa page (hangar.papermc.io/<auteur>/<projet>) ou son nom. Le projet se crée une fois sur le site.">
            <TextInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder="https://hangar.papermc.io/…" autoFocus />
          </Field>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => openLink('https://hangar.papermc.io/new')}>
              Créer un projet sur Hangar
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

/** Mise en ligne d'une version du plugin sur Hangar, après confirmation. */
export function PublishHangarDialog({ folder, version }: { folder: string; version: string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const [releaseType, setReleaseType] = useState<'release' | 'beta'>('release')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  useEffect(() => window.studio.onCurseForgeProgress(setStep), [])
  const view = pack?.contentVersions.find((v) => v.version === version)
  if (!pack || !view) return null
  const minecraft = [...new Set(view.files.flatMap((f) => f.minecraftVersions))]

  async function publish() {
    setBusy(true)
    try {
      const result = await window.studio.publishHangar(folder, version, releaseType)
      if (!result.ok) return pushToast({ kind: 'error', title: 'Envoi impossible', message: result.error })
      pushToast({ kind: 'success', title: `Version ${version} publiée sur Hangar` })
      close()
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return (
    <Modal
      title={`Publier la version ${version} sur Hangar`}
      subtitle="Le jar est envoyé sur le projet du plugin, pour Paper. Une version envoyée se retire depuis le site."
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
            Publier sur Hangar
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink-300">
          Fichier : <span className="font-mono text-ink-100">{view.files.map((f) => f.fileName).join(', ')}</span>
        </p>
        <p className="text-ink-300">
          Paper, Minecraft <span className="text-ink-100">{minecraft.join(', ') || '— à préciser'}</span>
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
          <span className="text-xs font-semibold tracking-widest text-ink-400 uppercase">Canal</span>
          {(['release', 'beta'] as const).map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-1.5 text-ink-200">
              <input type="radio" name="hangar-channel" checked={releaseType === type} onChange={() => setReleaseType(type)} />
              {type === 'release' ? 'Release' : 'Snapshot'}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}
