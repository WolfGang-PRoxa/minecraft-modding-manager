// Types de contenu que le Studio range et publie. Chacun a son préfixe de tag et son fichier de description dans les
// releases GitHub. Jamais `pack-` ni `modpack.json` pour un autre type que le modpack : les applications installées
// (jusqu'à la 1.9.3) affichent comme modpack toute release qui porte l'un ou l'autre.
import { CONTENT_MANIFEST_ASSET, MODPACK_MANIFEST_ASSET, MODPACK_TAG_PREFIX } from './config'

export type ContentKind = 'modpack' | 'mod' | 'resourcepack' | 'shader' | 'plugin'

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
}

export const CONTENT_KINDS: Record<ContentKind, ContentKindInfo> = {
  modpack: { label: 'modpack', plural: 'modpacks', tagPrefix: MODPACK_TAG_PREFIX, manifest: MODPACK_MANIFEST_ASSET, versioning: 'number', supported: true },
  mod: { label: 'mod', plural: 'mods', tagPrefix: 'mod-', manifest: CONTENT_MANIFEST_ASSET, versioning: 'declared', supported: false },
  resourcepack: {
    label: 'pack de ressources',
    plural: 'packs de ressources',
    tagPrefix: 'rp-',
    manifest: CONTENT_MANIFEST_ASSET,
    versioning: 'number',
    supported: false
  },
  shader: { label: 'shader', plural: 'shaders', tagPrefix: 'shader-', manifest: CONTENT_MANIFEST_ASSET, versioning: 'number', supported: false },
  plugin: { label: 'plugin', plural: 'plugins', tagPrefix: 'plugin-', manifest: CONTENT_MANIFEST_ASSET, versioning: 'declared', supported: false }
}

export const CONTENT_KIND_IDS = Object.keys(CONTENT_KINDS) as ContentKind[]

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === 'string' && Object.hasOwn(CONTENT_KINDS, value)
}

export function contentTag(kind: ContentKind, id: string, version: string): string {
  return `${CONTENT_KINDS[kind].tagPrefix}${id}-v${version}`
}

const TAG_REST = /^(.+)-v(\d[\w.+-]*)$/

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
