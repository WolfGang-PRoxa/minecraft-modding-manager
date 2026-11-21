// Mise à jour automatique des modpacks installés (réglage autoUpdatePacks, activé par défaut) : à chaque vérification
// des modpacks (backgroundUpdate.ts), une nouvelle version publiée d'un modpack installé par l'application s'installe
// d'elle-même, sur place, comme avec le bouton Mettre à jour. Jamais pendant une partie lancée avec ce profil (réessayé
// à la vérification suivante), et une version qui échoue (ou dont la mise à jour est annulée) n'est retentée qu'une
// heure plus tard.
import { Notification, type BrowserWindow } from 'electron';
import { packsToAutoUpdate } from '../shared/autoUpdate';
import type { AutoInstallEvent, Catalog, InstallResult, ModpackVersion } from '../shared/types';
import { isGameRunningFrom, resolveInstancesDir } from '../core/curseforge';
import { getSettings } from '../core/settings';
import { appUpdateTask } from './appUpdate';
import { installModpack, isInstalling, listInstalled } from './installer';

/** Après un échec ou une annulation, la même version n'est retentée qu'au bout d'une heure. */
const RETRY_AFTER_FAILURE_MS = 60 * 60_000;

const failures = new Map<string, number>();
// Gardées en mémoire tant qu'elles sont affichées : sinon le clic sur une notification peut être perdu.
const shown = new Set<Notification>();

export interface PackAutoUpdateOptions {
  getWindow: () => BrowserWindow | null;
  /** Ouvre la fenêtre (clic sur la notification). */
  showWindow: () => void;
}

function send(getWindow: () => BrowserWindow | null, channel: string, payload: unknown): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** Fenêtre cachée ou réduite : l'issue est aussi annoncée par une notification Windows (la fenêtre la dit aussi). */
function notify(options: PackAutoUpdateOptions, title: string, body: string): void {
  const win = options.getWindow();
  if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) return;
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body: body.length > 300 ? `${body.slice(0, 297)}…` : body });
  shown.add(notification);
  notification.on('click', () => {
    shown.delete(notification);
    options.showWindow();
  });
  notification.on('close', () => shown.delete(notification));
  notification.show();
}

function notifyResult(options: PackAutoUpdateOptions, version: ModpackVersion, result: InstallResult): void {
  if (result.ok) {
    notify(
      options,
      `${version.name} est à jour`,
      result.curseForgeRunning
        ? `Version ${version.version} installée. CurseForge était ouvert : relance-le pour qu’il affiche la nouvelle version.`
        : `Version ${version.version} installée automatiquement.`,
    );
  } else if (!result.cancelled) {
    notify(options, `Mise à jour de ${version.name} impossible`, result.error);
  }
}

/** Installe les nouvelles versions des modpacks installés, l'une après l'autre. */
export async function autoUpdatePacks(catalog: Catalog, options: PackAutoUpdateOptions): Promise<void> {
  if (catalog.error) return;
  const settings = await getSettings();
  if (!settings.autoUpdatePacks) return;
  const { dir } = await resolveInstancesDir(settings);
  const installed = await listInstalled(dir);
  for (const version of packsToAutoUpdate(catalog.modpacks, installed)) {
    // Une installation lancée à la main, ou l'application qui va se fermer pour se mettre à jour : à plus tard.
    if (isInstalling() || appUpdateTask()) return;
    const failedAt = failures.get(version.tag);
    if (failedAt !== undefined && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) continue;
    const current = installed.find((pack) => pack.id === version.id);
    if (current && (await isGameRunningFrom(current.instancePath))) continue;

    send(options.getWindow, 'install:auto', { kind: 'start', version } satisfies AutoInstallEvent);
    const result = await installModpack(version, (progress) => send(options.getWindow, 'install:progress', progress), {
      background: true,
    });
    // Un échec déjà annoncé ne l'est plus à chaque nouvel essai.
    const announce = result.ok || (!result.cancelled && failedAt === undefined);
    if (result.ok) failures.delete(version.tag);
    else {
      failures.set(version.tag, Date.now());
      if (!result.cancelled) console.warn(`Mise à jour automatique de ${version.name} impossible :`, result.error);
    }
    send(options.getWindow, 'install:auto', { kind: 'end', version, result, announce } satisfies AutoInstallEvent);
    if (announce) notifyResult(options, version, result);
  }
}
