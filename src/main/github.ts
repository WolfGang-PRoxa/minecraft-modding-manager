import { app } from 'electron'
import { join } from 'node:path'
import { APP_REPO, APP_TAG_PREFIX, CONTENT_MANIFEST_ASSET } from '../shared/config'
import { isContentManifest, parseContentTag, type ContentManifest } from '../shared/content'
import { contentReleaseFrom, groupContents } from '../shared/contentReleases'
import {
  compareVersions,
  findManifestAsset,
  groupModpacks,
  isModpackManifest,
  modpackVersionFromRelease,
  sha256FromDigest,
  type GhAsset,
  type GhRelease
} from '../shared/releases'
import { repoSlug } from '../shared/repo'
import type { AppUpdateInfo, Catalog, ContentRelease, ModpackManifest, ModpackVersion, RepoRef } from '../shared/types'
import { readJson, writeJsonAtomic } from '../core/fsutil'
import { repoApiBase } from '../core/githubEnv'
import { getSettings } from '../core/settings'

const MAX_PAGES = 5
const MEMORY_TTL_MS = 60_000

interface HttpCacheEntry {
  etag: string
  data: unknown
}

type HttpCache = Record<string, HttpCacheEntry>
/** modpack.json et content.json déjà lus, par « id:date » de l'asset. */
type ManifestCache = Record<string, unknown>

let httpCache: HttpCache | null = null
let manifestCache: ManifestCache | null = null
let lastCatalog: { at: number; base: string; catalog: Catalog } | null = null

const cacheFile = (name: string) => join(app.getPath('userData'), 'cache', name)

function userAgent(): string {
  return `ModpackManager/${app.getVersion()}`
}

async function loadCaches(): Promise<void> {
  httpCache ??= (await readJson<HttpCache>(cacheFile('github-http.json'))) ?? {}
  manifestCache ??= (await readJson<ManifestCache>(cacheFile('manifests.json'))) ?? {}
}

class GitHubError extends Error {}

/**
 * GET sur l'API GitHub avec cache ETag. Sans connexion, GitHub décompte aussi les réponses 304 du quota
 * (60 requêtes par heure et par adresse IP) : les vérifications automatiques restent donc espacées.
 */
async function apiGet<T>(url: string, repo: RepoRef): Promise<T> {
  const cached = httpCache![url]
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': userAgent()
  }
  if (cached) headers['If-None-Match'] = cached.etag

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) })
  if (res.status === 304 && cached) return cached.data as T
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    const when = reset
      ? new Date(reset * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : 'plus tard'
    throw new GitHubError(`Limite de requêtes GitHub atteinte. Réessaie après ${when}.`)
  }
  if (res.status === 404) {
    throw new GitHubError(`Dépôt ${repoSlug(repo)} introuvable (il doit être public).`)
  }
  if (!res.ok) throw new GitHubError(`GitHub a répondu ${res.status} ${res.statusText}.`)

  const data = (await res.json()) as T
  const etag = res.headers.get('etag')
  if (etag) httpCache![url] = { etag, data }
  return data
}

async function fetchReleases(repo: RepoRef): Promise<GhRelease[]> {
  const releases: GhRelease[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await apiGet<GhRelease[]>(`${repoApiBase(repo)}/releases?per_page=100&page=${page}`, repo)
    releases.push(...batch)
    if (batch.length < 100) break
  }
  return releases
}

/** Releases disponibles dans le cache disque (utilisé hors ligne). */
function cachedReleases(repo: RepoRef): GhRelease[] {
  const releases: GhRelease[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const entry = httpCache![`${repoApiBase(repo)}/releases?per_page=100&page=${page}`]
    if (!entry) break
    const batch = entry.data as GhRelease[]
    releases.push(...batch)
    if (batch.length < 100) break
  }
  return releases
}

async function fetchManifest<T>(asset: GhAsset, offline: boolean, valid: (json: unknown) => json is T): Promise<T | null> {
  const key = `${asset.id}:${asset.updated_at}`
  const known = manifestCache![key]
  if (known !== undefined) return valid(known) ? known : null
  if (offline) return null
  try {
    // L'URL de téléchargement public ne consomme pas le quota de l'API.
    const res = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': userAgent() },
      signal: AbortSignal.timeout(20_000)
    })
    if (!res.ok) return null
    const json: unknown = await res.json()
    if (!valid(json)) return null
    manifestCache![key] = json
    return json
  } catch {
    return null
  }
}

async function buildModpackVersions(releases: GhRelease[], offline: boolean): Promise<ModpackVersion[]> {
  const versions = await Promise.all(
    releases.map(async (release) => {
      if (release.draft || release.tag_name.startsWith(APP_TAG_PREFIX)) return null
      const asset = findManifestAsset(release)
      const manifest = asset ? await fetchManifest<ModpackManifest>(asset, offline, isModpackManifest) : null
      if (asset && !manifest) return null
      return modpackVersionFromRelease(release, manifest)
    })
  )
  return versions.filter((v): v is ModpackVersion => v !== null)
}

/** Mods, packs de ressources et shaders du dépôt (releases avec content.json). */
async function buildContentReleases(releases: GhRelease[], offline: boolean): Promise<ContentRelease[]> {
  const found = await Promise.all(
    releases.map(async (release) => {
      const parsed = parseContentTag(release.tag_name)
      if (release.draft || !parsed || parsed.kind === 'modpack') return null
      const asset = release.assets.find((a) => a.name === CONTENT_MANIFEST_ASSET)
      const manifest = asset ? await fetchManifest<ContentManifest>(asset, offline, isContentManifest) : null
      return manifest ? contentReleaseFrom(release, manifest) : null
    })
  )
  return found.filter((r): r is ContentRelease => r !== null)
}

/** Version la plus récente de l'application, si elle est plus récente que celle qui tourne. */
function findAppUpdate(releases: GhRelease[]): AppUpdateInfo | null {
  const stable = releases.filter(
    (release) => !release.draft && !release.prerelease && release.tag_name.startsWith(APP_TAG_PREFIX)
  )
  const versionOf = (release: GhRelease) => release.tag_name.slice(APP_TAG_PREFIX.length)
  let best: { release: GhRelease; version: string; installer: GhAsset } | null = null
  for (const release of stable) {
    // Une release dont l'installeur n'est pas (encore) en ligne n'est pas proposée : il n'y aurait rien à installer.
    const installer = release.assets.find(
      (a) => a.name.toLowerCase().endsWith('.exe') && (a.state ?? 'uploaded') === 'uploaded'
    )
    if (!installer) continue
    const version = versionOf(release)
    if (!best || compareVersions(version, best.version) > 0) best = { release, version, installer }
  }
  if (!best || compareVersions(best.version, app.getVersion()) <= 0) return null
  const offered = best.version
  // Ce que la mise à jour apporte : les notes de chaque version entre celle qui tourne et celle proposée.
  const newer = stable
    .filter((release) => {
      const version = versionOf(release)
      return compareVersions(version, app.getVersion()) > 0 && compareVersions(version, offered) <= 0
    })
    .sort((a, b) => compareVersions(versionOf(b), versionOf(a)))
  return {
    version: offered,
    releases: newer.map((release) => ({
      version: versionOf(release),
      publishedAt: release.published_at ?? release.created_at,
      notes: release.body ?? '',
      url: release.html_url
    })),
    releaseUrl: best.release.html_url,
    installerUrl: best.installer.browser_download_url,
    installerSize: best.installer.size,
    installerSha256: sha256FromDigest(best.installer.digest)
  }
}

export async function getCatalog(force = false): Promise<Catalog> {
  const { repo } = await getSettings()
  const base = repoApiBase(repo)
  if (!force && lastCatalog?.base === base && Date.now() - lastCatalog.at < MEMORY_TTL_MS) return lastCatalog.catalog
  await loadCaches()

  let releases: GhRelease[]
  let error: string | null = null
  let offline = false
  try {
    releases = await fetchReleases(repo)
  } catch (err) {
    offline = true
    error =
      err instanceof GitHubError
        ? err.message
        : 'Impossible de joindre GitHub. Vérifie ta connexion internet.'
    releases = cachedReleases(repo)
  }

  // Les mises à jour de l'application viennent toujours de son propre dépôt.
  let appReleases = releases
  if (repoApiBase(APP_REPO) !== base) {
    appReleases = await fetchReleases(APP_REPO).catch(() => cachedReleases(APP_REPO))
  }

  const catalog: Catalog = {
    repo,
    modpacks: groupModpacks(await buildModpackVersions(releases, offline)),
    contents: groupContents(await buildContentReleases(releases, offline)),
    appUpdate: findAppUpdate(appReleases),
    fetchedAt: offline ? null : new Date().toISOString(),
    error
  }

  if (!offline) {
    lastCatalog = { at: Date.now(), base, catalog }
    await Promise.all([
      writeJsonAtomic(cacheFile('github-http.json'), httpCache),
      writeJsonAtomic(cacheFile('manifests.json'), manifestCache)
    ]).catch(() => {})
  }
  return catalog
}
