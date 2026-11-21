import { app } from 'electron';
import { join } from 'node:path';
import { APP_REPO, APP_TAG_PREFIX, CONTENT_MANIFEST_ASSET } from '../shared/config';
import { isContentManifest, parseContentTag, type ContentManifest } from '../shared/content';
import { contentReleaseFrom, groupContents } from '../shared/contentReleases';
import {
  compareVersions,
  findManifestAsset,
  groupModpacks,
  isModpackManifest,
  modpackVersionFromRelease,
  sha256FromDigest,
  type GhAsset,
  type GhRelease,
} from '../shared/releases';
import { repoSlug } from '../shared/repo';
import type { AppUpdateInfo, Catalog, ContentRelease, ModpackManifest, ModpackVersion, RepoRef } from '../shared/types';
import { feedSignature, hasIncompleteRelease } from '../shared/autoUpdate';
import { readJson, writeJsonAtomic } from '../core/fsutil';
import { hasGitHubApiOverride, repoApiBase } from '../core/githubEnv';
import { getSettings } from '../core/settings';

const MAX_PAGES = 5;
const MEMORY_TTL_MS = 60_000;
/** Même si le flux des releases ne change pas, l'API est relue de temps en temps (fichiers remplacés, notes modifiées). */
const FULL_REFRESH_MS = 30 * 60_000;
/** Flux illisible : l'API est relue, mais pas plus souvent, pour ne pas épuiser le quota. */
const FEED_FALLBACK_MS = 5 * 60_000;

interface HttpCacheEntry {
  etag: string;
  data: unknown;
}

type HttpCache = Record<string, HttpCacheEntry>;
/** modpack.json et content.json déjà lus, par « id:date » de l'asset. */
type ManifestCache = Record<string, unknown>;

let httpCache: HttpCache | null = null;
let manifestCache: ManifestCache | null = null;
let lastCatalog: { at: number; base: string; catalog: Catalog } | null = null;

const cacheFile = (name: string) => join(app.getPath('userData'), 'cache', name);

function userAgent(): string {
  return `ModpackManager/${app.getVersion()}`;
}

async function loadCaches(): Promise<void> {
  httpCache ??= (await readJson<HttpCache>(cacheFile('github-http.json'))) ?? {};
  manifestCache ??= (await readJson<ManifestCache>(cacheFile('manifests.json'))) ?? {};
}

class GitHubError extends Error {}

/**
 * GET sur l'API GitHub avec cache ETag. Sans connexion, GitHub décompte aussi les réponses 304 du quota
 * (60 requêtes par heure et par adresse IP) : les vérifications automatiques restent donc espacées.
 */
async function apiGet<T>(url: string, repo: RepoRef): Promise<T> {
  const cached = httpCache![url];
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': userAgent(),
  };
  if (cached) headers['If-None-Match'] = cached.etag;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (res.status === 304 && cached) return cached.data as T;
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const when = reset
      ? new Date(reset * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : 'plus tard';
    throw new GitHubError(`Limite de requêtes GitHub atteinte. Réessaie après ${when}.`);
  }
  if (res.status === 404) {
    throw new GitHubError(`Dépôt ${repoSlug(repo)} introuvable (il doit être public).`);
  }
  if (!res.ok) throw new GitHubError(`GitHub a répondu ${res.status} ${res.statusText}.`);

  const data = (await res.json()) as T;
  const etag = res.headers.get('etag');
  if (etag) httpCache![url] = { etag, data };
  return data;
}

async function fetchReleases(repo: RepoRef): Promise<GhRelease[]> {
  const releases: GhRelease[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await apiGet<GhRelease[]>(`${repoApiBase(repo)}/releases?per_page=100&page=${page}`, repo);
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  return releases;
}

/** Releases disponibles dans le cache disque (utilisé hors ligne). */
function cachedReleases(repo: RepoRef): GhRelease[] {
  const releases: GhRelease[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const entry = httpCache![`${repoApiBase(repo)}/releases?per_page=100&page=${page}`];
    if (!entry) break;
    const batch = entry.data as GhRelease[];
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  return releases;
}

async function fetchManifest<T>(
  asset: GhAsset,
  offline: boolean,
  valid: (json: unknown) => json is T,
): Promise<T | null> {
  const key = `${asset.id}:${asset.updated_at}`;
  const known = manifestCache![key];
  if (known !== undefined) return valid(known) ? known : null;
  if (offline) return null;
  try {
    // L'URL de téléchargement public ne consomme pas le quota de l'API.
    const res = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': userAgent() },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!valid(json)) return null;
    manifestCache![key] = json;
    return json;
  } catch {
    return null;
  }
}

async function buildModpackVersions(releases: GhRelease[], offline: boolean): Promise<ModpackVersion[]> {
  const versions = await Promise.all(
    releases.map(async (release) => {
      if (release.draft || release.tag_name.startsWith(APP_TAG_PREFIX)) return null;
      const asset = findManifestAsset(release);
      const manifest = asset ? await fetchManifest<ModpackManifest>(asset, offline, isModpackManifest) : null;
      if (asset && !manifest) return null;
      return modpackVersionFromRelease(release, manifest);
    }),
  );
  return versions.filter((v): v is ModpackVersion => v !== null);
}

/** Mods, packs de ressources et shaders du dépôt (releases avec content.json). */
async function buildContentReleases(releases: GhRelease[], offline: boolean): Promise<ContentRelease[]> {
  const found = await Promise.all(
    releases.map(async (release) => {
      const parsed = parseContentTag(release.tag_name);
      if (release.draft || !parsed || parsed.kind === 'modpack') return null;
      const asset = release.assets.find((a) => a.name === CONTENT_MANIFEST_ASSET);
      const manifest = asset ? await fetchManifest<ContentManifest>(asset, offline, isContentManifest) : null;
      return manifest ? contentReleaseFrom(release, manifest) : null;
    }),
  );
  return found.filter((r): r is ContentRelease => r !== null);
}

/** Version la plus récente de l'application, si elle est plus récente que celle qui tourne. */
function findAppUpdate(releases: GhRelease[]): AppUpdateInfo | null {
  const stable = releases.filter(
    (release) => !release.draft && !release.prerelease && release.tag_name.startsWith(APP_TAG_PREFIX),
  );
  const versionOf = (release: GhRelease) => release.tag_name.slice(APP_TAG_PREFIX.length);
  const uploaded = (asset: GhAsset) => (asset.state ?? 'uploaded') === 'uploaded';
  const installerOf = (release: GhRelease) =>
    release.assets.find((a) => a.name.toLowerCase().endsWith('.exe') && uploaded(a));
  const blockmapOf = (release: GhRelease, installer: GhAsset) =>
    release.assets.find((a) => a.name === `${installer.name}.blockmap` && uploaded(a));
  let best: { release: GhRelease; version: string; installer: GhAsset } | null = null;
  for (const release of stable) {
    // Une release dont l'installeur n'est pas (encore) en ligne n'est pas proposée : il n'y aurait rien à installer.
    const installer = installerOf(release);
    if (!installer) continue;
    const version = versionOf(release);
    if (!best || compareVersions(version, best.version) > 0) best = { release, version, installer };
  }
  if (!best || compareVersions(best.version, app.getVersion()) <= 0) return null;
  const offered = best.version;
  // Ce que la mise à jour apporte : les notes de chaque version entre celle qui tourne et celle proposée.
  const newer = stable
    .filter((release) => {
      const version = versionOf(release);
      return compareVersions(version, app.getVersion()) > 0 && compareVersions(version, offered) <= 0;
    })
    .sort((a, b) => compareVersions(versionOf(b), versionOf(a)));
  return {
    version: offered,
    releases: newer.map((release) => ({
      version: versionOf(release),
      publishedAt: release.published_at ?? release.created_at,
      notes: release.body ?? '',
      url: release.html_url,
    })),
    releaseUrl: best.release.html_url,
    installerUrl: best.installer.browser_download_url,
    installerSize: best.installer.size,
    installerSha256: sha256FromDigest(best.installer.digest),
    differential: differentialOf(best.release, best.installer),
  };

  // Les blockmaps de la nouvelle release et de celle de la version qui tourne : seuls les blocs changés seront
  // téléchargés, le reste recopié depuis l'installeur de cette version, s'il a été gardé (appUpdate.ts).
  function differentialOf(release: GhRelease, installer: GhAsset): AppUpdateInfo['differential'] {
    const blockmap = blockmapOf(release, installer);
    const current = stable.find((candidate) => versionOf(candidate) === app.getVersion());
    const baseInstaller = current && installerOf(current);
    const baseBlockmap = current && baseInstaller && blockmapOf(current, baseInstaller);
    const baseSha256 = baseInstaller && sha256FromDigest(baseInstaller.digest);
    if (!blockmap || !baseBlockmap || !baseSha256) return null;
    return {
      blockmapUrl: blockmap.browser_download_url,
      baseVersion: app.getVersion(),
      baseSha256,
      baseBlockmapUrl: baseBlockmap.browser_download_url,
    };
  }
}

/**
 * Surveillance d'un dépôt. Sans compte, chaque lecture de l'API compte dans le quota de GitHub (60 par heure et par
 * adresse IP, réponses 304 comprises) : une vérification toutes les minutes l'épuiserait. Le flux Atom des releases
 * (`github.com/<compte>/<dépôt>/releases.atom`), lui, n'en fait pas partie : il est lu à chaque vérification, et l'API
 * seulement quand il a changé, quand une release récente attend encore des fichiers (installeur que la CI ajoute
 * après coup), ou toutes les 30 minutes.
 */
interface RepoWatch {
  /** Empreinte du flux à la dernière lecture réussie de l'API. */
  seen: string | null;
  /** Dernier flux reçu, et son ETag. */
  feed: string | null;
  etag: string | null;
  /** Dernière lecture réussie de l'API, ou 0. */
  apiAt: number;
  /** Une release récente attendait encore des fichiers à cette lecture. */
  incomplete: boolean;
}

const watches = new Map<string, RepoWatch>();

function watchOf(repo: RepoRef): RepoWatch {
  const key = repoApiBase(repo);
  let watch = watches.get(key);
  if (!watch) watches.set(key, (watch = { seen: null, feed: null, etag: null, apiAt: 0, incomplete: false }));
  return watch;
}

/** Empreinte du flux des releases, ou null s'il n'a pas pu être lu. */
async function readFeed(repo: RepoRef, watch: RepoWatch): Promise<string | null> {
  try {
    const headers: Record<string, string> = { Accept: 'application/atom+xml', 'User-Agent': userAgent() };
    if (watch.etag && watch.feed !== null) headers['If-None-Match'] = watch.etag;
    const res = await fetch(`https://github.com/${repo.owner}/${repo.name}/releases.atom`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 304 && watch.feed !== null) return watch.feed;
    if (!res.ok) return null;
    const signature = feedSignature(await res.text());
    if (signature === null) return null;
    watch.feed = signature;
    watch.etag = res.headers.get('etag');
    return signature;
  } catch {
    return null;
  }
}

/** Comment lire les releases d'un dépôt : l'API tout de suite, selon le flux, ou le cache seulement. */
type ReadMode = 'api' | 'watch' | 'cache';

const MODE_RANK: Record<ReadMode, number> = { cache: 0, watch: 1, api: 2 };

async function readReleases(repo: RepoRef, mode: ReadMode): Promise<{ releases: GhRelease[]; error: string | null }> {
  const watch = watchOf(repo);
  const cachedFirstPage = httpCache![`${repoApiBase(repo)}/releases?per_page=100&page=1`];
  if (mode === 'cache' && cachedFirstPage) return { releases: cachedReleases(repo), error: null };
  let signature: string | null = null;
  if (mode === 'watch' && cachedFirstPage && !hasGitHubApiOverride()) {
    signature = await readFeed(repo, watch);
    const now = Date.now();
    const due =
      signature === null
        ? now - watch.apiAt >= FEED_FALLBACK_MS
        : signature !== watch.seen || watch.incomplete || now - watch.apiAt >= FULL_REFRESH_MS;
    if (!due) return { releases: cachedReleases(repo), error: null };
  }
  try {
    const releases = await fetchReleases(repo);
    watch.apiAt = Date.now();
    watch.incomplete = hasIncompleteRelease(releases, APP_TAG_PREFIX, watch.apiAt);
    // Lu juste avant l'API : le flux ne peut pas annoncer une release que cette lecture n'aurait pas vue.
    watch.seen = signature ?? (await readFeed(repo, watch).catch(() => null)) ?? watch.seen;
    return { releases, error: null };
  } catch (err) {
    const error =
      err instanceof GitHubError ? err.message : 'Impossible de joindre GitHub. Vérifie ta connexion internet.';
    return { releases: cachedReleases(repo), error };
  }
}

/** Ce qu'une vérification automatique relit : le dépôt des modpacks, celui de l'application. */
export interface CatalogCheck {
  packs: boolean;
  app: boolean;
}

/**
 * Le catalogue : modpacks et contenus du dépôt suivi, mise à jour de l'application.
 *  - `force` (bouton Actualiser, recherche d'une mise à jour) : l'API est relue tout de suite ;
 *  - `check` (vérifications automatiques) : seuls les dépôts demandés sont surveillés, les autres viennent du cache ;
 *  - sinon : le catalogue de la dernière minute, ou les deux dépôts surveillés.
 */
export async function getCatalog(force = false, check?: CatalogCheck): Promise<Catalog> {
  const { repo } = await getSettings();
  const base = repoApiBase(repo);
  if (!force && !check && lastCatalog?.base === base && Date.now() - lastCatalog.at < MEMORY_TTL_MS)
    return lastCatalog.catalog;
  await loadCaches();

  const packMode: ReadMode = force ? 'api' : check && !check.packs ? 'cache' : 'watch';
  const appMode: ReadMode = force ? 'api' : check && !check.app ? 'cache' : 'watch';
  // Les mises à jour de l'application viennent toujours de son propre dépôt (souvent le même que celui des modpacks).
  const sameRepo = repoApiBase(APP_REPO) === base;
  const { releases, error } = await readReleases(
    repo,
    sameRepo && MODE_RANK[appMode] > MODE_RANK[packMode] ? appMode : packMode,
  );
  const offline = error !== null;
  const appReleases = sameRepo ? releases : (await readReleases(APP_REPO, appMode)).releases;

  const catalog: Catalog = {
    repo,
    modpacks: groupModpacks(await buildModpackVersions(releases, offline)),
    contents: groupContents(await buildContentReleases(releases, offline)),
    appUpdate: findAppUpdate(appReleases),
    fetchedAt: offline ? null : new Date().toISOString(),
    error,
  };

  if (!offline) {
    lastCatalog = { at: Date.now(), base, catalog };
    await Promise.all([
      writeJsonAtomic(cacheFile('github-http.json'), httpCache),
      writeJsonAtomic(cacheFile('manifests.json'), manifestCache),
    ]).catch(() => {});
  }
  return catalog;
}
