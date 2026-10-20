// Ce que les passages ont donné, par modpack (maintenance.json, à côté des réglages) : lu par la fenêtre, par les
// commandes et par Claude, écrit par les passages (fenêtre, ligne de commande ou tâche planifiée).
import { join, resolve } from 'node:path'
import type { MaintenanceRecord } from '../../shared/studio'
import { pathExists, readJson, writeJsonAtomic } from '../fsutil'
import { settingsDir } from '../settings'

interface PackState {
  /** Dernière recherche de mises à jour (un passage remis à plus tard ne compte pas). */
  checkedAt: string | null
  last: MaintenanceRecord | null
}

export type MaintenanceState = Record<string, PackState>

const stateFile = () => join(settingsDir(), 'maintenance.json')

export async function readMaintenanceState(): Promise<MaintenanceState> {
  const data = await readJson<MaintenanceState>(stateFile())
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
}

/** Un essai attend une décision : un passage remis à plus tard ne doit pas le faire oublier. */
const awaitsDecision = (record: MaintenanceRecord | null) => record?.outcome === 'ready' || record?.outcome === 'failed'

/** Un essai attend une décision et existe encore : son dossier a pu être reporté ou supprimé à côté. */
async function stillPending(record: MaintenanceRecord | null): Promise<boolean> {
  return awaitsDecision(record) && Boolean(record?.trialPath) && (await pathExists(record!.trialPath!))
}

const STALE_TRIAL = 'L’essai n’existe plus (reporté ou supprimé en dehors des mises à jour automatiques) : plus rien à décider.'

/**
 * Le dernier passage tel qu'il faut le montrer : un essai en attente dont le dossier a disparu n'attend plus rien.
 * Sans cela, sa section resterait affichée sans qu'aucun bouton puisse la retirer.
 */
export async function currentRecord(record: MaintenanceRecord | null): Promise<MaintenanceRecord | null> {
  if (!record || !awaitsDecision(record) || !record.trialPath || (await stillPending(record))) return record
  return { ...record, outcome: 'skipped', message: STALE_TRIAL, trialPath: null }
}

/**
 * Enregistre le passage d'un modpack. `replace` : remplace aussi un essai en attente (essai validé ou abandonné).
 */
export async function saveRecord(record: MaintenanceRecord, options: { replace?: boolean } = {}): Promise<void> {
  const state = await readMaintenanceState()
  const previous = state[record.packId] ?? { checkedAt: null, last: null }
  if (record.outcome === 'skipped' && !options.replace && (await stillPending(previous.last))) return
  state[record.packId] = {
    checkedAt: record.outcome === 'skipped' ? previous.checkedAt : record.at,
    last: record
  }
  await writeJsonAtomic(stateFile(), state)
}

const samePath = (a: string, b: string) =>
  process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)

/**
 * Un essai a été reporté ou abandonné en dehors des mises à jour automatiques (mises à jour du profil, commandes,
 * Claude) : le passage qui l'attendait n'attend plus rien. Une erreur ici ne doit pas faire échouer l'opération.
 */
export async function forgetTrial(trialPath: string, message: string): Promise<void> {
  try {
    const state = await readMaintenanceState()
    let changed = false
    for (const entry of Object.values(state)) {
      const last = entry.last
      if (!last || !awaitsDecision(last) || !last.trialPath || !samePath(last.trialPath, trialPath)) continue
      entry.last = { ...last, at: new Date().toISOString(), outcome: 'skipped', message, trialPath: null }
      changed = true
    }
    if (changed) await writeJsonAtomic(stateFile(), state)
  } catch {
    // État illisible ou disque plein : l'affichage s'en remet à currentRecord.
  }
}
