// Tests d'un profil (ou de sa copie d'essai) avant de garder un essai ou de publier : vérification des fichiers,
// démarrage d'un serveur dédié, puis partie avec de vrais joueurs. Les derniers résultats restent affichés.
import { useEffect, useState } from 'react'
import { CircleCheck, CircleX, FileSearch, ListChecks, Server, Square, TriangleAlert, Users } from 'lucide-react'
import type { LogIssue, PlayerTestReport, ProfileTestReports, ServerTestReport, StaticCheckReport, VersionTests } from '../../../shared/studio'
import { Button } from '../components/Button'
import { Select } from '../components/Select'
import { formatRelative } from '../lib/format'
import { Spinner } from './Modal'
import { useStudio } from './store'

const SEVERITY_STYLES = {
  error: 'text-red-300',
  warning: 'text-amber-glow',
  info: 'text-ink-400'
} as const

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`

const TEST_PILLS = {
  passed: { label: 'Testée', className: 'bg-grass-400/15 text-grass-300 ring-grass-400/30' },
  partial: { label: 'Testée en partie', className: 'bg-sky-400/15 text-sky-300 ring-sky-400/30' },
  failed: { label: 'Tests en échec', className: 'bg-red-500/15 text-red-300 ring-red-400/30' },
  never: { label: 'Pas testée', className: 'bg-tint/[0.04] text-ink-400 ring-tint/10' }
}

/** Bilan des derniers tests faits sur les mods d'une version ; `showUntested` : « Pas testée » plutôt que rien. */
export function TestsPill({ tests, showUntested = false }: { tests: VersionTests | null; showUntested?: boolean }) {
  if (!tests && !showUntested) return null
  const pill = TEST_PILLS[tests?.state ?? 'never']
  return (
    <span
      title={tests ? `${tests.summary} (${formatRelative(tests.at)})` : 'Aucun test sur ces mods : « Tout tester », dans le détail de son profil.'}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${pill.className}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {pill.label}
    </span>
  )
}

export function FilesReport({ report }: { report: StaticCheckReport }) {
  const problems = report.findings.filter((f) => f.severity !== 'info')
  return (
    <div className="text-sm">
      <p className={`flex items-center gap-2 ${problems.some((f) => f.severity === 'error') ? 'text-red-300' : problems.length ? 'text-amber-glow' : 'text-grass-400'}`}>
        {problems.length ? <TriangleAlert size={15} /> : <CircleCheck size={15} />}
        {problems.length ? `${problems.length} point(s) à regarder` : 'Fichiers en ordre'} · {report.jars} mods ·{' '}
        <span className="text-ink-400">{formatRelative(report.checkedAt)}</span>
      </p>
      {report.findings.map((f) => (
        <div key={f.message} className="mt-1.5 pl-6">
          <p className={SEVERITY_STYLES[f.severity]}>{f.message}</p>
          <p className="font-mono text-[11px] break-all text-ink-500 select-text">{f.files.join(', ')}</p>
        </div>
      ))}
    </div>
  )
}

/** Erreurs d'un journal, repliées : beaucoup sont sans gravité, elles servent surtout à comparer deux tests. */
function Issues({ title, issues }: { title: string; issues: LogIssue[] | undefined }) {
  if (!issues?.length) return null
  const errors = issues.filter((i) => i.level === 'error')
  return (
    <details className="mt-1.5 pl-6">
      <summary className="cursor-pointer text-xs text-ink-400">
        {title} : {errors.length} erreur(s), {issues.length - errors.length} avertissement(s) — souvent sans gravité ; les mises à jour
        automatiques ne relèvent que les nouvelles
      </summary>
      <ul className="mt-1.5 max-h-56 space-y-1 overflow-auto rounded-lg bg-ink-950/70 p-3 font-mono text-[11px] text-ink-300 select-text">
        {issues.map((i) => (
          <li key={i.key} className={i.level === 'error' ? 'text-red-300/90' : 'text-amber-glow/80'}>
            {i.source && <span className="text-ink-500">[{i.source}] </span>}
            {i.message}
            {i.count > 1 && <span className="text-ink-500"> ×{i.count}</span>}
            {i.detail && <span className="block pl-4 text-ink-400">{i.detail}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}

function Log({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null
  return (
    <details className="mt-2 pl-6">
      <summary className="cursor-pointer text-xs font-semibold text-ink-300">{title}</summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink-950/70 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-300 select-text">
        {lines.join('\n').trim()}
      </pre>
    </details>
  )
}

export function ServerReport({ report }: { report: ServerTestReport }) {
  const ok = report.outcome === 'started'
  return (
    <div className="text-sm">
      <p className={`flex items-center gap-2 ${ok ? 'text-grass-400' : 'text-red-300'}`}>
        {ok ? <CircleCheck size={15} /> : <CircleX size={15} />}
        <span>
          {report.message} <span className="text-ink-400">({seconds(report.durationMs)} · {formatRelative(report.startedAt)})</span>
        </span>
      </p>
      {report.clientOnly.length > 0 && (
        <p className="mt-1 pl-6 text-xs text-ink-400">Laissés de côté (jeu seulement) : {report.clientOnly.join(', ')}</p>
      )}
      <Issues title="Journal du serveur" issues={report.logIssues} />
      {!ok && <Log title="Fin du journal du serveur" lines={report.crashReport?.excerpt.split('\n') ?? report.logTail.slice(-40)} />}
    </div>
  )
}

export function PlayersReport({ report }: { report: PlayerTestReport }) {
  const tone = report.outcome === 'passed' ? 'text-grass-400' : report.outcome === 'unavailable' ? 'text-amber-glow' : 'text-red-300'
  return (
    <div className="text-sm">
      <p className={`flex items-center gap-2 ${tone}`}>
        {report.outcome === 'passed' ? <CircleCheck size={15} /> : report.outcome === 'unavailable' ? <TriangleAlert size={15} /> : <CircleX size={15} />}
        <span>
          {report.message} <span className="text-ink-400">({seconds(report.durationMs)} · {formatRelative(report.startedAt)})</span>
        </span>
      </p>
      {report.players.map((p) => (
        <div key={p.name} className="mt-1 pl-6 text-xs">
          <p className={p.outcome === 'played' ? 'text-ink-300' : 'text-red-300'}>
            {p.outcome === 'played' ? '✔' : '✖'} {p.name} : {p.message}
          </p>
          {p.outcome !== 'played' && <Log title={`Fin du journal de ${p.name}`} lines={p.crashReport?.excerpt.split('\n') ?? p.logTail.slice(-40)} />}
        </div>
      ))}
      <Issues title="Journal du jeu" issues={report.clientIssues} />
    </div>
  )
}

type Running = 'all' | 'files' | 'server' | 'players' | null

/** Vérifier les fichiers, démarrer un serveur de test, puis y faire jouer de vrais clients, pour ce profil. */
export function ProfileTests({ profilePath, label }: { profilePath: string; label: string }) {
  const pushToast = useStudio((s) => s.pushToast)
  const [reports, setReports] = useState<ProfileTestReports>({ files: null, server: null, players: null })
  const [running, setRunning] = useState<Running>(null)
  const [step, setStep] = useState<string | null>(null)
  const [players, setPlayers] = useState(2)

  useEffect(() => {
    let alive = true
    void window.studio.lastTests(profilePath).then((last) => alive && setReports(last))
    return () => {
      alive = false
    }
  }, [profilePath])
  useEffect(() => window.studio.onTestProgress(setStep), [])

  async function run(kind: Exclude<Running, null>) {
    setRunning(kind)
    setStep(null)
    try {
      if (kind === 'files') {
        const result = await window.studio.checkProfile(profilePath)
        if (result.ok) setReports((r) => ({ ...r, files: result.report }))
        else pushToast({ kind: 'error', title: 'Vérification impossible', message: result.error })
      } else if (kind === 'server') {
        const result = await window.studio.testServer(profilePath)
        if (result.ok) setReports((r) => ({ ...r, server: result.report }))
        else pushToast({ kind: 'error', title: 'Test du serveur impossible', message: result.error })
      } else if (kind === 'players') {
        const result = await window.studio.testPlayers(profilePath, players)
        if (result.ok) setReports((r) => ({ ...r, players: result.report, server: result.report.server ?? r.server }))
        else pushToast({ kind: 'error', title: 'Test avec des joueurs impossible', message: result.error })
      } else {
        const result = await window.studio.testAll(profilePath, players)
        if (result.ok) setReports((r) => ({ files: result.reports.files, players: result.reports.players, server: result.reports.server ?? r.server }))
        else pushToast({ kind: 'error', title: 'Tests impossibles', message: result.error })
      }
    } finally {
      setRunning(null)
    }
  }

  const long = running !== null && running !== 'files'
  // Le test du serveur compris dans la partie de test n'est pas affiché deux fois.
  const server = reports.server?.startedAt !== reports.players?.server?.startedAt ? reports.server : null

  return (
    <div className="mt-5 rounded-2xl bg-tint/[0.03] px-5 py-4 ring-1 ring-inset ring-tint/[0.06]">
      <div className="flex flex-wrap items-center gap-4">
        <ListChecks size={20} className="shrink-0 text-ink-300" />
        <div className="min-w-0 flex-1 text-sm">
          <strong className="font-semibold text-ink-100">Tests</strong>{' '}
          <span className="text-ink-300">
            de {label}, avant de publier : les fichiers, un vrai serveur Minecraft, puis de vrais joueurs qui le rejoignent.
          </span>
        </div>
        {long ? (
          <Button size="sm" variant="ghost" icon={Square} onClick={() => void window.studio.cancelTest()}>
            Arrêter le test
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon={ListChecks} disabled={running !== null} onClick={() => void run('all')}>
            Tout tester
          </Button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-9">
        <Button size="sm" variant="ghost" icon={FileSearch} disabled={running !== null} onClick={() => void run('files')}>
          {running === 'files' ? 'Vérification…' : 'Fichiers'}
        </Button>
        <Button size="sm" variant="ghost" icon={Server} disabled={running !== null} onClick={() => void run('server')}>
          Serveur seul
        </Button>
        <Button size="sm" variant="ghost" icon={Users} disabled={running !== null} onClick={() => void run('players')}>
          Partie avec des joueurs
        </Button>
        <span className="flex items-center gap-2 text-xs text-ink-400">
          Joueurs
          <Select
            label="Nombre de joueurs"
            value={players}
            disabled={running !== null}
            onChange={setPlayers}
            options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
            size="xs"
            className="w-14"
          />
        </span>
      </div>
      {long && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-300">
          <Spinner className="text-grass-300" /> <span className="truncate">{step ?? 'Préparation…'}</span>
        </p>
      )}
      {(running === 'players' || running === 'all') && (
        <p className="mt-1 pl-6 text-xs text-ink-400">
          Les fenêtres du jeu s’ouvrent derrière les tiennes pendant le test : ce sont les joueurs (hors ligne, sans compte).
        </p>
      )}
      {(reports.files || server || reports.players) && (
        <div className="mt-3 space-y-3">
          {reports.files && <FilesReport report={reports.files} />}
          {server && <ServerReport report={server} />}
          {reports.players?.server && <ServerReport report={reports.players.server} />}
          {reports.players && <PlayersReport report={reports.players} />}
        </div>
      )}
    </div>
  )
}
