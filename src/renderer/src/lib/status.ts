import { compareVersions } from '../../../shared/releases';
import type { InstalledModpack, InstallProgress, Modpack, ModpackVersion } from '../../../shared/types';

export type PackStatus =
  | { kind: 'available' }
  | { kind: 'installed'; installed: InstalledModpack }
  | { kind: 'update'; installed: InstalledModpack }
  | { kind: 'other-version'; installed: InstalledModpack };

/** État d'une version donnée d'un modpack par rapport à ce qui est installé. */
export function versionStatus(
  version: ModpackVersion,
  installed: InstalledModpack[],
  latest?: ModpackVersion,
): PackStatus {
  const current = installed.find((i) => i.id === version.id);
  if (!current) return { kind: 'available' };
  if (current.version === version.version) return { kind: 'installed', installed: current };
  const isLatest = !latest || latest.version === version.version;
  if (isLatest && compareVersions(version.version, current.version) > 0) return { kind: 'update', installed: current };
  return { kind: 'other-version', installed: current };
}

export function packStatus(modpack: Modpack, installed: InstalledModpack[]): PackStatus {
  return versionStatus(modpack.latest, installed, modpack.latest);
}

export function progressFor(id: string, progress: InstallProgress | null): InstallProgress | null {
  return progress && progress.id === id ? progress : null;
}
