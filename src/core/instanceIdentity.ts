// Identité d'un profil CurseForge : son guid figure dans minecraftinstance.json (`guid`), dans chaque entrée
// d'installedAddons (`gameInstanceID`), et dans le fichier caché `.curseclient` du dossier (constaté sur les profils du
// propriétaire). Un profil copié ou installé depuis un zip doit recevoir une identité à lui, cohérente partout, pour
// que CurseForge ne le confonde jamais avec celui d'où il vient.
import { open } from 'node:fs/promises'
import { join } from 'node:path'

export const CURSECLIENT_FILE = '.curseclient'

type Json = Record<string, unknown>

/** Donne le guid au profil et à chacune de ses entrées d'installedAddons. */
export function applyInstanceGuid(instance: Json, guid: string): void {
  instance.guid = guid
  for (const addon of (instance.installedAddons as Json[] | undefined) ?? []) {
    if (addon && typeof addon === 'object') addon.gameInstanceID = guid
  }
}

/**
 * Écrit le guid dans `.curseclient`. Le fichier est caché : Windows refuse de l'ouvrir en écriture « neuve », on le
 * réécrit donc en place s'il existe.
 */
export async function writeCurseClientFile(dir: string, guid: string): Promise<void> {
  const file = join(dir, CURSECLIENT_FILE)
  const handle = await open(file, 'r+').catch(() => open(file, 'w'))
  try {
    await handle.truncate(0)
    await handle.write(guid, 0, 'utf8')
  } finally {
    await handle.close()
  }
}
