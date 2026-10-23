import { MODPACK_MANIFEST_ASSET } from './config'
import { contentTag, parseContentTag } from './content'
import type { Modpack, ModpackManifest, ModpackVersion } from './types'

/** Sous-ensemble de la réponse de l'API GitHub pour une release. */
export interface GhAsset {
  id: number
  name: string
  size: number
  browser_download_url: string
  updated_at: string
  /** Empreinte calculée par GitHub (`sha256:<hex>`), absente des fichiers les plus anciens. */
  digest?: string | null
  /** `uploaded` une fois le fichier entièrement envoyé. */
  state?: string
}

export interface GhRelease {
  id: number
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  published_at: string | null
  created_at: string
  html_url: string
  upload_url: string
  assets: GhAsset[]
}

/** Empreinte SHA-256 en hexadécimal tirée du `digest` d'un fichier de release, ou null. */
export function sha256FromDigest(digest: string | null | undefined): string | null {
  const match = /^sha256:([0-9a-f]{64})$/i.exec(digest ?? '')
  return match ? match[1].toLowerCase() : null
}

export function modpackTag(id: string, version: string): string {
  return contentTag('modpack', id, version)
}

export function parseModpackTag(tag: string): { id: string; version: string } | null {
  const parsed = parseContentTag(tag)
  return parsed?.kind === 'modpack' ? { id: parsed.id, version: parsed.version } : null
}

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'modpack'
  )
}

export function isValidModpackId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id)
}

/**
 * Compare deux versions « à la semver » sans en exiger le format strict :
 * les segments numériques sont comparés comme des nombres, le reste comme du texte.
 */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => v.replace(/^v/i, '').split(/[.+-]/)
  const pa = split(a)
  const pb = split(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i]
    const y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = Number(x)
    const ny = Number(y)
    const diff =
      Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y, 'en', { numeric: true })
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

export function isModpackManifest(value: unknown): value is ModpackManifest {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  return (
    m.schema === 1 &&
    typeof m.id === 'string' &&
    isValidModpackId(m.id) &&
    typeof m.name === 'string' &&
    typeof m.version === 'string' &&
    typeof m.archive === 'string'
  )
}

export function findManifestAsset(release: GhRelease): GhAsset | undefined {
  return release.assets.find((a) => a.name === MODPACK_MANIFEST_ASSET)
}

/**
 * Transforme une release GitHub en version de modpack.
 * Une release sans `modpack.json` est tout de même acceptée si son tag suit la
 * convention `pack-<id>-v<version>` et qu'elle contient un zip.
 */
export function modpackVersionFromRelease(
  release: GhRelease,
  manifest: ModpackManifest | null
): ModpackVersion | null {
  if (release.draft) return null
  const zips = release.assets.filter((a) => a.name.toLowerCase().endsWith('.zip'))
  const archive = (manifest && zips.find((a) => a.name === manifest.archive)) || zips[0]
  if (!archive) return null

  const fromTag = parseModpackTag(release.tag_name)
  if (!manifest && !fromTag) return null
  const id = manifest?.id ?? fromTag!.id
  if (!isValidModpackId(id)) return null
  const version = manifest?.version ?? fromTag!.version

  const cover = manifest?.cover
    ? release.assets.find((a) => a.name === manifest.cover)
    : release.assets.find((a) => /^cover\.(png|jpe?g|webp|gif)$/i.test(a.name))

  const releaseName = release.name?.trim()
  const fallbackName = releaseName ? releaseName.replace(new RegExp(`\\s*v?${escapeRegExp(version)}$`), '') : id

  return {
    id,
    name: manifest?.name || fallbackName || id,
    version,
    minecraftVersion: manifest?.minecraftVersion ?? null,
    modLoader: manifest?.modLoader ?? null,
    modCount: manifest?.modCount ?? null,
    description: manifest?.description ?? '',
    tag: release.tag_name,
    notes: release.body ?? '',
    prerelease: release.prerelease,
    publishedAt: release.published_at ?? release.created_at,
    archiveUrl: archive.browser_download_url,
    archiveSize: archive.size,
    // Sans modpack.json (ou s'il n'en donne pas), l'empreinte que GitHub calcule pour le zip.
    archiveSha256: manifest?.archiveSha256 ?? sha256FromDigest(archive.digest),
    modsSignature: typeof manifest?.modsSignature === 'string' ? manifest.modsSignature : null,
    disabledMods: Array.isArray(manifest?.disabledMods)
      ? manifest.disabledMods.filter((file): file is string => typeof file === 'string' && file.length > 0)
      : [],
    keepPlayerConfigs: manifest?.keepPlayerConfigs === true,
    coverUrl: cover?.browser_download_url ?? null,
    releaseUrl: release.html_url
  }
}

/** Regroupe les versions par modpack, le plus récemment publié en premier. */
export function groupModpacks(versions: ModpackVersion[]): Modpack[] {
  const byId = new Map<string, ModpackVersion[]>()
  for (const v of versions) {
    const list = byId.get(v.id) ?? []
    list.push(v)
    byId.set(v.id, list)
  }
  const modpacks: Modpack[] = []
  for (const [id, list] of byId) {
    list.sort((a, b) => compareVersions(b.version, a.version) || b.publishedAt.localeCompare(a.publishedAt))
    const latest = list.find((v) => !v.prerelease) ?? list[0]
    modpacks.push({ id, latest, versions: list })
  }
  modpacks.sort((a, b) => b.latest.publishedAt.localeCompare(a.latest.publishedAt))
  return modpacks
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
