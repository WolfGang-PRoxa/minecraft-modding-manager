import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { shell } from 'electron'

/** Pourquoi un chemin demandé par la fenêtre n'a pas été ouvert. */
export class OpenFolderError extends Error {}

/**
 * Ouvre un dossier dans l'Explorateur, à la demande de la fenêtre. Seul un dossier est accepté : ouvrir un fichier
 * le lancerait avec son programme, et un `.exe` serait exécuté. La fenêtre ne demande jamais que des dossiers
 * (profils, Instances, modpacks, essais).
 */
export async function openFolder(path: unknown): Promise<void> {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new OpenFolderError('Chemin invalide.')
  const info = await stat(path).catch(() => null)
  if (!info) throw new OpenFolderError('Ce dossier n’existe plus.')
  if (!info.isDirectory()) throw new OpenFolderError('Seul un dossier peut être ouvert.')
  const error = await shell.openPath(path)
  if (error) throw new OpenFolderError(`Ouverture du dossier impossible : ${error}`)
}
