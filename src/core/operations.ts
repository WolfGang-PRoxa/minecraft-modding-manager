import { join } from 'node:path'
import { Journal } from './journal'
import { OperationLock } from './lock'
import { settingsDir } from './settings'

/**
 * Verrou et journal des opérations, rangés à côté des réglages : la fenêtre, la ligne de commande et le serveur
 * MCP les partagent. `holder` dit qui agit (« l’application », « la ligne de commande »…). À appeler une fois le
 * fichier des réglages choisi (useSettingsFile dans l'application).
 */
export function operationTools(holder: string): { lock: OperationLock; journal: Journal } {
  return {
    lock: new OperationLock(join(settingsDir(), 'operation.lock'), holder),
    journal: new Journal(join(settingsDir(), 'journal.jsonl'), holder)
  }
}
