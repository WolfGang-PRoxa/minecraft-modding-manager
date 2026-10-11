// Les mods d'une instance CurseForge vus par son minecraftinstance.json (installedAddons) : leur projet CurseForge,
// leur nom, et leur état. CurseForge désactive un mod en renommant son fichier `x.jar.disabled` ; dans le fichier de
// l'instance, l'entrée du mod passe alors à `isEnabled: false`, et son `fileNameOnDisk` et ses `filePaths` prennent le
// nouveau nom (celui d'`installedFile` ne change pas). Node pur : partagé par le studio et l'installation.

type Json = Record<string, unknown>

/** Nom d'un fichier de mod sans l'extension `.disabled` que CurseForge ajoute à un mod désactivé. */
export const baseModFile = (fileName: string): string => fileName.replace(/\.disabled$/i, '')

/** Un mod : un .jar posé directement dans mods, éventuellement désactivé (`.jar.disabled`). */
export const MOD_PATH = /^mods\/([^/]+\.jar)(\.disabled)?$/i

export interface AddonInfo {
  addonId: number | null
  name: string | null
  author: string | null
  /** Page CurseForge du mod. */
  url: string | null
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

function addons(instance: unknown): Json[] {
  const list = (instance as { installedAddons?: unknown } | null)?.installedAddons
  return Array.isArray(list) ? (list.filter((addon) => addon && typeof addon === 'object') as Json[]) : []
}

/** Fichiers d'une entrée d'installedAddons, sans `.disabled` (son fichier d'origine et celui posé sur le disque). */
function addonFiles(addon: Json): string[] {
  const file = addon.installedFile as Json | undefined
  return [addon.fileNameOnDisk, addon.FileNameOnDisk, file?.fileName, file?.fileNameOnDisk, file?.FileNameOnDisk]
    .map(text)
    .filter((name): name is string => name !== null)
    .map(baseModFile)
}

/** Projet CurseForge, nom, auteur et page de chaque mod connu, par fichier (sans `.disabled`, en minuscules). */
export function addonsByFile(instance: unknown): Map<string, AddonInfo> {
  const byFile = new Map<string, AddonInfo>()
  for (const addon of addons(instance)) {
    const id = Number(addon.addonID)
    const url = text(addon.webSiteURL)
    const info: AddonInfo = {
      addonId: Number.isInteger(id) && id > 0 ? id : null,
      name: text(addon.name),
      author: text(addon.primaryAuthor),
      url: url && /^https:\/\//i.test(url) ? url : null
    }
    for (const name of addonFiles(addon)) byFile.set(name.toLowerCase(), info)
  }
  return byFile
}

/** Clé d'un mod d'une version à l'autre : son projet CurseForge s'il en a un, sinon son fichier. */
export function modKey(addonId: number | null, fileName: string): string {
  return addonId !== null ? `addon:${addonId}` : `file:${baseModFile(fileName).toLowerCase()}`
}

/**
 * Inscrit dans minecraftinstance.json le nouvel état d'un mod dont le fichier vient d'être renommé (activé :
 * `x.jar`, désactivé : `x.jar.disabled`), comme le fait CurseForge.
 */
export function setAddonEnabled(instance: unknown, fileName: string, enabled: boolean): void {
  const base = baseModFile(fileName)
  const onDisk = enabled ? base : `${base}.disabled`
  const same = (name: string) => baseModFile(name).toLowerCase() === base.toLowerCase()
  for (const addon of addons(instance)) {
    if (!addonFiles(addon).some(same)) continue
    addon.isEnabled = enabled
    addon[typeof addon.FileNameOnDisk === 'string' ? 'FileNameOnDisk' : 'fileNameOnDisk'] = onDisk
    if (Array.isArray(addon.filePaths)) {
      addon.filePaths = addon.filePaths.map((path: unknown) =>
        typeof path === 'string' ? path.replace(/[^\\/]+$/, (name) => (same(name) ? onDisk : name)) : path
      )
    }
  }
}
