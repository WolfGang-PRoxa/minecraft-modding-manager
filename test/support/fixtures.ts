// Dossiers temporaires et fausses instances CurseForge pour les tests.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Dossier temporaire supprimé par `cleanup`. */
export async function tempDir(prefix = 'mpm-test-'): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true, maxRetries: 5 }) }
}

export interface FakeMod {
  file: string
  addonId?: number
  name?: string
  disabled?: boolean
}

export interface FakeInstance {
  gameVersion?: string
  loader?: string
  mods?: FakeMod[]
  /** Autres fichiers, par chemin relatif à l'instance. */
  files?: Record<string, string>
}

/** Crée une instance CurseForge minimale (minecraftinstance.json, mods, autres fichiers) et renvoie son dossier. */
export async function makeInstance(instancesDir: string, name: string, spec: FakeInstance = {}): Promise<string> {
  const dir = join(instancesDir, name)
  const mods = spec.mods ?? [{ file: 'example-mod-1.0.jar', addonId: 1001, name: 'Example Mod' }]
  const instance = {
    name,
    gameVersion: spec.gameVersion ?? '1.20.1',
    baseModLoader: { name: spec.loader ?? 'forge-47.4.0' },
    lastPlayed: '2026-10-01T12:00:00Z',
    installedAddons: mods
      .filter((m) => m.addonId)
      .map((m) => ({
        addonID: m.addonId,
        name: m.name ?? m.file,
        isEnabled: !m.disabled,
        fileNameOnDisk: m.disabled ? `${m.file}.disabled` : m.file,
        installedFile: { fileName: m.file, fileNameOnDisk: m.file }
      }))
  }
  const files: Record<string, string> = {
    'minecraftinstance.json': JSON.stringify(instance, null, 2),
    ...Object.fromEntries(mods.map((m) => [`mods/${m.file}${m.disabled ? '.disabled' : ''}`, `jar:${m.file}`])),
    ...spec.files
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), content)
  }
  return dir
}
