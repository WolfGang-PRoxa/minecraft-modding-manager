import { useMemo } from 'react';
import { CircleArrowUp, Download, LoaderCircle, Sparkles } from 'lucide-react';
import { parseReleaseNotes } from '../../../shared/changelog';
import { CHANGELOG_PAGE } from '../docs/content';
import { showDocs } from '../docs/store';
import { formatBytes } from '../lib/format';
import { useStore } from '../store';
import { Button } from './Button';

/**
 * Proposition de mise à jour de l'application, juste sous la barre de titre : hors de la zone qui défile,
 * elle reste visible dans toutes les vues (bibliothèque, studio, premier lancement).
 */
export function UpdateBar() {
  const update = useStore((s) => s.catalog?.appUpdate ?? null);
  const appVersion = useStore((s) => s.appVersion);
  const progress = useStore((s) => s.appUpdateProgress);
  const dismissed = useStore((s) => s.updateDismissed);
  const installing = useStore((s) => s.busyId !== null);
  const install = useStore((s) => s.installAppUpdate);
  const cancel = useStore((s) => s.cancelAppUpdate);
  const dismiss = useStore((s) => s.dismissAppUpdate);
  // Les releases publiées avec leurs notes (tirées de CHANGELOG.md) disent ce que la mise à jour apporte.
  const hasNotes = useMemo(
    () => (update?.releases ?? []).some((release) => parseReleaseNotes(release.notes).sections.length > 0),
    [update],
  );
  if (!update || (!progress && dismissed === update.version)) return null;

  const percent = progress?.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
  const restarting = progress?.phase === 'installing';
  return (
    <div
      role="status"
      aria-label="Mise à jour de l’application"
      className="animate-fade-in relative z-20 shrink-0 border-b border-sky-400/20 bg-ink-900/70 backdrop-blur-xl"
    >
      <div className="flex min-h-14 items-center gap-4 bg-sky-400/[0.09] py-2.5 pr-4 pl-5">
        {restarting ? (
          <LoaderCircle size={20} className="shrink-0 animate-spin text-sky-300" />
        ) : (
          <CircleArrowUp size={20} className="shrink-0 text-sky-300" />
        )}

        <p className="min-w-0 flex-1 text-sm text-ink-300">
          {restarting ? (
            <>
              <strong className="font-semibold text-ink-100">Installation de la version {update.version}…</strong>{' '}
              L’application se ferme puis se relance toute seule.
            </>
          ) : progress ? (
            <>
              <strong className="font-semibold text-ink-100">
                Téléchargement de la version {update.version}… {percent} %
              </strong>
              {progress.total > 0 && ` · ${formatBytes(progress.done)} sur ${formatBytes(progress.total)}`}
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink-100">Nouvelle version disponible : {update.version}</strong> ·
              tu utilises la {appVersion}. La mise à jour est automatique ({formatBytes(update.installerSize)}) :
              l’application se relance toute seule.
            </>
          )}
        </p>

        {restarting ? null : progress ? (
          <Button size="sm" variant="ghost" onClick={cancel}>
            Annuler
          </Button>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              icon={Download}
              disabled={installing}
              title={installing ? 'Disponible à la fin de l’installation du modpack' : undefined}
              onClick={() => void install()}
            >
              Mettre à jour
            </Button>
            {hasNotes && (
              <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => showDocs(CHANGELOG_PAGE)}>
                Nouveautés
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Plus tard
            </Button>
          </div>
        )}
      </div>

      {progress && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-400/15">
          <div
            className={`h-full bg-sky-300 transition-[width] duration-200 ${restarting ? 'animate-pulse' : ''}`}
            style={{ width: `${restarting ? 100 : percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
