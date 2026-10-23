import { useEffect, useState } from 'react'
import { Eye, FolderPlus, ImagePlus, PackagePlus, PencilLine, Trash2 } from 'lucide-react'
import type { CurseForgeInstanceInfo, ZipProgress } from '../../../shared/studio'
import { Button } from '../components/Button'
import { Cover } from '../components/Cover'
import { Notes } from '../components/Notes'
import { formatBytes, formatLoader, formatRelative } from '../lib/format'
import { Field, Modal, ProgressBar, Spinner, TextArea, TextInput } from './Modal'
import { errorMessage, openLink, useStudio } from './store'

function usePack(folder: string) {
  return useStudio((s) => s.overview?.packs.find((p) => p.folder === folder) ?? null)
}

export function NewPackDialog() {
  const close = useStudio((s) => s.closeDialog)
  const run = useStudio((s) => s.run)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const folder = name
    .trim()
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/[. ]+$/, '')
    .replace(/\s+/g, '_')

  async function create() {
    setSaving(true)
    if (await run(window.studio.createPack(name), `Modpack « ${name.trim()} » créé`)) close()
    setSaving(false)
  }

  return (
    <Modal
      title="Nouveau modpack"
      subtitle="Crée son dossier : tu y déposeras ensuite les zips de chaque mise à jour."
      onClose={close}
      width="max-w-lg"
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button variant="primary" icon={FolderPlus} disabled={!folder || saving} onClick={() => void create()}>
            Créer
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (folder && !saving) void create()
        }}
      >
        <Field label="Nom affiché" hint={folder ? `Dossier créé : ${folder}` : 'Par exemple : Hardcore Endgame'}>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Hardcore Endgame" />
        </Field>
      </form>
    </Modal>
  )
}

export function PackInfoDialog({ folder }: { folder: string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const run = useStudio((s) => s.run)
  const [name, setName] = useState(pack?.name ?? '')
  const [description, setDescription] = useState(pack?.description ?? '')
  const [saving, setSaving] = useState(false)
  if (!pack) return null

  async function save() {
    setSaving(true)
    if (await run(window.studio.updatePackInfo(folder, { name, description }), 'Infos enregistrées')) close()
    setSaving(false)
  }

  return (
    <Modal
      title="Infos du modpack"
      subtitle="Ce que les joueurs voient dans l’application. Envoyé à GitHub à la prochaine publication."
      onClose={close}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button variant="primary" disabled={!name.trim() || saving} onClick={() => void save()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <span className="mb-2 block text-xs font-semibold tracking-widest text-ink-400 uppercase">Image de couverture</span>
          <div className="flex items-end gap-4">
            <Cover
              id={pack.id}
              name={name || pack.name}
              url={pack.coverUrl}
              className="aspect-[16/9] w-72 shrink-0 rounded-2xl ring-1 ring-tint/10"
            />
            <div className="flex flex-col gap-2">
              <Button size="sm" icon={ImagePlus} onClick={() => void run(window.studio.pickCover(folder))}>
                Choisir une image…
              </Button>
              {pack.coverUrl && (
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void run(window.studio.removeCover(folder))}>
                  Retirer
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-400">
            PNG, JPG ou WebP, idéalement au format 16:9 (1920 × 1080 par exemple). Une image d’un autre format, carrée par
            exemple, est affichée en entier, réduite pour tenir dans le cadre. Enregistrée comme cover dans le dossier.
          </p>
        </div>
        <Field label="Nom affiché">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description courte" hint="Une ou deux phrases, affichées sous le nom du modpack.">
          <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Survie difficile, donjons et technologie…" />
        </Field>
        <p className="text-xs text-ink-500">
          Identifiant : <span className="font-mono text-ink-300 select-text">{pack.id}</span> · utilisé dans les tags GitHub et pour
          reconnaître le modpack chez les joueurs, il ne change jamais.
        </p>
      </div>
    </Modal>
  )
}

export function NotesDialog({ folder, version }: { folder: string; version: number | string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const run = useStudio((s) => s.run)
  const current = typeof version === 'number' ? pack?.versions.find((v) => v.number === version) : pack?.modVersions.find((v) => v.version === version)
  const label = typeof version === 'number' ? `v${version}` : `version ${version}`
  const [notes, setNotes] = useState(current?.notes ?? '')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  if (!pack) return null

  async function save() {
    setSaving(true)
    if (await run(window.studio.setNotes(folder, version, notes), 'Notes enregistrées')) close()
    setSaving(false)
  }

  return (
    <Modal
      title={`Notes de la ${label}`}
      subtitle={`${pack.name} · affichées aux joueurs dans « Nouveautés ». Envoyées à la prochaine publication.`}
      onClose={close}
      width="max-w-3xl"
      footer={
        <>
          <p className="flex-1 text-xs text-ink-400">Markdown : ## Titre, - liste, **gras**, [lien](https://…)</p>
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="mb-3 inline-flex rounded-xl bg-ink-950/60 p-1 ring-1 ring-inset ring-tint/[0.06]">
        {[
          { value: false, label: 'Écrire', icon: PencilLine },
          { value: true, label: 'Aperçu', icon: Eye }
        ].map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setPreview(tab.value)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              preview === tab.value ? 'bg-tint/10 text-ink-100' : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            <tab.icon size={15} /> {tab.label}
          </button>
        ))}
      </div>
      {preview ? (
        <div className="min-h-72 rounded-xl bg-ink-950/40 px-5 py-4 ring-1 ring-inset ring-tint/[0.06]">
          <Notes markdown={notes} openLink={openLink} />
        </div>
      ) : (
        <TextArea
          autoFocus
          rows={14}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={'## Nouveautés\n\n- Ajout de …\n- Correction de …'}
          className="font-mono text-[13px]"
        />
      )}
    </Modal>
  )
}

function InstanceRow({
  instance,
  selected,
  onSelect
}: {
  instance: CurseForgeInstanceInfo
  selected: boolean
  onSelect: () => void
}) {
  const meta = [
    instance.minecraftVersion && `Minecraft ${instance.minecraftVersion}`,
    formatLoader(instance.modLoader),
    instance.modCount !== null && `${instance.modCount} mod${instance.modCount > 1 ? 's' : ''}`,
    instance.lastPlayed && `joué ${formatRelative(instance.lastPlayed)}`
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
        selected ? 'bg-grass-400/10 ring-1 ring-inset ring-grass-400/40' : 'hover:bg-tint/[0.05]'
      }`}
    >
      <span
        className={`flex size-4 shrink-0 items-center justify-center rounded-full ring-2 ${selected ? 'ring-grass-400' : 'ring-ink-500'}`}
      >
        {selected && <span className="size-2 rounded-full bg-grass-400" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink-100">{instance.name}</span>
        <span className="block truncate text-xs text-ink-400">{meta}</span>
      </span>
    </button>
  )
}

export function ImportDialog({ folder, profilePath }: { folder: string; profilePath?: string }) {
  const pack = usePack(folder)
  const close = useStudio((s) => s.closeDialog)
  const openDialog = useStudio((s) => s.openDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const [data, setData] = useState<{ dir: string; instances: CurseForgeInstanceInfo[] } | null>(null)
  const [selected, setSelected] = useState<string | null>(profilePath ?? null)
  const [includeSaves, setIncludeSaves] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ZipProgress | null>(null)

  useEffect(() => {
    window.studio
      .listInstances()
      .then(setData)
      .catch((err: unknown) => pushToast({ kind: 'error', title: 'Instances introuvables', message: errorMessage(err) }))
  }, [pushToast])
  useEffect(() => window.studio.onZipProgress(setProgress), [])
  if (!pack) return null

  async function start() {
    if (!selected) return
    setRunning(true)
    setProgress(null)
    try {
      const result = await window.studio.zipInstance(folder, selected, includeSaves)
      if (result.ok) {
        pushToast({ kind: 'success', title: `${result.fileName} créé`, message: 'Ajoute ses notes de version, puis publie.' })
        close()
      } else {
        pushToast({ kind: 'error', title: 'Zip non créé', message: result.error })
      }
    } catch (err) {
      pushToast({ kind: 'error', title: 'Zip non créé', message: errorMessage(err) })
    } finally {
      setRunning(false)
      void refresh()
    }
  }

  return (
    <Modal
      title={`Créer la v${pack.nextVersion} depuis CurseForge`}
      subtitle={`Zippe une instance directement dans le dossier de ${pack.name}, sans tes mondes, logs ni captures.`}
      onClose={close}
      closable={!running}
      footer={
        running ? (
          <>
            <div className="flex-1">
              <div className="mb-1.5 flex justify-between text-xs text-ink-300 tabular-nums">
                <span>Compression…</span>
                {progress && progress.total > 0 && (
                  <span>
                    {formatBytes(progress.done)} / {formatBytes(progress.total)}
                  </span>
                )}
              </div>
              <ProgressBar ratio={progress && progress.total ? progress.done / progress.total : 0} />
            </div>
            <Button variant="ghost" onClick={() => void window.studio.cancelZip()}>
              Annuler
            </Button>
          </>
        ) : (
          <>
            <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-sm text-ink-200">
              <input
                type="checkbox"
                checked={includeSaves}
                onChange={(e) => setIncludeSaves(e.target.checked)}
                className="size-4 accent-grass-400"
              />
              Inclure les mondes (saves)
            </label>
            <Button variant="ghost" onClick={close}>
              Annuler
            </Button>
            <Button variant="primary" icon={PackagePlus} disabled={!selected} onClick={() => void start()}>
              Créer {pack.folder}-v{pack.nextVersion}.zip
            </Button>
          </>
        )
      }
    >
      {!data ? (
        <div className="flex items-center gap-3 py-6 text-ink-300">
          <Spinner /> Recherche des instances CurseForge…
        </div>
      ) : data.instances.length === 0 ? (
        <p className="py-4 text-sm text-ink-300">
          Aucune instance trouvée dans <span className="font-mono text-ink-200 select-text">{data.dir}</span>.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-ink-400">
            Instances de <span className="font-mono select-text">{data.dir}</span>
          </p>
          <div className={`space-y-1 ${running ? 'pointer-events-none opacity-60' : ''}`}>
            {data.instances.map((instance) => (
              <InstanceRow
                key={instance.path}
                instance={instance}
                selected={selected === instance.path}
                onSelect={() => setSelected(instance.path)}
              />
            ))}
          </div>
        </>
      )}
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-ink-400">
        {pack.settings.exclude.length > 0 ? (
          <>
            <span>Exclus aussi, d’après les réglages du modpack :</span>
            <span className="font-mono text-ink-300 select-text">{pack.settings.exclude.join(' · ')}</span>
          </>
        ) : (
          <span>Pour laisser d’autres fichiers de côté (shaders, options…), exclus-les dans les réglages du modpack.</span>
        )}
        {!running && (
          <button
            type="button"
            onClick={() => openDialog({ kind: 'pack-settings', folder, tab: 'files' })}
            className="font-semibold text-grass-300 transition hover:text-grass-400"
          >
            Réglages des versions
          </button>
        )}
      </p>
    </Modal>
  )
}

/** Crée un modpack depuis un profil CurseForge : son dossier, sa fiche, sa v1, et le lien vers le profil. */
export function FromProfileDialog({ profilePath, profileName }: { profilePath: string; profileName: string }) {
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const select = useStudio((s) => s.select)
  const [name, setName] = useState(profileName.replace(/[~]/g, '').trim())
  const [includeSaves, setIncludeSaves] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ZipProgress | null>(null)
  useEffect(() => window.studio.onZipProgress(setProgress), [])

  async function create() {
    setRunning(true)
    setProgress(null)
    try {
      const result = await window.studio.createPackFromProfile(name, profilePath, includeSaves)
      if (result.ok) {
        pushToast({ kind: 'success', title: `Modpack « ${name.trim()} » créé`, message: 'Sa v1 est prête : ajoute ses notes, puis publie.' })
        close()
        select({ kind: 'profile', path: profilePath })
      } else {
        pushToast({ kind: 'error', title: 'Modpack non créé', message: result.error })
      }
    } catch (err) {
      pushToast({ kind: 'error', title: 'Modpack non créé', message: errorMessage(err) })
    } finally {
      setRunning(false)
      void refresh()
    }
  }

  return (
    <Modal
      title="Nouveau modpack depuis CurseForge"
      subtitle={`Le profil « ${profileName} » devient la source du modpack : sa v1 est zippée tout de suite, sans tes mondes, logs ni captures.`}
      onClose={close}
      closable={!running}
      footer={
        running ? (
          <>
            <div className="flex-1">
              <div className="mb-1.5 flex justify-between text-xs text-ink-300 tabular-nums">
                <span>Compression…</span>
                {progress && progress.total > 0 && (
                  <span>
                    {formatBytes(progress.done)} / {formatBytes(progress.total)}
                  </span>
                )}
              </div>
              <ProgressBar ratio={progress && progress.total ? progress.done / progress.total : 0} />
            </div>
            <Button variant="ghost" onClick={() => void window.studio.cancelZip()}>
              Annuler
            </Button>
          </>
        ) : (
          <>
            <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-sm text-ink-200">
              <input
                type="checkbox"
                checked={includeSaves}
                onChange={(e) => setIncludeSaves(e.target.checked)}
                className="size-4 accent-grass-400"
              />
              Inclure les mondes (saves)
            </label>
            <Button variant="ghost" onClick={close}>
              Annuler
            </Button>
            <Button variant="primary" icon={FolderPlus} disabled={!name.trim()} onClick={() => void create()}>
              Créer le modpack et sa v1
            </Button>
          </>
        )
      }
    >
      <Field label="Nom du modpack" hint="Affiché aux joueurs. Son identifiant publié en est tiré et ne change plus.">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={running} />
      </Field>
    </Modal>
  )
}
