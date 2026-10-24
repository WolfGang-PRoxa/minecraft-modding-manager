// Types de contenu que le Studio range et publie. Chacun a son préfixe de tag et son fichier de description dans les
// releases GitHub. Jamais `pack-` ni `modpack.json` pour un autre type que le modpack : les applications installées
// (jusqu'à la 1.9.3) affichent comme modpack toute release qui porte l'un ou l'autre.
import { CONTENT_MANIFEST_ASSET, MODPACK_MANIFEST_ASSET, MODPACK_TAG_PREFIX } from './config'

export type ContentKind = 'modpack' | 'mod' | 'resourcepack' | 'shader' | 'plugin'

/** Chargeurs qu'un mod peut viser. */
export type ModLoader = 'fabric' | 'quilt' | 'forge' | 'neoforge'
/** Serveurs qui chargent un plugin. */
export type PluginPlatform = 'paper' | 'spigot' | 'bukkit' | 'purpur' | 'folia'
/** Ce qui fait tourner un contenu : le chargeur d'un mod, celui des shaders (Iris, OptiFine), le serveur d'un plugin. */
export type ContentLoader = ModLoader | 'iris' | 'optifine' | PluginPlatform

export const LOADER_LABELS: Record<ContentLoader, string> = {
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge',
  iris: 'Iris',
  optifine: 'OptiFine',
  paper: 'Paper',
  spigot: 'Spigot',
  bukkit: 'Bukkit',
  purpur: 'Purpur',
  folia: 'Folia'
}

/** Un fichier d'une version publiée (content.json). */
export interface ContentFile {
  name: string
  size: number
  sha256: string
  sha1: string
  loaders: ContentLoader[]
  minecraftVersions: string[]
}

/** Contenu de l'asset `content.json` joint à chaque release d'un contenu qui n'est pas un modpack. */
export interface ContentManifest {
  schema: 1
  type: ContentKind
  id: string
  name: string
  /** Version déclarée par le fichier (`1.2.0-26.3`) ou numéro donné par le Studio. */
  version: string
  description: string
  minecraftVersions: string[]
  loaders: ContentLoader[]
  files: ContentFile[]
  cover: string | null
  coverSha256: string | null
  /** Propriétaire du dépôt. */
  author: string
  createdAt: string
}

export interface ContentKindInfo {
  /** Nom au singulier, en minuscules (« pack de ressources »). */
  label: string
  plural: string
  /** Début du tag de ses releases : `<préfixe><id>-v<version>`. */
  tagPrefix: string
  /** Fichier de description joint à chaque release. */
  manifest: string
  /** `number` : versions numérotées v1, v2… par le Studio ; `declared` : numéro donné par le fichier (1.2.0). */
  versioning: 'number' | 'declared'
  /** Le Studio sait déjà en lire et en publier les versions. */
  supported: boolean
  /** Extension de ses fichiers. */
  extension: '.zip' | '.jar'
  /** Type de projet Modrinth (et chemin de sa page : modrinth.com/<type>/<slug>), si Modrinth le publie. */
  modrinth: 'modpack' | 'mod' | 'resourcepack' | 'shader' | 'plugin'
}

export const CONTENT_KINDS: Record<ContentKind, ContentKindInfo> = {
  modpack: { label: 'modpack', plural: 'modpacks', tagPrefix: MODPACK_TAG_PREFIX, manifest: MODPACK_MANIFEST_ASSET, versioning: 'number', supported: true, extension: '.zip', modrinth: 'modpack' },
  mod: { label: 'mod', plural: 'mods', tagPrefix: 'mod-', manifest: CONTENT_MANIFEST_ASSET, versioning: 'declared', supported: true, extension: '.jar', modrinth: 'mod' },
  resourcepack: {
    label: 'pack de ressources',
    plural: 'packs de ressources',
    tagPrefix: 'rp-',
    manifest: CONTENT_MANIFEST_ASSET,
    versioning: 'number',
    supported: true,
    extension: '.zip',
    modrinth: 'resourcepack'
  },
  shader: { label: 'shader', plural: 'shaders', tagPrefix: 'shader-', manifest: CONTENT_MANIFEST_ASSET, versioning: 'number', supported: true, extension: '.zip', modrinth: 'shader' },
  plugin: { label: 'plugin', plural: 'plugins', tagPrefix: 'plugin-', manifest: CONTENT_MANIFEST_ASSET, versioning: 'declared', supported: true, extension: '.jar', modrinth: 'plugin' }
}

export const CONTENT_KIND_IDS = Object.keys(CONTENT_KINDS) as ContentKind[]

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === 'string' && Object.hasOwn(CONTENT_KINDS, value)
}

export function contentTag(kind: ContentKind, id: string, version: string): string {
  return `${CONTENT_KINDS[kind].tagPrefix}${id}-v${version}`
}

const TAG_REST = /^(.+)-v(\d[\w.+-]*)$/

/** Classe CurseForge du projet de chaque type (mods 6, packs de ressources 12, shaders 6552, modpacks 4471). */
export const CURSEFORGE_CLASSES: Partial<Record<ContentKind, number>> = { modpack: 4471, mod: 6, resourcepack: 12, shader: 6552 }

export function isContentManifest(value: unknown): value is ContentManifest {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  return m.schema === 1 && isContentKind(m.type) && typeof m.id === 'string' && typeof m.version === 'string' && Array.isArray(m.files)
}

/** Type, identifiant et version d'un tag de release, ou null pour un tag d'un autre usage (`app-v…`, inconnu). */
export function parseContentTag(tag: string): { kind: ContentKind; id: string; version: string } | null {
  for (const kind of CONTENT_KIND_IDS) {
    const prefix = CONTENT_KINDS[kind].tagPrefix
    if (!tag.startsWith(prefix)) continue
    const match = TAG_REST.exec(tag.slice(prefix.length))
    return match ? { kind, id: match[1], version: match[2] } : null
  }
  return null
}
