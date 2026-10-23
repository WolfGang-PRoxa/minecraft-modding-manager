import { useEffect, useState, type ReactNode } from 'react'
import { Check, CircleCheck, CircleMinus, CircleX, Minus, Plus, RefreshCw, TriangleAlert, Upload } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PublishProgress, PublishResult, SyncAction, SyncActionKind } from '../../../shared/studio'
import { Button } from '../components/Button'
import { formatBytes, formatSpeed } from '../lib/format'
import { Modal, ProgressBar, Spinner } from './Modal'
import { useStore } from '../store'
import { errorMessage, useStudio } from './store'

const KINDS: Record<SyncActionKind, { title: string; step: string; icon: LucideIcon; tone: string }> = {
  create: { title: 'Nouvelles versions', step: 'Nouvelle version', icon: Plus, tone: 'bg-sky-400/15 text-sky-300' },
  update: { title: 'Mises à jour', step: 'Mise à jour', icon: RefreshCw, tone: 'bg-amber-glow/15 text-amber-glow' },
  delete: { title: 'Suppressions', step: 'Suppression', icon: Minus, tone: 'bg-red-500/15 text-red-300' }
}

function WarningBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl bg-amber-glow/10 px-4 py-3 text-sm text-ink-100 ring-1 ring-inset ring-amber-glow/25">
      <TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-glow" />
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ActionRow({ action }: { action: SyncAction }) {
  const kind = KINDS[action.kind]
  return (
    <div className="flex gap-3 rounded-xl bg-tint/[0.03] px-4 py-3 ring-1 ring-inset ring-tint/[0.05]">
      <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg ${kind.tone}`}>
        <kind.icon size={14} strokeWidth={2.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink-100">{action.label}</p>
        {action.details.map((detail) => (
          <p key={detail} className="mt-0.5 text-sm text-ink-300">
            {detail}
          </p>
        ))}
        {action.warnings.map((warning) => (
          <p key={warning} className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-amber-glow/90">
            <TriangleAlert size={13} className="mt-px shrink-0" /> {warning}
          </p>
        ))}
      </div>
    </div>
  )
}

const STEP_ICONS = {
  pending: <span className="block size-2 rounded-full bg-ink-500" />,
  running: <Spinner size={16} className="text-grass-300" />,
  done: <Check size={16} strokeWidth={3} className="text-grass-400" />,
  error: <CircleX size={16} className="text-red-400" />,
  skipped: <CircleMinus size={16} className="text-ink-500" />
}

function ProgressView({ progress }: { progress: PublishProgress | null }) {
  if (!progress) {
    return (
      <div className="flex items-center gap-3 py-6 text-ink-300">
        <Spinner /> Dernière vérification de GitHub…
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {progress.steps.map((step, i) => {
        const running = step.status === 'running'
        const current = running ? progress.current : null
        return (
          <div key={step.tag} className={`rounded-xl px-4 py-3 ${running ? 'bg-tint/[0.05] ring-1 ring-inset ring-tint/[0.06]' : ''}`}>
            <div className="flex items-center gap-3">
              <span className="flex size-5 items-center justify-center">{STEP_ICONS[step.status]}</span>
              <span className={`flex-1 font-medium ${step.status === 'pending' || step.status === 'skipped' ? 'text-ink-400' : 'text-ink-100'}`}>
                {KINDS[step.kind].step} · {step.label}
              </span>
              <span className="text-xs text-ink-500">
                {i + 1}/{progress.steps.length}
              </span>
            </div>
            {current && (
              <div className="mt-3 pl-8">
                <div className="mb-1.5 flex justify-between text-xs text-ink-300 tabular-nums">
                  <span>{current.text}</span>
                  {current.total > 0 && (
                    <span>
                      {formatBytes(current.done)} / {formatBytes(current.total)} {formatSpeed(current.bytesPerSecond)}
                    </span>
                  )}
                </div>
                {current.total > 0 && <ProgressBar ratio={current.done / current.total} />}
              </div>
            )}
            {step.error && <p className="mt-2 pl-8 text-sm text-red-300 select-text">{step.error}</p>}
          </div>
        )
      })}
    </div>
  )
}

export function PublishDialog() {
  const plan = useStudio((s) => s.overview?.plan ?? null)
  const github = useStudio((s) => s.overview?.github)
  const refresh = useStudio((s) => s.refresh)
  const close = useStudio((s) => s.closeDialog)
  const [phase, setPhase] = useState<'checking' | 'plan' | 'running' | 'done'>('checking')
  const [progress, setProgress] = useState<PublishProgress | null>(null)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    // L'aperçu repart d'un état de GitHub tout frais.
    void refresh({ remote: true }).then(() => setPhase('plan'))
  }, [refresh])
  useEffect(() => window.studio.onPublishProgress(setProgress), [])

  async function start() {
    if (!plan) return
    setPhase('running')
    setProgress(null)
    let outcome: PublishResult
    try {
      outcome = await window.studio.publish(plan.fingerprint)
    } catch (err) {
      outcome = { ok: false, cancelled: false, error: errorMessage(err), done: 0 }
    }
    setResult(outcome)
    setPhase('done')
    void refresh()
    // La bibliothèque montre aussitôt ce qui vient d'être publié.
    if (outcome.done > 0) void useStore.getState().refresh(true)
  }

  if (phase === 'checking') {
    return (
      <Modal title="Publier sur GitHub" onClose={close}>
        <div className="flex items-center gap-3 py-8 text-ink-300">
          <Spinner size={20} /> Comparaison du dossier avec GitHub…
        </div>
      </Modal>
    )
  }

  if (phase === 'running' || phase === 'done') {
    const running = phase === 'running'
    return (
      <Modal
        title={running ? 'Publication en cours' : result?.ok ? 'Publication terminée' : 'Publication interrompue'}
        subtitle={running ? 'Garde le studio ouvert jusqu’à la fin.' : undefined}
        onClose={close}
        closable={!running}
        footer={
          running ? (
            <>
              <p className="flex-1 text-xs text-ink-400">Arrêter laisse GitHub dans un état cohérent : l’étape en cours est annulée proprement.</p>
              <Button
                variant="danger"
                disabled={stopping}
                onClick={() => {
                  setStopping(true)
                  void window.studio.cancelPublish()
                }}
              >
                {stopping ? 'Arrêt…' : 'Arrêter'}
              </Button>
            </>
          ) : (
            <>
              <div className="flex-1" />
              <Button variant="primary" onClick={close}>
                Fermer
              </Button>
            </>
          )
        }
      >
        {result && (
          <div
            className={`mb-5 flex items-start gap-3 rounded-2xl px-5 py-4 ring-1 ring-inset ${
              result.ok ? 'bg-grass-400/10 ring-grass-400/30' : 'bg-red-500/10 ring-red-400/25'
            }`}
          >
            {result.ok ? (
              <CircleCheck size={22} className="mt-0.5 shrink-0 text-grass-400" />
            ) : (
              <CircleX size={22} className="mt-0.5 shrink-0 text-red-400" />
            )}
            <div>
              <p className="font-semibold text-ink-100">
                {result.ok
                  ? 'GitHub correspond maintenant à ton dossier.'
                  : result.cancelled
                    ? 'Publication arrêtée.'
                    : 'La publication s’est arrêtée sur une erreur.'}
              </p>
              <p className="mt-0.5 text-sm text-ink-300 select-text">
                {result.ok
                  ? `${result.done} changement${result.done > 1 ? 's' : ''} appliqué${result.done > 1 ? 's' : ''}. Les joueurs le verront en actualisant leur application.`
                  : `${result.cancelled ? '' : `${result.error} `}Ce qui a été fait est conservé ; relance « Publier » pour terminer.`}
              </p>
            </div>
          </div>
        )}
        <ProgressView progress={progress} />
      </Modal>
    )
  }

  if (!plan) {
    return (
      <Modal title="Publier sur GitHub" onClose={close}>
        <div className="flex items-start gap-3 rounded-2xl bg-red-500/10 px-5 py-4 ring-1 ring-inset ring-red-400/25">
          <CircleX size={22} className="mt-0.5 shrink-0 text-red-400" />
          <div>
            <p className="font-semibold text-ink-100">GitHub est injoignable.</p>
            <p className="mt-0.5 text-sm text-ink-300">
              {github?.state === 'no-token'
                ? 'Aucun jeton GitHub : connecte-toi dans les paramètres.'
                : (github?.error ?? 'Réessaie dans un instant.')}
            </p>
          </div>
        </div>
      </Modal>
    )
  }

  const groups = (['create', 'update', 'delete'] as const)
    .map((kind) => ({ kind, actions: plan.actions.filter((a) => a.kind === kind) }))
    .filter((g) => g.actions.length > 0)
  const deletions = plan.actions.filter((a) => a.kind === 'delete').length

  return (
    <Modal
      title="Publier sur GitHub"
      subtitle={github ? `Dépôt ${github.repo}` : undefined}
      onClose={close}
      width="max-w-3xl"
      footer={
        plan.actions.length === 0 ? (
          <>
            <div className="flex-1" />
            <Button variant="primary" onClick={close}>
              Fermer
            </Button>
          </>
        ) : (
          <>
            <p className="flex-1 text-sm text-ink-400">
              {plan.uploadBytes > 0 ? `${formatBytes(plan.uploadBytes)} à envoyer` : 'Rien à envoyer'}
            </p>
            <Button variant="ghost" onClick={close}>
              Annuler
            </Button>
            <Button variant={deletions ? 'danger' : 'primary'} icon={Upload} onClick={() => void start()}>
              Publier {plan.actions.length} changement{plan.actions.length > 1 ? 's' : ''}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {plan.pendingZips > 0 && (
          <WarningBox>
            {plan.pendingZips} zip{plan.pendingZips > 1 ? 's ne sont' : ' n’est'} pas encore rangé
            {plan.pendingZips > 1 ? 's' : ''} : {plan.pendingZips > 1 ? 'ils seront ignorés' : 'il sera ignoré'}. Ferme cette
            fenêtre et clique sur « Ranger les zips » pour {plan.pendingZips > 1 ? 'les' : 'le'} publier.
          </WarningBox>
        )}
        {plan.warnings.length > 0 && (
          <WarningBox>
            {plan.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </WarningBox>
        )}

        {plan.actions.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-grass-400/10 px-5 py-4 ring-1 ring-inset ring-grass-400/30">
            <CircleCheck size={22} className="shrink-0 text-grass-400" />
            <p className="font-medium text-ink-100">GitHub est déjà à jour : il correspond exactement à ton dossier.</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.kind}>
              <h3 className="mb-2 text-xs font-semibold tracking-widest text-ink-400 uppercase">
                {KINDS[group.kind].title} · {group.actions.length}
              </h3>
              <div className="space-y-2">
                {group.actions.map((action) => (
                  <ActionRow key={action.tag} action={action} />
                ))}
              </div>
            </section>
          ))
        )}

        {deletions > 0 && (
          <p className="text-sm text-red-300">
            {deletions > 1
              ? `Ces ${deletions} releases seront supprimées définitivement de GitHub, avec leurs tags. Les joueurs qui les ont déjà installées les gardent.`
              : 'Cette release sera supprimée définitivement de GitHub, avec son tag. Les joueurs qui l’ont déjà installée la gardent.'}
          </p>
        )}
      </div>
    </Modal>
  )
}
