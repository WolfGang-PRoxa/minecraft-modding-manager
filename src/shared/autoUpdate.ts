// Vérifications automatiques : intervalles réglables (modpacks, application), modpacks à mettre à jour d'eux-mêmes,
// et repérage peu coûteux d'un changement dans les releases d'un dépôt (flux Atom de github.com, hors quota de l'API).
import { compareVersions } from './releases';
import type { GhRelease } from './releases';
import type { InstalledModpack, Modpack, ModpackVersion } from './types';

/** Intervalle le plus court et le plus long entre deux vérifications, en minutes. */
export const MIN_CHECK_MINUTES = 1;
export const MAX_CHECK_MINUTES = 6 * 60;
export const DEFAULT_PACK_CHECK_MINUTES = 5;
export const DEFAULT_APP_CHECK_MINUTES = 10;

/** Crans du curseur des paramètres, en minutes. */
export const CHECK_MINUTE_STEPS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360];

/** Un intervalle enregistré, ramené à un nombre entier de minutes entre 1 minute et 6 heures. */
export function normalizeCheckMinutes(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_CHECK_MINUTES, Math.max(MIN_CHECK_MINUTES, Math.round(value)));
}

/** « 1 minute », « 45 minutes », « 1 heure », « 1 h 30 », « 6 heures ». */
export function formatCheckInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest) return `${hours} h ${String(rest).padStart(2, '0')}`;
  return `${hours} heure${hours > 1 ? 's' : ''}`;
}

/** « chaque minute », « toutes les 5 minutes », « toutes les heures », « toutes les 1 h 30 ». */
export function formatEvery(minutes: number): string {
  if (minutes === 1) return 'chaque minute';
  if (minutes === 60) return 'toutes les heures';
  return `toutes les ${formatCheckInterval(minutes)}`;
}

/** Cran du curseur le plus proche d'un intervalle. */
export function nearestCheckStep(minutes: number): number {
  let best = 0;
  for (let i = 1; i < CHECK_MINUTE_STEPS.length; i++) {
    if (Math.abs(CHECK_MINUTE_STEPS[i] - minutes) < Math.abs(CHECK_MINUTE_STEPS[best] - minutes)) best = i;
  }
  return best;
}

/**
 * Les versions à installer d'elles-mêmes : pour chaque modpack installé par l'application, sa dernière version si
 * elle est plus récente que celle installée et publiée après l'installation. Un joueur qui revient exprès à une
 * version précédente (Historique des versions) la garde donc, jusqu'à la sortie d'une version encore plus récente.
 */
export function packsToAutoUpdate(modpacks: Modpack[], installed: InstalledModpack[]): ModpackVersion[] {
  const found: ModpackVersion[] = [];
  for (const current of installed) {
    const latest = modpacks.find((modpack) => modpack.id === current.id)?.latest;
    if (!latest || !latest.archiveSha256) continue;
    if (compareVersions(latest.version, current.version) <= 0) continue;
    const publishedAt = Date.parse(latest.publishedAt);
    const installedAt = Date.parse(current.installedAt);
    if (Number.isFinite(publishedAt) && Number.isFinite(installedAt) && publishedAt <= installedAt) continue;
    found.push(latest);
  }
  return found;
}

/**
 * Empreinte du flux Atom des releases d'un dépôt (`github.com/<compte>/<dépôt>/releases.atom`) : identifiant et date
 * de chaque entrée. Elle change quand une release est publiée, retirée ou modifiée. null si ce n'est pas un flux.
 */
export function feedSignature(xml: string): string | null {
  if (!/<feed[\s>]/.test(xml)) return null;
  const entries: string[] = [];
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = /<id>([^<]*)<\/id>/.exec(match[1])?.[1]?.trim() ?? '';
    const updated = /<updated>([^<]*)<\/updated>/.exec(match[1])?.[1]?.trim() ?? '';
    entries.push(`${id}@${updated}`);
  }
  return entries.join('\n');
}

/** Une release récente est encore en cours d'envoi : ses fichiers peuvent arriver sans que le flux ne change. */
const INCOMPLETE_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Une release publiée depuis moins d'un jour attend encore des fichiers : aucun fichier, un fichier dont l'envoi n'est
 * pas terminé, ou une release de l'application sans son installeur (la CI l'ajoute après avoir créé la release).
 */
export function hasIncompleteRelease(releases: GhRelease[], appTagPrefix: string, now: number): boolean {
  return releases.some((release) => {
    if (release.draft) return false;
    const at = Date.parse(release.published_at ?? release.created_at);
    if (!Number.isFinite(at) || now - at > INCOMPLETE_WINDOW_MS) return false;
    if (!release.assets.length) return true;
    if (release.assets.some((asset) => (asset.state ?? 'uploaded') !== 'uploaded')) return true;
    return (
      release.tag_name.startsWith(appTagPrefix) &&
      !release.assets.some((asset) => asset.name.toLowerCase().endsWith('.exe'))
    );
  });
}
