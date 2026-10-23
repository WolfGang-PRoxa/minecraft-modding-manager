import { useEffect, useState } from 'react'
import { Bug, ChevronDown, CircleCheck, ExternalLink, Lightbulb, Send } from 'lucide-react'
import { APP_REPO } from '../../../shared/config'
import { repoSlug } from '../../../shared/repo'
import { REPORT_DESCRIPTION_MAX, REPORT_TITLE_MAX, reportProblem } from '../../../shared/report'
import type { IssueReport, ReportInfo, ReportKind } from '../../../shared/types'
import { errorMessage } from '../studio/store'
import { Field, Modal, Spinner, TextArea, TextInput } from '../studio/Modal'
import { useStore } from '../store'
import { Button } from './Button'
import { Select } from './Select'
import { Avatar } from './GitHubAccount'

const KINDS: Array<{ kind: ReportKind; label: string; icon: typeof Bug; placeholder: string }> = [
  {
    kind: 'bug',
    label: 'Un problème',
    icon: Bug,
    placeholder: 'Ce que tu faisais, ce qui s’est passé, et ce que tu attendais à la place.'
  },
  {
    kind: 'suggestion',
    label: 'Une suggestion',
    icon: Lightbulb,
    placeholder: 'Ce que tu aimerais voir dans l’application, et à quoi ça te servirait.'
  }
]

type Outcome = { kind: 'created'; number: number; url: string } | { kind: 'browser' }

/** Ce qui s'affiche une fois le signalement parti. */
function Sent({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <CircleCheck size={44} className="text-grass-400" />
      {outcome.kind === 'created' ? (
        <>
          <p className="mt-4 font-display text-xl font-semibold text-ink-100">Signalement envoyé</p>
          <p className="mt-1 text-sm text-ink-300">Il porte le numéro #{outcome.number} sur GitHub. Merci !</p>
        </>
      ) : (
        <>
          <p className="mt-4 font-display text-xl font-semibold text-ink-100">Presque fini</p>
          <p className="mt-1 max-w-md text-sm text-ink-300">
            Ton navigateur s’est ouvert sur GitHub, avec le signalement déjà rempli : il reste à cliquer sur « Create ».
          </p>
        </>
      )}
      <div className="mt-6 flex gap-2">
        {outcome.kind === 'created' && (
          <Button size="sm" icon={ExternalLink} onClick={() => void window.api.openExternal(outcome.url)}>
            Voir sur GitHub
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  )
}

function ReportForm({ onClose }: { onClose: () => void }) {
  const modpacks = useStore((s) => s.catalog?.modpacks ?? null)
  const selectedId = useStore((s) => s.selectedId)
  const [info, setInfo] = useState<ReportInfo | null>(null)
  const [kind, setKind] = useState<ReportKind>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [modpackId, setModpackId] = useState<string | null>(selectedId)
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => {
    void window.api
      .getReportInfo()
      .then(setInfo)
      .catch(() => setInfo({ account: null, diagnostics: [] }))
  }, [])

  const report: IssueReport = { kind, title, description, modpackId, includeDiagnostics }
  const problem = reportProblem(report)
  const account = info?.account ?? null
  const current = KINDS.find((k) => k.kind === kind)!

  const inBrowser = async () => {
    setBusy(true)
    setError(null)
    try {
      await window.api.openReportInBrowser(report)
      setOutcome({ kind: 'browser' })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.submitReport(report)
      if (result.ok) setOutcome({ kind: 'created', number: result.number, url: result.url })
      else setError(result.error)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (outcome) {
    return (
      <Modal title="Signaler un problème" onClose={onClose} width="max-w-xl">
        <Sent outcome={outcome} onClose={onClose} />
      </Modal>
    )
  }

  return (
    <Modal
      title="Signaler un problème"
      subtitle={`Ton message devient une issue publique sur ${repoSlug(APP_REPO)} : n’y mets rien de personnel.`}
      onClose={onClose}
      closable={!busy}
      width="max-w-xl"
      footer={
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2.5 text-xs text-ink-400">
            {info === null ? (
              <Spinner size={14} />
            ) : account ? (
              <>
                <Avatar login={account.login} url={account.avatarUrl} size={24} />
                <span className="truncate">
                  Envoyé avec le compte <span className="font-semibold text-ink-200">{account.login}</span>
                </span>
              </>
            ) : (
              <span>Sans compte GitHub connecté, le signalement s’ouvre dans ton navigateur, déjà rempli.</span>
            )}
          </div>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
          {account ? (
            <Button size="sm" variant="primary" icon={busy ? undefined : Send} disabled={busy || problem !== null} onClick={() => void send()}>
              {busy ? <Spinner size={15} /> : null}
              Envoyer
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              icon={ExternalLink}
              disabled={busy || info === null || problem !== null}
              onClick={() => void inBrowser()}
            >
              Ouvrir sur GitHub
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type de signalement">
          {KINDS.map((option) => (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={kind === option.kind}
              onClick={() => setKind(option.kind)}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ring-1 ring-inset transition ${
                kind === option.kind
                  ? 'bg-grass-400/10 text-grass-300 ring-grass-400/40'
                  : 'bg-tint/[0.03] text-ink-300 ring-tint/[0.08] hover:bg-tint/[0.06]'
              }`}
            >
              <option.icon size={16} /> {option.label}
            </button>
          ))}
        </div>

        <Field label="Titre">
          <TextInput
            value={title}
            maxLength={REPORT_TITLE_MAX}
            autoFocus
            placeholder={kind === 'bug' ? 'Ex. : l’installation s’arrête à 85 %' : 'Ex. : pouvoir trier les modpacks'}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field label="Description">
          <TextArea
            value={description}
            rows={6}
            maxLength={REPORT_DESCRIPTION_MAX}
            placeholder={current.placeholder}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {modpacks && modpacks.length > 0 && (
          <Field label="Modpack concerné">
            <Select
              label="Modpack concerné"
              value={modpackId ?? ''}
              onChange={(id) => setModpackId(id || null)}
              options={[{ value: '', label: 'Aucun en particulier' }, ...modpacks.map((modpack) => ({ value: modpack.id, label: modpack.latest.name }))]}
              className="w-full"
            />
          </Field>
        )}

        <div className="rounded-xl bg-tint/[0.03] px-4 py-3 ring-1 ring-inset ring-tint/[0.06]">
          <div className="flex items-center gap-3">
            <input
              id="report-diagnostics"
              type="checkbox"
              checked={includeDiagnostics}
              onChange={(e) => setIncludeDiagnostics(e.target.checked)}
              className="size-4 accent-grass-400"
            />
            <label htmlFor="report-diagnostics" className="flex-1 text-sm text-ink-200">
              Joindre les informations techniques
            </label>
            <button
              type="button"
              onClick={() => setShowDiagnostics((shown) => !shown)}
              aria-expanded={showDiagnostics}
              className="inline-flex items-center gap-1 text-xs font-semibold text-ink-400 hover:text-ink-200"
            >
              Voir <ChevronDown size={14} className={`transition ${showDiagnostics ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {showDiagnostics && (
            <ul className="mt-3 space-y-1 border-t border-tint/[0.06] pt-3 text-xs text-ink-400 select-text">
              {(info?.diagnostics ?? []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200 ring-1 ring-inset ring-red-400/25">
            <p>{error}</p>
            {account && (
              <button
                type="button"
                disabled={busy || problem !== null}
                onClick={() => void inBrowser()}
                className="mt-2 text-sm font-semibold text-grass-300 hover:text-grass-400 disabled:opacity-50"
              >
                Ouvrir plutôt le signalement sur GitHub
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Formulaire « Signaler un problème » : remonté à chaque ouverture, pour repartir d'un formulaire vide. */
export function ReportDialog() {
  const open = useStore((s) => s.reportOpen)
  const setOpen = useStore((s) => s.setReportOpen)
  return open ? <ReportForm onClose={() => setOpen(false)} /> : null
}
