import { create } from 'zustand'
import { compareVersions } from '../../../shared/releases'
import type { PublishProgress, PublishResult } from '../../../shared/studio'
import { useStore } from '../store'
import { errorMessage, useStudio } from './store'

/**
 * Publications lancées depuis le Studio. Une fois « Publier » cliqué, la fenêtre se ferme et l'envoi continue en
 * arrière-plan : il est suivi dans un encart au-dessus des notifications (`PublicationsTray`), dans toutes les vues,
 * et son résultat arrive en notification. Le moteur n'accepte qu'une opération d'écriture à la fois (`exclusive`).
 */

export type PublicationTarget = 'github' | 'curseforge' | 'modrinth' | 'hangar'

export const TARGET_NAMES: Record<PublicationTarget, string> = {
  github: 'GitHub',
  curseforge: 'CurseForge',
  modrinth: 'Modrinth',
  hangar: 'Hangar'
}

export interface Publication {
  id: number
  target: PublicationTarget
  /** Ce qui part : « Mon pack, v3 », « 4 changements »… */
  subject: string
  /** Étape en cours d'un envoi vers CurseForge, Modrinth ou Hangar. */
  step: string | null
  /** Progression détaillée d'une publication sur GitHub. */
  progress: PublishProgress | null
  stopping: boolean
}

/** Dernière publication sur GitHub, en cours ou terminée : montrée par la fenêtre de suivi. */
export interface GitHubPublication {
  progress: PublishProgress | null
  result: PublishResult | null
}

interface PublicationsState {
  running: Publication[]
  github: GitHubPublication | null
  /** Fenêtre de suivi de la publication sur GitHub ouverte. */
  following: boolean
  follow(open: boolean): void
}

export const usePublications = create<PublicationsState>((set) => ({
  running: [],
  github: null,
  following: false,
  follow(open) {
    set({ following: open })
  }
}))

/** Libellé de l'opération en cours, pour expliquer pourquoi une autre publication attend. */
export function useRunningPublication(): Publication | null {
  return usePublications((s) => s.running[0] ?? null)
}

let nextId = 0
let listening = false

function update(id: number, patch: Partial<Publication>): void {
  usePublications.setState((s) => ({ running: s.running.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
}

function start(target: PublicationTarget, subject: string): number {
  if (!listening) {
    listening = true
    window.studio.onPublishProgress((progress) => {
      usePublications.setState((s) => ({
        running: s.running.map((p) => (p.target === 'github' ? { ...p, progress } : p)),
        github: s.github && !s.github.result ? { ...s.github, progress } : s.github
      }))
    })
    // Un seul canal pour CurseForge, Modrinth et Hangar : le moteur n'en fait qu'un à la fois.
    window.studio.onCurseForgeProgress((step) => {
      const current = [...usePublications.getState().running].reverse().find((p) => p.target !== 'github')
      if (current) update(current.id, { step })
    })
  }
  const id = ++nextId
  usePublications.setState((s) => ({ running: [...s.running, { id, target, subject, step: null, progress: null, stopping: false }] }))
  return id
}

function finish(id: number): void {
  usePublications.setState((s) => ({ running: s.running.filter((p) => p.id !== id) }))
  void useStudio.getState().refresh()
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** Publie sur GitHub le plan vu dans l'aperçu (`fingerprint`), en arrière-plan. */
export async function publishToGitHub(fingerprint: string, changes: number): Promise<void> {
  const id = start('github', plural(changes, 'changement'))
  usePublications.setState({ github: { progress: null, result: null } })
  let result: PublishResult
  try {
    result = await window.studio.publish(fingerprint)
  } catch (err) {
    result = { ok: false, cancelled: false, error: errorMessage(err), done: 0 }
  }
  usePublications.setState((s) => ({ github: { progress: s.github?.progress ?? null, result } }))
  finish(id)
  // La bibliothèque montre aussitôt ce qui vient d'être publié.
  if (result.done > 0) void useStore.getState().refresh(true)

  const details = { label: 'Voir le détail', run: () => usePublications.getState().follow(true) }
  const { pushToast } = useStudio.getState()
  if (result.ok) {
    pushToast({
      kind: 'success',
      title: 'Publication sur GitHub terminée',
      message: `${plural(result.done, 'changement')} appliqué${result.done > 1 ? 's' : ''}. Les joueurs le verront en actualisant leur application.`
    })
  } else if (result.cancelled) {
    pushToast({
      kind: 'info',
      title: 'Publication sur GitHub arrêtée',
      message: 'Ce qui a été fait est conservé ; relance « Publier » pour terminer.',
      action: details
    })
  } else {
    pushToast({
      kind: 'error',
      title: 'La publication sur GitHub s’est arrêtée sur une erreur',
      message: `${result.error} Ce qui a été fait est conservé ; relance « Publier » pour terminer.`,
      action: details,
      sticky: true
    })
  }
}

/** Arrête la publication sur GitHub en cours : l'étape en cours est annulée proprement. */
export function stopGitHubPublication(): void {
  const current = usePublications.getState().running.find((p) => p.target === 'github')
  if (!current || current.stopping) return
  update(current.id, { stopping: true })
  void window.studio.cancelPublish()
}

/**
 * Envoie une version sur CurseForge, Modrinth ou Hangar en arrière-plan. `onSuccess` annonce le résultat ; un échec
 * reste affiché jusqu'à ce qu'on le ferme, puisque le publieur a pu passer à autre chose.
 */
export async function runPublication<R extends { ok: true }>(options: {
  target: Exclude<PublicationTarget, 'github'>
  subject: string
  run: () => Promise<R | { ok: false; error: string }>
  onSuccess: (result: R) => void
}): Promise<void> {
  const id = start(options.target, options.subject)
  let result: R | { ok: false; error: string }
  try {
    result = await options.run()
  } catch (err) {
    result = { ok: false, error: errorMessage(err) }
  }
  finish(id)
  if (result.ok) options.onSuccess(result as R)
  else {
    useStudio.getState().pushToast({
      kind: 'error',
      title: `Envoi sur ${TARGET_NAMES[options.target]} impossible`,
      message: `${options.subject} : ${(result as { error: string }).error}`,
      sticky: true
    })
  }
}

/**
 * Envoie l'une après l'autre les versions d'un groupe (`1.0.0+26.3-fabric`, `1.0.0+1.21.5-forge`…), de la plus
 * ancienne à la plus récente : la dernière envoyée est la plus récente sur le site. S'arrête à la première erreur,
 * en disant combien sont déjà parties.
 */
export async function publishEach<R extends { ok: true; unknownDependencies: string[] }>(
  versions: string[],
  publish: (version: string) => Promise<R | { ok: false; error: string }>
): Promise<{ ok: true; sent: number; unknownDependencies: string[] } | { ok: false; error: string }> {
  const unknown = new Set<string>()
  let sent = 0
  for (const version of [...versions].sort(compareVersions)) {
    const result = await publish(version)
    if (!result.ok) return { ok: false, error: sent ? `${version} : ${result.error} (${sent} sur ${versions.length} déjà envoyées)` : result.error }
    for (const dependency of result.unknownDependencies) unknown.add(dependency)
    sent++
  }
  return { ok: true, sent, unknownDependencies: [...unknown] }
}
