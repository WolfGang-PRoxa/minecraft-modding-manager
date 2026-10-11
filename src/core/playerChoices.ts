// Ce qu'une mise à jour d'un modpack garde des choix du joueur, en plus de ses données (voir installer.ts) :
//  - les fichiers du dossier config qu'il a modifiés, si le publieur l'a demandé (keepPlayerConfigs) ;
//  - les mods qu'il a activés ou désactivés dans CurseForge.
// L'installation note dans le marqueur de l'instance ce que la version fournissait (empreinte de chaque fichier de
// configuration, mods désactivés par défaut) : à la mise à jour suivante, ce qui s'en écarte vient du joueur.
// Node pur : testé hors d'Electron.
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { InstanceMarker } from '../shared/types'
import { renameWithRetry } from './fsutil'
import { addonsByFile, baseModFile, modKey, setAddonEnabled } from './instanceAddons'

export const CONFIG_DIR = 'config'
const MODS_DIR = 'mods'

/**
 * Installations antérieures aux empreintes : un fichier de configuration modifié plus d'une minute après
 * l'installation est considéré comme changé par le joueur.
 */
const MODIFIED_AFTER_MS = 60_000

const sha1 = async (file: string) => createHash('sha1').update(await readFile(file)).digest('hex')

/** Fichiers d'un dossier et de ses sous-dossiers, en chemins relatifs « a/b.txt ». */
async function listTree(dir: string, base = ''): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...(await listTree(join(dir, entry.name), rel)))
    else if (entry.isFile()) files.push(rel)
  }
  return files
}

const lowerKeys = (record: Record<string, string>) => new Map(Object.entries(record).map(([k, v]) => [k.toLowerCase(), v]))

/** Empreinte de chaque fichier du dossier config d'une instance, par chemin depuis l'instance (« config/x.toml »). */
export async function hashConfigFiles(instanceDir: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {}
  for (const rel of await listTree(join(instanceDir, CONFIG_DIR))) {
    hashes[`${CONFIG_DIR}/${rel}`] = await sha1(join(instanceDir, CONFIG_DIR, ...rel.split('/')))
  }
  return hashes
}

/**
 * Garde les fichiers du dossier config qui appartiennent au joueur, en les déplaçant de l'instance mise de côté
 * (`oldDir`) dans la nouvelle version (`newDir`) :
 *  - un fichier fourni par l'ancienne version est gardé si le joueur l'a modifié ;
 *  - un fichier qu'elle ne fournissait pas (créé par le joueur ou par un mod) est gardé, sauf si la nouvelle
 *    version en fournit un : le publieur l'a alors réglé.
 * Les autres suivent la nouvelle version. `shipped` : empreintes des fichiers de config de la nouvelle version.
 * Renvoie le nombre de fichiers du joueur gardés à la place d'un fichier différent de la nouvelle version.
 */
export async function carryOverConfigs(
  oldDir: string,
  newDir: string,
  previous: Pick<InstanceMarker, 'configFiles' | 'installedAt'>,
  shipped: Record<string, string>
): Promise<number> {
  const baseline = previous.configFiles ? lowerKeys(previous.configFiles) : null
  const incoming = lowerKeys(shipped)
  const installedAt = Date.parse(previous.installedAt)
  let kept = 0
  for (const rel of await listTree(join(oldDir, CONFIG_DIR))) {
    const key = `${CONFIG_DIR}/${rel}`.toLowerCase()
    const from = join(oldDir, CONFIG_DIR, ...rel.split('/'))
    const to = join(newDir, CONFIG_DIR, ...rel.split('/'))
    try {
      const current = await sha1(from)
      const next = incoming.get(key)
      // Identique au fichier de la nouvelle version : rien à garder.
      if (next === current) continue
      let keep: boolean
      if (baseline) {
        const original = baseline.get(key)
        keep = original !== undefined ? current !== original : next === undefined
      } else {
        // Installé avant que l'application note les empreintes : on se fie à la date du fichier.
        keep =
          next === undefined ||
          (Number.isFinite(installedAt) && (await stat(from)).mtimeMs > installedAt + MODIFIED_AFTER_MS)
      }
      if (!keep) continue
      // Un dossier de la nouvelle version au même nom : on ne remplace pas un dossier par un fichier.
      if ((await stat(to).catch(() => null))?.isDirectory()) continue
      await mkdir(dirname(to), { recursive: true })
      await renameWithRetry(from, to)
      if (next !== undefined) kept++
    } catch {
      // Un fichier qui résiste (chemin en conflit avec la nouvelle version…) suit simplement la nouvelle version.
    }
  }
  return kept
}

export interface ModState {
  /** Clé du mod d'une version à l'autre (voir modKey). */
  key: string
  /** Fichier dans mods, `.disabled` compris. */
  file: string
  disabled: boolean
}

/** Mods d'une instance (fichiers .jar et .jar.disabled du dossier mods), avec leur clé et leur état. */
export async function readModStates(instanceDir: string, instance: unknown): Promise<ModState[]> {
  const addons = addonsByFile(instance)
  const states: ModState[] = []
  for (const entry of await readdir(join(instanceDir, MODS_DIR), { withFileTypes: true }).catch(() => [])) {
    const match = /^(.+\.jar)(\.disabled)?$/i.exec(entry.name)
    if (!entry.isFile() || !match) continue
    const addonId = addons.get(match[1].toLowerCase())?.addonId ?? null
    states.push({ key: modKey(addonId, match[1]), file: entry.name, disabled: Boolean(match[2]) })
  }
  return states
}

/**
 * Règle l'état des mods de la version installée (dans `dir`, avec son minecraftinstance.json `instance`, modifié sur
 * place) : désactivés par défaut, ceux que le zip contient désactivés et ceux que demande le publieur
 * (`disabledByPublisher`). Lors d'une mise à jour (`previous`), un mod que le joueur avait mis dans l'autre état garde
 * son choix. Renvoie les clés des mods désactivés par défaut, à noter dans le marqueur.
 */
export async function applyModStates(
  dir: string,
  instance: unknown,
  disabledByPublisher: string[],
  previous: { states: ModState[]; disabledByDefault: string[] | undefined } | null
): Promise<string[]> {
  const wanted = new Set(disabledByPublisher.map((file) => baseModFile(file).toLowerCase()))
  const before = new Map(previous?.states.map((state) => [state.key, state.disabled]))
  const previousDefaults = previous?.disabledByDefault ? new Set(previous.disabledByDefault) : null
  const defaults: string[] = []
  for (const mod of await readModStates(dir, instance)) {
    const base = baseModFile(mod.file)
    const byDefault = mod.disabled || wanted.has(base.toLowerCase())
    if (byDefault) defaults.push(mod.key)
    let disabled = byDefault
    const was = before.get(mod.key)
    if (was !== undefined) {
      if (previousDefaults) {
        // Le joueur avait changé l'état de ce mod : son choix l'emporte sur celui de la nouvelle version.
        if (was !== previousDefaults.has(mod.key)) disabled = was
      } else if (was) {
        // Installé avant que l'application note les mods désactivés par défaut : un mod désactivé le reste.
        disabled = true
      }
    }
    if (disabled === mod.disabled) continue
    await renameWithRetry(join(dir, MODS_DIR, mod.file), join(dir, MODS_DIR, disabled ? `${base}.disabled` : base))
    setAddonEnabled(instance, base, !disabled)
  }
  return defaults
}
