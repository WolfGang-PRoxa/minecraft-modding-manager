import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { CurseForgeProfile } from '../shared/types'
import { isModJar, modsSignature } from './modsSignature'

async function profileModsSignature(dir: string): Promise<string | null> {
  const modsDir = join(dir, 'mods')
  const entries = await readdir(modsDir, { withFileTypes: true }).catch(() => [])
  const jars = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isModJar(entry.name))
      .map(async (entry) => {
        const info = await stat(join(modsDir, entry.name)).catch(() => null)
        return info ? { name: entry.name, size: info.size } : null
      })
  )
  return modsSignature(jars.filter((jar) => jar !== null))
}

/**
 * Profils du dossier Instances de CurseForge, avec l'empreinte de leurs mods. Relu à chaque fois : même avec
 * des milliers de mods, il ne s'agit que de lister des dossiers (quelques dizaines de millisecondes).
 */
export async function listProfiles(instancesDir: string): Promise<CurseForgeProfile[]> {
  const entries = await readdir(instancesDir, { withFileTypes: true }).catch(() => [])
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const path = join(instancesDir, entry.name)
        return { name: entry.name, path, modsSignature: await profileModsSignature(path) }
      })
  )
}
