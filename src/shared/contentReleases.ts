// Les mods, packs de ressources et shaders publiés par le Studio, tels que la Bibliothèque les lit : une release
// `mod-` / `rp-` / `shader-` avec son content.json. Sans content.json lisible, la release est ignorée (rien ne
// permettrait de vérifier ses fichiers).
import { CONTENT_KINDS, isContentManifest, parseContentTag, type ContentManifest } from './content'
import { compareVersions, type GhRelease } from './releases'
import type { ContentItem, ContentRelease } from './types'

/** Une release d'un contenu pris en charge, avec son content.json ; null sinon. */
export function contentReleaseFrom(release: GhRelease, manifest: unknown): ContentRelease | null {
  if (release.draft) return null
  const parsed = parseContentTag(release.tag_name)
  if (!parsed || parsed.kind === 'modpack' || !CONTENT_KINDS[parsed.kind].supported) return null
  if (!isContentManifest(manifest)) return null
  const m: ContentManifest = manifest
  if (m.type !== parsed.kind || m.id !== parsed.id || m.version !== parsed.version) return null
  const files = m.files.flatMap((file) => {
    const asset = release.assets.find((a) => a.name === file.name)
    // Une empreinte est obligatoire : le fichier téléchargé lui est comparé.
    if (!asset || !/^[0-9a-f]{64}$/i.test(file.sha256)) return []
    return [{ name: file.name, url: asset.browser_download_url, size: asset.size, sha256: file.sha256.toLowerCase(), loaders: file.loaders, minecraftVersions: file.minecraftVersions }]
  })
  if (!files.length) return null
  const cover = m.cover ? release.assets.find((a) => a.name === m.cover) : undefined
  return {
    kind: parsed.kind,
    id: m.id,
    name: m.name || m.id,
    description: m.description ?? '',
    version: m.version,
    tag: release.tag_name,
    notes: release.body ?? '',
    publishedAt: release.published_at ?? release.created_at,
    minecraftVersions: m.minecraftVersions ?? [],
    loaders: m.loaders ?? [],
    files,
    coverUrl: cover?.browser_download_url ?? null,
    releaseUrl: release.html_url
  }
}

/** Regroupe les versions par contenu : la plus récente d'abord, et les contenus du plus récemment publié au plus ancien. */
export function groupContents(releases: ContentRelease[]): ContentItem[] {
  const byKey = new Map<string, ContentRelease[]>()
  for (const release of releases) {
    const key = `${release.kind}:${release.id}`
    byKey.set(key, [...(byKey.get(key) ?? []), release])
  }
  const items = [...byKey.values()].map((versions) => {
    versions.sort((a, b) => compareVersions(b.version, a.version) || b.publishedAt.localeCompare(a.publishedAt))
    return { kind: versions[0].kind, id: versions[0].id, latest: versions[0], versions }
  })
  return items.sort((a, b) => b.latest.publishedAt.localeCompare(a.latest.publishedAt))
}

/** Chargeur d'un profil (« fabric-0.19.5-26.3 », « neoforge-21.1.215 ») : fabric, quilt, forge, neoforge. */
export function profileLoader(modLoader: string | null): string | null {
  return /^(neoforge|forge|fabric|quilt)/i.exec(modLoader ?? '')?.[1].toLowerCase() ?? null
}

/**
 * Ce qui empêche ce fichier d'aller dans un profil de cette version de Minecraft et de ce chargeur, ou null.
 * Un fichier qui ne cite aucune version de Minecraft est accepté (le publieur ne l'a pas précisé).
 */
export function incompatibility(
  kind: ContentRelease['kind'],
  file: Pick<ContentRelease['files'][number], 'loaders' | 'minecraftVersions'>,
  profile: { minecraftVersion: string | null; modLoader: string | null }
): string | null {
  if (profile.minecraftVersion && file.minecraftVersions.length && !file.minecraftVersions.includes(profile.minecraftVersion)) {
    return `fait pour Minecraft ${file.minecraftVersions.join(', ')}, pas ${profile.minecraftVersion}`
  }
  if (kind !== 'mod') return null
  const loader = profileLoader(profile.modLoader)
  if (!loader) return 'profil sans chargeur de mods'
  // Quilt charge aussi les mods Fabric.
  const accepted = loader === 'quilt' ? ['quilt', 'fabric'] : [loader]
  if (!file.loaders.some((l) => accepted.includes(l))) return `fait pour ${file.loaders.join(', ') || 'un autre chargeur'}, pas ${loader}`
  return null
}
