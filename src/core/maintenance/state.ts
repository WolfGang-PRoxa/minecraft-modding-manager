// Ce que les passages ont donné, par modpack (maintenance.json, à côté des réglages) : lu par la fenêtre, par les
// commandes et par Claude, écrit par les passages (fenêtre, ligne de commande ou tâche planifiée).
import { join } from 'node:path'
import type { MaintenanceRecord } from '../../shared/studio'
import { readJson, writeJsonAtomic } from '../fsutil'
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

/**
 * Enregistre le passage d'un modpack. `replace` : remplace aussi un essai en attente (essai validé ou abandonné).
 */
export async function saveRecord(record: MaintenanceRecord, options: { replace?: boolean } = {}): Promise<void> {
  const state = await readMaintenanceState()
  const previous = state[record.packId] ?? { checkedAt: null, last: null }
  if (record.outcome === 'skipped' && !options.replace && awaitsDecision(previous.last) && previous.last?.trialPath) return
  state[record.packId] = {
    checkedAt: record.outcome === 'skipped' ? previous.checkedAt : record.at,
    last: record
  }
  await writeJsonAtomic(stateFile(), state)
}
