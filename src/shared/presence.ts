import { compareVersions } from './releases';
import type { CurseForgeProfile, InstalledModpack } from './types';

/** Ce qui permet de reconnaître une version d'un modpack : son numéro et l'empreinte de ses mods. */
export interface KnownVersion {
  id: string;
  version: string;
  modsSignature: string | null;
}

/** Version connue retrouvée dans un profil CurseForge de l'utilisateur. */
export interface PresentVersion {
  id: string;
  version: string;
  profileName: string;
  profilePath: string;
  /** `app` : installée par l'application ; `mods` : profil qui contient exactement les mods de cette version. */
  source: 'app' | 'mods';
}

/**
 * Cherche les versions connues dans le CurseForge de l'utilisateur. Un profil installé par l'application dit
 * lui-même ce qu'il contient ; les autres (profil d'origine du publieur, zip importé à la main…) sont reconnus
 * à leurs mods. Si plusieurs versions d'un modpack ont exactement les mêmes mods, c'est la plus récente.
 */
export function findPresentVersions(
  known: KnownVersion[],
  installed: InstalledModpack[],
  profiles: CurseForgeProfile[],
): PresentVersion[] {
  const present: PresentVersion[] = [];
  for (const item of installed) {
    if (!known.some((k) => k.id === item.id && k.version === item.version)) continue;
    const { id, version, instanceName, instancePath } = item;
    present.push({ id, version, profileName: instanceName, profilePath: instancePath, source: 'app' });
  }

  const managed = new Set(installed.map((item) => item.instancePath.toLowerCase()));
  for (const profile of profiles) {
    if (!profile.modsSignature || managed.has(profile.path.toLowerCase())) continue;
    const newest = new Map<string, KnownVersion>();
    for (const candidate of known) {
      if (candidate.modsSignature !== profile.modsSignature) continue;
      const current = newest.get(candidate.id);
      if (!current || compareVersions(candidate.version, current.version) > 0) newest.set(candidate.id, candidate);
    }
    for (const { id, version } of newest.values()) {
      present.push({ id, version, profileName: profile.name, profilePath: profile.path, source: 'mods' });
    }
  }
  // Par modpack, la version la plus récente d'abord.
  return present.sort((a, b) => a.id.localeCompare(b.id) || compareVersions(b.version, a.version));
}

/** « v2 », « v1 et v3 » : les versions présentes, sans doublon, de la plus ancienne à la plus récente. */
export function formatPresentVersions(present: PresentVersion[]): string {
  const versions = [...new Set(present.map((p) => p.version))].sort(compareVersions).map((v) => `v${v}`);
  return versions.length > 1
    ? `${versions.slice(0, -1).join(', ')} et ${versions[versions.length - 1]}`
    : (versions[0] ?? '');
}
