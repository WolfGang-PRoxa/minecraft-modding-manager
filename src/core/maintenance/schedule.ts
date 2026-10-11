// Rythme des mises à jour automatiques : quand le tour d'un modpack revient.
import type { PackUpdates, UpdateFrequency } from '../../shared/studio'

const DAY_MS = 24 * 3600 * 1000

/** Jours entre deux recherches, pour les fréquences qui en ont une. */
export const FREQUENCY_DAYS: Partial<Record<UpdateFrequency, number>> = { weekly: 7, biweekly: 14, monthly: 30 }

export const FREQUENCY_LABELS: Record<UpdateFrequency, string> = {
  weekly: 'chaque semaine',
  biweekly: 'toutes les deux semaines',
  monthly: 'chaque mois',
  manual: 'à la demande',
  never: 'jamais'
}

/**
 * La tâche planifiée passe chaque jour à la même heure : un passage quelques heures en avance compte comme à l'heure,
 * sinon un retard de quelques minutes la veille décalerait le modpack d'un jour à chaque fois.
 */
const MARGIN_MS = 6 * 3600 * 1000

/** Date du prochain passage : maintenant s'il n'y en a jamais eu, null pour `manual` et `never`. */
export function dueAt(updates: PackUpdates, checkedAt: string | null, now = new Date()): Date | null {
  const days = FREQUENCY_DAYS[updates.frequency]
  if (!days) return null
  const last = checkedAt ? Date.parse(checkedAt) : NaN
  return Number.isNaN(last) ? now : new Date(last + days * DAY_MS)
}

export function isDue(updates: PackUpdates, checkedAt: string | null, now = new Date()): boolean {
  const due = dueAt(updates, checkedAt, now)
  return due !== null && due.getTime() - MARGIN_MS <= now.getTime()
}
