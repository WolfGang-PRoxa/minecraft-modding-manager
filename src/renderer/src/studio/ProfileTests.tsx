// Tests d'un profil (ou de sa copie d'essai) avant de garder un essai ou de publier : vérification des fichiers,
// puis démarrage d'un serveur dédié. Les derniers résultats restent affichés.
import { useEffect, useState } from 'react'
import { CircleCheck, CircleX, FileSearch, Server, Square, TriangleAlert } from 'lucide-react'
import type { ServerTestReport, StaticCheckReport } from '../../../shared/studio'
import { Button } from '../components/Button'
import { formatRelative } from '../lib/format'
import { Spinner } from './Modal'
import { useStudio } from './store'

const SEVERITY_STYLES = {
  error: 'text-red-300',
  warning: 'text-amber-glow',
  info: 'text-ink-400'
} as const

function FilesReport({ report }: { report: StaticCheckReport }) {
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

function ServerReport({ report }: { report: ServerTestReport }) {
  const ok = report.outcome === 'started'
  return (
    <div className="text-sm">
      <p className={`flex items-center gap-2 ${ok ? 'text-grass-400' : 'text-red-300'}`}>
        {ok ? <CircleCheck size={15} /> : <CircleX size={15} />}
        <span>
          {report.message} <span className="text-ink-400">({Math.round(report.durationMs / 1000)} s · {formatRelative(report.startedAt)})</span>
        </span>
      </p>
      {report.clientOnly.length > 0 && (
        <p className="mt-1 pl-6 text-xs text-ink-400">Laissés de côté (jeu seulement) : {report.clientOnly.join(', ')}</p>
      )}
      {!ok && report.logTail.length > 0 && (
        <details className="mt-2 pl-6">
          <summary className="cursor-pointer text-xs font-semibold text-ink-300">Fin du journal du serveur</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink-950/70 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-300 select-text">
            {(report.crashReport?.excerpt ?? report.logTail.slice(-40).join('\n')).trim()}
          </pre>
        </details>
      )}
    </div>
  )
}

/** Vérifier les fichiers et démarrer un serveur de test pour ce profil. */
export function ProfileTests({ profilePath, label }: { profilePath: string; label: string }) {
  const pushToast = useStudio((s) => s.pushToast)
  const [files, setFiles] = useState<StaticCheckReport | null>(null)
  const [server, setServer] = useState<ServerTestReport | null>(null)
  const [running, setRunning] = useState<'files' | 'server' | null>(null)
  const [step, setStep] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.studio.lastTests(profilePath).then((last) => {
      if (!alive) return
      setFiles(last.files)
      setServer(last.server)
    })
    return () => {
      alive = false
    }
  }, [profilePath])
  useEffect(() => window.studio.onTestProgress(setStep), [])

  async function checkFiles() {
    setRunning('files')
    try {
      const result = await window.studio.checkProfile(profilePath)
      if (result.ok) setFiles(result.report)
      else pushToast({ kind: 'error', title: 'Vérification impossible', message: result.error })
    } finally {
      setRunning(null)
    }
  }

  async function testServer() {
    setRunning('server')
    setStep(null)
    try {
      const result = await window.studio.testServer(profilePath)
      if (result.ok) setServer(result.report)
      else pushToast({ kind: 'error', title: 'Test du serveur impossible', message: result.error })
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="mt-5 rounded-2xl bg-white/[0.03] px-5 py-4 ring-1 ring-inset ring-white/[0.06]">
      <div className="flex flex-wrap items-center gap-4">
        <Server size={20} className="shrink-0 text-ink-300" />
        <div className="min-w-0 flex-1 text-sm">
          <strong className="font-semibold text-ink-100">Tests</strong>{' '}
          <span className="text-ink-300">de {label}, avant de publier : les fichiers, puis un vrai serveur Minecraft.</span>
        </div>
        <Button size="sm" icon={FileSearch} disabled={running !== null} onClick={() => void checkFiles()}>
          {running === 'files' ? 'Vérification…' : 'Vérifier les fichiers'}
        </Button>
        {running === 'server' ? (
          <Button size="sm" variant="ghost" icon={Square} onClick={() => void window.studio.cancelTest()}>
            Arrêter le test
          </Button>
        ) : (
          <Button size="sm" icon={Server} disabled={running !== null} onClick={() => void testServer()}>
            Tester sur un serveur
          </Button>
        )}
      </div>
      {running === 'server' && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-300">
          <Spinner className="text-grass-300" /> <span className="truncate">{step ?? 'Préparation…'}</span>
        </p>
      )}
      {(files || server) && (
        <div className="mt-3 space-y-3">
          {files && <FilesReport report={files} />}
          {server && <ServerReport report={server} />}
        </div>
      )}
    </div>
  )
}
