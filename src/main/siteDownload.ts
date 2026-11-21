// Téléchargement d'un fichier depuis le site de CurseForge, comme le ferait le publieur dans son navigateur : la page
// de téléchargement du fichier est ouverte dans une fenêtre cachée, et le fichier qu'elle envoie (au bout de son
// compte à rebours) est écrit à l'endroit demandé. Sert aux fichiers dont l'auteur n'autorise le téléchargement que
// depuis CurseForge : l'API ne donne pas leur adresse. L'empreinte est vérifiée par l'appelant (core/addonFiles.ts).
import { BrowserWindow, session } from 'electron';
import { rm } from 'node:fs/promises';
import type { SiteDownload } from '../core/addonFiles';
import { StudioError } from '../core/studio/analyze';

/** Session à part, gardée sur disque : les cookies du site (dont sa vérification anti-robot) y restent d'un essai à l'autre. */
const PARTITION = 'persist:curseforge-site';

/** Le compte à rebours de la page dure 5 s ; au-delà de ce délai, le site n'a pas envoyé le fichier. */
const START_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

const allowedPage = (url: string) => /^https:\/\/(www\.)?curseforge\.com\//i.test(url);

let queue: Promise<unknown> = Promise.resolve();

/** Un téléchargement à la fois : la session n'a qu'un écouteur `will-download` actif. */
export const downloadFromCurseForgeSite: SiteDownload = (pageUrl, destination) => {
  const run = queue.then(() => download(pageUrl, destination));
  queue = run.catch(() => {});
  return run;
};

function download(pageUrl: string, destination: string): Promise<void> {
  if (!allowedPage(pageUrl)) return Promise.reject(new StudioError(`Adresse refusée : ${pageUrl}`));
  const ses = session.fromPartition(PARTITION);
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  const win = new BrowserWindow({
    show: false,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!allowedPage(url)) event.preventDefault();
  });

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ses.removeListener('will-download', onDownload);
      if (!win.isDestroyed()) win.destroy();
      if (err) void rm(destination, { force: true }).finally(() => reject(err));
      else resolve();
    };
    let timer = setTimeout(
      () =>
        finish(
          new StudioError(
            'le site de CurseForge n’a pas envoyé le fichier (page bloquée ou vérification anti-robot ?)',
          ),
        ),
      START_TIMEOUT_MS,
    );
    const onDownload = (_event: Electron.Event, item: Electron.DownloadItem) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        item.cancel();
        finish(new StudioError('téléchargement depuis le site de CurseForge trop long'));
      }, DOWNLOAD_TIMEOUT_MS);
      item.setSavePath(destination);
      item.once('done', (_e, state) =>
        state === 'completed'
          ? finish()
          : finish(new StudioError(`téléchargement depuis le site de CurseForge interrompu (${state})`)),
      );
    };
    ses.on('will-download', onDownload);
    win.loadURL(pageUrl).catch((err: Error) => {
      // Une page qui lance aussitôt un téléchargement « échoue » à se charger (ERR_ABORTED) : ce n'est pas une erreur.
      if (!/ERR_ABORTED/.test(err.message)) finish(new StudioError(`page de CurseForge inaccessible : ${err.message}`));
    });
  });
}
