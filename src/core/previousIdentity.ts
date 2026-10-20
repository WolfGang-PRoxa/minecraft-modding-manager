// Reprise de ce que les versions d'avant la 1.9.0 (« Modpack Downloader ») ont laissé sur le PC, faite par le moteur
// pour qu'elle serve à l'application comme aux commandes : le dossier des données, et le marqueur de chaque profil
// installé. À retirer avec shared/previousIdentity.ts (voir ce fichier).
import { existsSync, readdirSync, renameSync, rmdirSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { join } from 'node:path'
import { APP_NAME, INSTANCE_MARKER_FILE } from '../shared/config'
import { PREVIOUS_IDENTITY } from '../shared/previousIdentity'
import { readJson } from './fsutil'

/**
 * Déplacer et renommer ce qu'a laissé l'ancienne identité : seulement depuis l'application installée (et ses
 * commandes, dans app.asar). En développement, l'application installée, peut-être encore d'avant la 1.9.0, se sert des
 * mêmes fichiers : on lit alors l'ancien nom sans rien déplacer.
 */
let migrate = typeof __dirname === 'string' && __dirname.includes('app.asar')

export function enablePreviousIdentityMigration(enabled: boolean): void {
  migrate = enabled
}

/**
 * Le dossier des données de l'application dans `appData` (%APPDATA%), après y avoir déplacé celui de l'ancien nom
 * s'il existe encore : réglages, connexion GitHub et clé CurseForge (chiffrées par Windows pour le compte, pas pour
 * le dossier), caches, journal, mises à jour automatiques. Si le déplacement échoue (fichier ouvert), l'ancien dossier
 * sert encore cette fois ; on réessaie au lancement suivant. Rien n'est jamais écrasé.
 */
export function migrateDataDir(appData: string): string {
  const current = join(appData, APP_NAME)
  const previous = join(appData, PREVIOUS_IDENTITY.dataDir)
  if (!existsSync(previous) || existsSync(join(current, 'settings.json'))) return current
  if (!migrate) return previous
  try {
    if (!existsSync(current)) {
      renameSync(previous, current)
    } else {
      // Un dossier au nouveau nom existe déjà sans réglages (créé entre-temps) : on y range ce qui manque.
      for (const entry of readdirSync(previous)) {
        if (!existsSync(join(current, entry))) renameSync(join(previous, entry), join(current, entry))
      }
      if (readdirSync(previous).length === 0) rmdirSync(previous)
    }
    return current
  } catch {
    return existsSync(join(current, 'settings.json')) ? current : previous
  }
}

/**
 * Le marqueur d'un profil installé par l'application ; celui de l'ancien nom est renommé au passage (s'il ne peut pas
 * l'être, il est lu tel quel).
 */
export async function readInstanceMarker<T>(dir: string): Promise<T | null> {
  const marker = await readJson<T>(join(dir, INSTANCE_MARKER_FILE))
  if (marker) return marker
  const previous = join(dir, PREVIOUS_IDENTITY.instanceMarker)
  const old = await readJson<T>(previous)
  if (old && migrate) await rename(previous, join(dir, INSTANCE_MARKER_FILE)).catch(() => {})
  return old
}

/** Le dépôt de l'application sous son ancien nom devient le dépôt actuel (GitHub ne fait que rediriger l'ancien). */
export function currentRepoName(owner: string, name: string, app: { owner: string; name: string }): string {
  return owner.toLowerCase() === app.owner.toLowerCase() && name.toLowerCase() === PREVIOUS_IDENTITY.repoName ? app.name : name
}
