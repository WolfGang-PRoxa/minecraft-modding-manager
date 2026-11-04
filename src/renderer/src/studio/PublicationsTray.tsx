import { CloudUpload } from 'lucide-react'
import { formatBytes } from '../lib/format'
import { ProgressBar, Spinner } from './Modal'
import { KINDS } from './PublishDialog'
import { stopGitHubPublication, TARGET_NAMES, usePublications, type Publication } from './publications'

/** Où en est une publication sur GitHub : l'étape en cours et l'envoi de son fichier. */
function githubStep(publication: Publication): { text: string; bytes: string | null; ratio: number | null } {
  const progress = publication.progress
  if (!progress) return { text: 'Dernière vérification de GitHub…', bytes: null, ratio: null }
  const index = progress.steps.findIndex((step) => step.status === 'running')
  if (index < 0) return { text: 'Fin de la publication…', bytes: null, ratio: null }
  const step = progress.steps[index]
  const current = progress.current
  const text = `${KINDS[step.kind].step} · ${step.label} (${index + 1}/${progress.steps.length})`
  if (!current || current.total <= 0) return { text, bytes: null, ratio: null }
  return { text, bytes: `${formatBytes(current.done)} / ${formatBytes(current.total)}`, ratio: current.done / current.total }
}

function PublicationCard({ publication }: { publication: Publication }) {
  const follow = usePublications((s) => s.follow)
  const github = publication.target === 'github'
  const { text, bytes, ratio } = github ? githubStep(publication) : { text: publication.step ?? 'Préparation…', bytes: null, ratio: null }

  return (
    <div role="status" className="animate-rise pointer-events-auto rounded-2xl bg-ink-800/95 p-4 shadow-2xl ring-1 ring-sky-300/20 backdrop-blur-xl">
      <div className="flex gap-3">
        <CloudUpload size={22} className="mt-0.5 shrink-0 text-sky-300" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-100">
            {github ? 'Publication' : 'Envoi'} sur {TARGET_NAMES[publication.target]}
            <span className="font-normal text-ink-300"> · {publication.subject}</span>
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-300">
            <Spinner size={14} className="shrink-0 text-grass-300" />
            <span className="min-w-0 truncate tabular-nums">{publication.stopping ? 'Arrêt…' : text}</span>
          </p>
          {ratio !== null && (
            <div className="mt-2">
              {bytes && <p className="mb-1 text-right text-xs text-ink-400 tabular-nums">{bytes}</p>}
              <ProgressBar ratio={ratio} />
            </div>
          )}
          {github && (
            <div className="mt-2 flex gap-4 text-sm font-semibold">
              <button type="button" onClick={() => follow(true)} className="text-grass-300 hover:text-grass-400">
                Détails
              </button>
              <button
                type="button"
                disabled={publication.stopping}
                onClick={stopGitHubPublication}
                className="text-red-300 hover:text-red-400 disabled:opacity-45"
              >
                Arrêter
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Publications en cours, au-dessus des notifications : elles continuent pendant que le publieur fait autre chose. */
export function PublicationsTray() {
  const running = usePublications((s) => s.running)
  // La fenêtre de suivi montre déjà la publication sur GitHub.
  const following = usePublications((s) => s.following)
  return running.filter((p) => !(following && p.target === 'github')).map((publication) => <PublicationCard key={publication.id} publication={publication} />)
}

/** Pied d'une fenêtre de publication : prévient qu'un autre envoi est en cours (le moteur en fait un à la fois). */
export function PublicationBusyNote({ busy }: { busy: Publication | null }) {
  if (!busy) return <div className="flex-1" />
  return (
    <p className="flex-1 text-sm text-amber-glow">
      Un envoi sur {TARGET_NAMES[busy.target]} est en cours : publie une fois qu’il est terminé.
    </p>
  )
}
