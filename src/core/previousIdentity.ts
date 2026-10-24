// Reprise de ce que les identités précédentes (« Modpack Manager » 1.9.x, « Modpack Downloader » jusqu'à la 1.8) ont
// laissé sur le PC, faite par le moteur pour qu'elle serve à l'application comme aux commandes : les dossiers des
// données, et le marqueur de chaque profil installé. Voir shared/previousIdentity.ts.
import { existsSync, readdirSync, renameSync, rmdirSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { join } from 'node:path'
import { APP_NAME, INSTANCE_MARKER_FILE } from '../shared/config'
import { PREVIOUS_IDENTITIES, PREVIOUS_INSTANCE_MARKERS, PREVIOUS_PRODUCT } from '../shared/previousIdentity'
import { readJson } from './fsutil'

/**
 * Déplacer et renommer ce qu'ont laissé les identités précédentes : seulement depuis l'application installée (et ses
 * commandes, dans app.asar). En développement, l'application installée, peut-être encore ancienne, se sert des mêmes
 * fichiers : on lit alors l'ancien nom sans rien déplacer.
 */
let migrate = typeof __dirname === 'string' && __dirname.includes('app.asar')

export function enablePreviousIdentityMigration(enabled: boolean): void {
  migrate = enabled
}

/**
 * Range `previous` dans `current` : renommé d'un bloc si `current` n'existe pas, sinon entrée par entrée pour ce qui
 * manque (rien n'est jamais écrasé), puis l'ancien dossier est retiré s'il est vide. Lève si un déplacement échoue.
 */
function moveInto(previous: string, current: string): void {
  if (!existsSync(current)) {
    renameSync(previous, current)
    return
  }
  for (const entry of readdirSync(previous)) {
    if (!existsSync(join(current, entry))) renameSync(join(previous, entry), join(current, entry))
  }
  if (readdirSync(previous).length === 0) rmdirSync(previous)
}

/**
 * Le dossier des données de l'application dans `appData` (%APPDATA%), après y avoir déplacé celui d'un ancien nom
 * s'il existe encore (le plus récent d'abord) : réglages, connexion GitHub et clés (chiffrées par Windows pour le
 * compte, pas pour le dossier), caches, journal, mises à jour automatiques. Si le déplacement échoue (fichier ouvert),
 * l'ancien dossier sert encore cette fois ; on réessaie au lancement suivant. Rien n'est jamais écrasé.
 */
export function migrateDataDir(appData: string): string {
  const current = join(appData, APP_NAME)
  if (existsSync(join(current, 'settings.json'))) return current
  const previous = PREVIOUS_IDENTITIES.map((identity) => join(appData, identity.dataDir)).find((dir) => existsSync(dir))
  if (!previous) return current
  if (!migrate) return previous
  try {
    moveInto(previous, current)
    return current
  } catch {
    return existsSync(join(current, 'settings.json')) ? current : previous
  }
}

/**
 * Le dossier des données locales de l'application dans `localAppData` (%LOCALAPPDATA%) : résultats des tests,
 * serveurs et dossiers de jeu des tests. Celui de l'ancien nom y est déplacé s'il existe encore ; s'il ne peut pas
 * l'être, il sert encore cette fois.
 */
export function migrateLocalDataDir(localAppData: string): string {
  const current = join(localAppData, APP_NAME)
  const previous = join(localAppData, PREVIOUS_PRODUCT.localDataDir)
  if (!existsSync(previous) || previous.toLowerCase() === current.toLowerCase()) return current
  if (!migrate) return existsSync(current) ? current : previous
  try {
    moveInto(previous, current)
    return current
  } catch {
    return existsSync(current) ? current : previous
  }
}

/**
 * Le marqueur d'un profil installé par l'application ; celui d'un ancien nom est renommé au passage (s'il ne peut pas
 * l'être, il est lu tel quel).
 */
export async function readInstanceMarker<T>(dir: string): Promise<T | null> {
  const marker = await readJson<T>(join(dir, INSTANCE_MARKER_FILE))
  if (marker) return marker
  for (const name of PREVIOUS_INSTANCE_MARKERS) {
    const previous = join(dir, name)
    const old = await readJson<T>(previous)
    if (!old) continue
    if (migrate) await rename(previous, join(dir, INSTANCE_MARKER_FILE)).catch(() => {})
    return old
  }
  return null
}

/** Le dépôt de l'application sous un ancien nom devient le dépôt actuel (GitHub ne fait que rediriger l'ancien). */
export function currentRepoName(owner: string, name: string, app: { owner: string; name: string }): string {
  if (owner.toLowerCase() !== app.owner.toLowerCase()) return name
  return PREVIOUS_IDENTITIES.some((identity) => identity.repoName === name.toLowerCase()) ? app.name : name
}
