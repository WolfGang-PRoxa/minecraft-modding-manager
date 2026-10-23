// Mises à jour des mods d'un profil CurseForge, dans le détail du profil : chercher, choisir, créer la copie d'essai,
// puis garder l'essai (report dans le profil) ou l'abandonner.
import { useEffect, useState } from 'react'
import { CircleCheck, FlaskConical, PackageSearch, RotateCcw, Trash2, TriangleAlert, Undo2, Upload } from 'lucide-react'
import type { ProfileView, TrialResult, UpdateChannel, UpdatePlan } from '../../../shared/studio'
import { Button } from '../components/Button'
import { useStore } from '../store'
import { Modal, ProgressBar, Spinner } from './Modal'
import { ProfileTests } from './ProfileTests'
import { useStudio } from './store'

const KIND_LABELS = { mod: 'Mod', resourcepack: 'Pack de textures', shader: 'Shader' } as const

function TrialPanel({ profile, trialName }: { profile: ProfileView; trialName: string }) {
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const restartCurseForge = useStore((s) => s.restartCurseForge)
  const [confirm, setConfirm] = useState<'promote' | 'discard' | null>(null)
  const [busy, setBusy] = useState(false)
  const source = profile.trialOf ? null : profile.path
  const sourcePath = profile.trialOf ?? profile.path

  async function run(kind: 'promote' | 'discard') {
    setBusy(true)
    try {
      if (kind === 'promote') {
        const result = await window.studio.promoteTrial(sourcePath)
        if (result.ok) {
          pushToast({
            kind: 'success',
            title: 'Essai reporté dans ton profil',
            message: `${result.promoted.length} projet(s) mis à jour. Crée maintenant la nouvelle version du modpack.`
          })
        } else pushToast({ kind: 'error', title: 'Report impossible', message: result.error })
      } else {
        const result = await window.studio.discardTrial(sourcePath)
        if (result.ok) pushToast({ kind: 'info', title: 'Essai abandonné', message: 'Il est dans la corbeille. Ton profil n’a pas changé.' })
        else pushToast({ kind: 'error', title: 'Abandon impossible', message: result.error })
      }
    } finally {
      setBusy(false)
      setConfirm(null)
      void refresh()
    }
  }

  return (
    <div className="mt-5 rounded-2xl bg-violet-400/10 px-5 py-4 ring-1 ring-inset ring-violet-400/25">
      <div className="flex flex-wrap items-center gap-4">
        <FlaskConical size={20} className="shrink-0 text-violet-300" />
        <div className="min-w-0 flex-1 text-sm text-ink-100">
          <strong className="font-semibold">{source ? `Un essai est en cours : « ${trialName} ».` : 'Ce profil est une copie d’essai.'}</strong>{' '}
          <span className="text-ink-300">
            Relance CurseForge pour le voir, puis joue dessus pour tester les mises à jour. Garde-le s’il te convient : ses
            changements passent dans ton profil.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" icon={RotateCcw} disabled={busy} onClick={() => void restartCurseForge()}>
            Relancer CurseForge
          </Button>
          <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => setConfirm('discard')}>
            Abandonner
          </Button>
          <Button size="sm" variant="primary" icon={Upload} disabled={busy} onClick={() => setConfirm('promote')}>
            Garder l’essai
          </Button>
        </div>
      </div>
      <ProfileTests profilePath={profile.trialOf ? profile.path : (profile.trialPath ?? profile.path)} label={`l’essai « ${trialName} »`} />
      {confirm && (
        <Modal
          title={confirm === 'promote' ? 'Garder l’essai ?' : 'Abandonner l’essai ?'}
          subtitle={
            confirm === 'promote'
              ? 'Les mods, packs de textures et shaders mis à jour dans l’essai passent dans ton profil ; tes mondes, tes réglages et tes mods désactivés restent les tiens. CurseForge est fermé le temps de l’écriture, puis rouvert. Ferme Minecraft avant.'
              : 'L’essai part à la corbeille. Ton profil n’a pas changé.'
          }
          onClose={() => setConfirm(null)}
          closable={!busy}
          footer={
            <>
              <div className="flex-1" />
              <Button variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>
                Annuler
              </Button>
              <Button
                variant={confirm === 'promote' ? 'primary' : 'danger'}
                icon={confirm === 'promote' ? Upload : Trash2}
                disabled={busy}
                onClick={() => void run(confirm)}
              >
                {busy ? 'Patiente…' : confirm === 'promote' ? 'Garder l’essai' : 'Abandonner'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-300">« {trialName} »</p>
        </Modal>
      )}
    </div>
  )
}

/** Chercher les mises à jour, les choisir, créer l'essai. */
function UpdateFinder({ profile }: { profile: ProfileView }) {
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const openSettings = useStudio((s) => s.openSettings)
  const [channel, setChannel] = useState<UpdateChannel>('release')
  const [plan, setPlan] = useState<UpdatePlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [applying, setApplying] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null)
  const [result, setResult] = useState<TrialResult | null>(null)
  useEffect(() => window.studio.onUpdateProgress(setProgress), [])

  async function check(next = channel) {
    setChecking(true)
    setError(null)
    setResult(null)
    try {
      const response = await window.studio.checkUpdates(profile.path, next)
      if (response.ok) {
        setPlan(response.plan)
        setSelected(new Set(response.plan.updates.filter((u) => u.downloadable).map((u) => u.projectId)))
      } else setError(response.error)
    } finally {
      setChecking(false)
    }
  }

  async function apply() {
    setApplying(true)
    setProgress(null)
    try {
      const response = await window.studio.applyUpdates(profile.path, channel, [...selected])
      if (response.ok) {
        setResult(response.result)
        setPlan(null)
        pushToast({ kind: 'success', title: 'Essai créé', message: 'Relance CurseForge pour le voir et y jouer.' })
      } else pushToast({ kind: 'error', title: 'Essai non créé', message: response.error })
    } finally {
      setApplying(false)
      void refresh()
    }
  }

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div className="mt-5 rounded-2xl bg-tint/[0.03] px-5 py-4 ring-1 ring-inset ring-tint/[0.06]">
      <div className="flex flex-wrap items-center gap-4">
        <PackageSearch size={20} className="shrink-0 text-ink-300" />
        <div className="min-w-0 flex-1 text-sm">
          <strong className="font-semibold text-ink-100">Mises à jour des mods</strong>{' '}
          <span className="text-ink-300">
            Mods, packs de textures et shaders, pour Minecraft {profile.minecraftVersion}. Elles sont essayées sur une copie
            du profil, jamais directement.
          </span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-300">
          <input
            type="checkbox"
            className="size-3.5 accent-grass-400"
            checked={channel === 'beta'}
            disabled={checking || applying}
            onChange={(e) => {
              const next = e.target.checked ? 'beta' : 'release'
              setChannel(next)
              if (plan) void check(next)
            }}
          />
          Bêtas comprises
        </label>
        <Button size="sm" icon={PackageSearch} disabled={checking || applying} onClick={() => void check()}>
          {checking ? 'Recherche…' : plan ? 'Chercher à nouveau' : 'Chercher les mises à jour'}
        </Button>
      </div>

      {error && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-amber-glow">
          <TriangleAlert size={15} /> {error}
          {/clé de l’API/.test(error) && (
            <button type="button" className="font-semibold text-grass-300 hover:text-grass-400" onClick={openSettings}>
              Paramètres
            </button>
          )}
        </p>
      )}
      {checking && !plan && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-400">
          <Spinner /> Interrogation de CurseForge…
        </p>
      )}

      {plan && plan.updates.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-grass-400">
          <CircleCheck size={15} /> Tout est à jour ({plan.checked} projets vérifiés).
        </p>
      )}

      {plan && plan.updates.length > 0 && (
        <div className="mt-4">
          <div className="max-h-80 space-y-0.5 overflow-y-auto rounded-xl bg-ink-950/40 p-2 ring-1 ring-tint/[0.05]">
            {plan.updates.map((u) => (
              <label key={u.projectId} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm hover:bg-tint/[0.04]">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-grass-400"
                  checked={selected.has(u.projectId)}
                  disabled={applying || !u.downloadable}
                  onChange={() => toggle(u.projectId)}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink-100">{u.name}</span>
                  <span className="ml-2 text-xs text-ink-500">{KIND_LABELS[u.kind]}</span>
                  {!u.downloadable && (
                    <span className="ml-2 text-xs text-amber-glow" title="Son auteur n’autorise le téléchargement que depuis CurseForge">
                      à faire dans CurseForge
                    </span>
                  )}
                  <span className="block truncate font-mono text-[11px] text-ink-400">
                    {u.from ? `${u.from.fileName} → ${u.to.fileName}` : `ajouté : ${u.to.fileName} (demandé par ${u.requiredBy.join(', ')})`}
                    {u.to.releaseType > 1 ? (u.to.releaseType === 2 ? ' · bêta' : ' · alpha') : ''}
                  </span>
                </span>
                {u.url && (
                  <button
                    type="button"
                    className="shrink-0 text-xs font-semibold text-grass-300 hover:text-grass-400"
                    onClick={(e) => {
                      e.preventDefault()
                      void window.api.openExternal(u.url!)
                    }}
                  >
                    Page
                  </button>
                )}
              </label>
            ))}
          </div>
          {plan.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-glow">
              {plan.warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
          {plan.untracked.length > 0 && (
            <p className="mt-2 text-xs text-ink-400">Posés à la main, jamais mis à jour : {plan.untracked.join(', ')}.</p>
          )}
          <div className="mt-4 flex items-center gap-3">
            {applying ? (
              <div className="flex-1">
                <div className="mb-1.5 flex justify-between text-xs text-ink-300">
                  <span className="truncate">{progress?.name ? `Téléchargement : ${progress.name}` : 'Préparation de l’essai…'}</span>
                  {progress && <span className="tabular-nums">{progress.done} / {progress.total}</span>}
                </div>
                <ProgressBar ratio={progress && progress.total ? progress.done / progress.total : 0} />
              </div>
            ) : (
              <span className="flex-1 text-xs text-ink-400">
                {selected.size} sur {plan.updates.filter((u) => u.downloadable).length} sélectionnée(s). L’essai « {profile.name} (essai) » est créé à côté de ton profil.
              </span>
            )}
            <Button variant="primary" icon={FlaskConical} disabled={applying || selected.size === 0} onClick={() => void apply()}>
              Créer l’essai
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-grass-400">
            {result.applied.length} mise(s) à jour dans l’essai. Relance CurseForge pour le voir et y jouer.
          </p>
          {result.skipped.map((s) => (
            <p key={s.update.projectId} className="flex gap-2 text-xs text-amber-glow">
              <Undo2 size={13} className="mt-0.5 shrink-0" /> {s.update.name} : {s.reason}. Fais-la dans CurseForge.
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** La partie « mises à jour » du détail d'un profil : l'essai en cours, sinon la recherche. */
export function ProfileUpdates({ profile }: { profile: ProfileView }) {
  const library = useStudio((s) => s.library)
  if (profile.installedPack || profile.curseforgeProjectId) return null
  const trialPath = profile.trialOf ? profile.path : profile.trialPath
  if (trialPath) {
    const trial = library?.folders.flatMap((f) => f.profiles).find((p) => p.path === trialPath)
    return <TrialPanel profile={profile} trialName={trial?.name ?? `${profile.name} (essai)`} />
  }
  return (
    <>
      <UpdateFinder profile={profile} />
      <ProfileTests profilePath={profile.path} label="ce profil" />
    </>
  )
}
