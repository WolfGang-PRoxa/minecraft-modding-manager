import { useState } from 'react'
import { CircleAlert, Trash2, TriangleAlert } from 'lucide-react'
import type { PublishResult, RemoteStatus, StudioOverview } from '../../../shared/studio'
import { Button } from '../components/Button'
import { useStore } from '../store'
import { Modal, Spinner } from './Modal'
import { errorMessage, useStudio, type DeleteTarget } from './store'

const ONLINE: RemoteStatus[] = ['published', 'update']

const plural = (n: number, singular: string, pluralForm = `${singular}s`) => (n > 1 ? pluralForm : singular)

interface Description {
  title: string
  subtitle: string
  /** Ce qui va se passer, dans l'ordre. */
  points: string[]
  warning: string | null
  confirm: string
  run(): Promise<PublishResult>
  success(done: number): { title: string; message: string }
}

/** Ce que fera la suppression, décrit à partir de l'état affiché au moment d'ouvrir la fenêtre. */
function describe(target: DeleteTarget, overview: StudioOverview): Description | null {
  if (target.type === 'releases') {
    const several = target.versions.length > 1
    return {
      title: several || target.orphan ? `Retirer « ${target.name} » de GitHub ?` : `Retirer la v${target.versions[0]} de GitHub ?`,
      subtitle: several || target.orphan ? target.versions.map((v) => `v${v}`).join(', ') : target.name,
      points: [
        `${several ? 'Les releases sont supprimées' : 'La release est supprimée'} de GitHub tout de suite, avec ${several ? 'leurs tags' : 'son tag'}, sans attendre la prochaine publication.`,
        target.orphan
          ? 'Rien ne change sur ton PC : le dossier de ce modpack n’existe déjà plus.'
          : 'Rien ne change sur ton PC : son zip n’est déjà plus dans le dossier.'
      ],
      warning: target.orphan ? `« ${target.name} » disparaîtra de l’application des joueurs.` : null,
      confirm: 'Retirer de GitHub',
      run: () => window.studio.deleteReleases(target.tags),
      success: (done) => ({
        title: several || target.orphan ? `« ${target.name} » retiré de GitHub` : `v${target.versions[0]} retirée de GitHub`,
        message: `${done} ${plural(done, 'release supprimée', 'releases supprimées')}.`
      })
    }
  }

  const pack = overview.packs.find((p) => p.folder === target.folder)
  if (!pack) return null
  const releasesLeft = pack.remoteOnly.filter((r) => !r.draft).length

  if (target.type === 'pack') {
    const mod = pack.type === 'mod'
    const versions = mod ? pack.modVersions : pack.versions
    const online = versions.filter((v) => ONLINE.includes(v.remote)).length + releasesLeft
    return {
      title: `Supprimer « ${pack.name} » ?`,
      subtitle: `${versions.length} ${plural(versions.length, 'version')} dans le dossier ${pack.folder}`,
      points: [
        online > 0
          ? mod
            ? `${online > 1 ? `Ses ${online} versions en ligne sont retirées` : 'Sa version en ligne est retirée'} de GitHub (releases et tags). Ses fichiers sur CurseForge ne sont pas touchés.`
            : `${online > 1 ? `Ses ${online} versions en ligne sont retirées` : 'Sa version en ligne est retirée'} de GitHub (releases et tags) : le modpack disparaît de l’application des joueurs. Ceux qui l’ont installé gardent leur profil CurseForge.`
          : 'Il n’a aucune version sur GitHub : seul son dossier est supprimé.',
        mod
          ? `Son dossier ${pack.folder} (jars, image, notes de version) part à la corbeille : tu peux l’y récupérer. Le dossier de son projet n’est pas touché.`
          : `Son dossier ${pack.folder} (zips, image, notes de version) part à la corbeille : tu peux l’y récupérer.`
      ],
      warning: null,
      confirm: mod ? 'Supprimer le mod' : 'Supprimer le modpack',
      run: () => window.studio.deletePack(pack.folder),
      success: (done) => ({
        title: `« ${pack.name} » supprimé`,
        message:
          done > 0
            ? `${done} ${plural(done, 'release retirée', 'releases retirées')} de GitHub, dossier mis à la corbeille.`
            : 'Dossier mis à la corbeille.'
      })
    }
  }

  if (target.type === 'mod-version') {
    const modVersion = pack.modVersions.find((v) => v.version === target.version)
    if (!modVersion) return null
    const online = ONLINE.includes(modVersion.remote)
    const files = modVersion.files.map((f) => f.fileName).join(', ')
    return {
      title: `Supprimer la version ${modVersion.version} ?`,
      subtitle: pack.name,
      points: [
        online
          ? 'Sa release est retirée de GitHub tout de suite, avec son tag.'
          : modVersion.remote === 'unknown'
            ? 'Si elle est publiée sur GitHub, sa release est retirée aussi.'
            : 'Elle n’est pas sur GitHub : seuls ses fichiers sont supprimés.',
        `${files} part à la corbeille. Le dossier lié la propose de nouveau à l’import.`,
        ...(modVersion.curseforgeFileId ? ['Son fichier sur CurseForge n’est pas touché : il ne se retire que depuis le site.'] : [])
      ],
      warning: null,
      confirm: `Supprimer la version ${modVersion.version}`,
      run: () => window.studio.deleteModVersion(pack.folder, modVersion.version),
      success: (done) => ({
        title: `Version ${modVersion.version} supprimée`,
        message: done > 0 ? 'Release retirée de GitHub, fichiers mis à la corbeille.' : 'Fichiers mis à la corbeille.'
      })
    }
  }

  const version = pack.versions.find((v) => v.number === target.version)
  if (!version) return null
  const online = ONLINE.includes(version.remote)
  // Versions de la plus récente à la plus ancienne : la première restante redevient la dernière proposée.
  const others = pack.versions.filter((v) => v !== version && ONLINE.includes(v.remote))
  let warning: string | null = null
  if (online && others.length === 0 && releasesLeft === 0) {
    warning = `« ${pack.name} » n’aura plus aucune version en ligne : il disparaîtra de l’application des joueurs.`
  } else if (online && others.length > 0 && others[0].number < version.number) {
    warning = `La v${others[0].number} redevient la dernière version proposée aux joueurs.`
  }
  return {
    title: `Supprimer la v${version.number} ?`,
    subtitle: pack.name,
    points: [
      online
        ? 'Sa release est retirée de GitHub tout de suite, avec son tag : les joueurs ne la voient plus. Ceux qui l’ont installée gardent leur profil CurseForge.'
        : version.remote === 'unknown'
          ? 'Si elle est publiée sur GitHub, sa release est retirée aussi.'
          : 'Elle n’est pas sur GitHub : seul son zip est supprimé.',
      `Le zip ${version.fileName} part à la corbeille : tu peux l’y récupérer (il serait alors republié).`,
      `Le numéro ${version.number} n’est jamais réutilisé : la prochaine version sera la v${pack.nextVersion}.`
    ],
    warning,
    confirm: `Supprimer la v${version.number}`,
    run: () => window.studio.deleteVersion(pack.folder, version.number),
    success: (done) => ({
      title: `v${version.number} supprimée`,
      message: done > 0 ? 'Release retirée de GitHub, zip mis à la corbeille.' : 'Zip mis à la corbeille.'
    })
  }
}

/** Pourquoi la suppression est impossible pour l'instant : elle se fait aussi sur GitHub. */
function blocker(overview: StudioOverview): string | null {
  const { github, settings } = overview
  if (settings.role !== 'publisher') return 'Passe en mode publieur (Paramètres → Utilisation) pour supprimer.'
  if (github.state === 'no-token') return 'Connecte ton compte GitHub dans les paramètres : la suppression se fait aussi sur GitHub.'
  if (github.state === 'error') return `GitHub est injoignable : ${github.error ?? 'vérifie ta connexion internet.'}`
  if (github.canPush === false) return `Ce compte GitHub ne peut pas modifier ${github.repo}.`
  return null
}

export function DeleteDialog({ target }: { target: DeleteTarget }) {
  const overview = useStudio((s) => s.overview)
  const checking = useStudio((s) => s.checkingGitHub)
  const close = useStudio((s) => s.closeDialog)
  const refresh = useStudio((s) => s.refresh)
  const pushToast = useStudio((s) => s.pushToast)
  // Figée à l'ouverture : la version disparaît de la vue dès que son zip part à la corbeille.
  const [description] = useState(() => (overview ? describe(target, overview) : null))
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!overview || !description) return null
  const blocked = blocker(overview)
  const waiting = checking || overview.github.state === 'unchecked'

  async function confirm() {
    setRunning(true)
    setError(null)
    let result: PublishResult
    try {
      result = await description!.run()
    } catch (err) {
      result = { ok: false, cancelled: false, error: errorMessage(err), done: 0 }
    }
    setRunning(false)
    void refresh()
    // La bibliothèque montre tout de suite que la version n'est plus en ligne.
    if (result.done > 0) void useStore.getState().refresh(true)
    if (!result.ok) {
      setError(result.error)
      return
    }
    pushToast({ kind: 'success', ...description!.success(result.done) })
    close()
  }

  return (
    <Modal
      title={description.title}
      subtitle={description.subtitle}
      onClose={close}
      width="max-w-xl"
      closable={!running}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" disabled={running} onClick={close}>
            {error ? 'Fermer' : 'Annuler'}
          </Button>
          {!error && (
            <Button
              variant="danger"
              icon={running || waiting ? undefined : Trash2}
              disabled={running || waiting || blocked !== null}
              onClick={() => void confirm()}
            >
              {(running || waiting) && <Spinner />}
              {running ? 'Suppression…' : waiting ? 'Vérification de GitHub…' : description.confirm}
            </Button>
          )}
        </>
      }
    >
      <ul className="space-y-2.5 text-sm leading-relaxed text-ink-200">
        {description.points.map((point) => (
          <li key={point} className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-400" />
            <span className="select-text">{point}</span>
          </li>
        ))}
      </ul>
      {description.warning && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-amber-glow/10 px-4 py-3 text-sm text-amber-glow ring-1 ring-inset ring-amber-glow/25">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          {description.warning}
        </p>
      )}
      {(error ?? blocked) && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-inset ring-red-400/25">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          <span className="select-text">{error ?? blocked}</span>
        </p>
      )}
    </Modal>
  )
}
