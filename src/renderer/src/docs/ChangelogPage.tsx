import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CircleArrowUp, CircleMinus, Download, ExternalLink, ShieldCheck, Sparkles, Tag, TrendingUp, Wrench } from 'lucide-react'
import {
  CHANGELOG_CATEGORIES,
  parseReleaseNotes,
  releaseHasChanges,
  UNRELEASED,
  type ChangelogRelease,
  type ChangelogSection
} from '../../../shared/changelog'
import { APP_REPO_URL } from '../../../shared/config'
import { compareVersions } from '../../../shared/releases'
import { Button } from '../components/Button'
import { formatDate } from '../lib/format'
import { useStore } from '../store'
import { changelog, releaseAnchor, type DocLink } from './content'
import { DocMarkdown } from './DocMarkdown'
import { useDocs } from './store'
import { APP_NAME } from '../../../shared/config'

const CATEGORY_STYLES: Record<string, { icon: LucideIcon; accent: string; chip: string }> = {
  Ajouts: { icon: Sparkles, accent: 'text-grass-300', chip: 'bg-grass-400/15 text-grass-300 ring-grass-400/30' },
  Améliorations: { icon: TrendingUp, accent: 'text-sky-300', chip: 'bg-sky-400/15 text-sky-300 ring-sky-400/30' },
  Corrections: { icon: Wrench, accent: 'text-amber-glow', chip: 'bg-amber-glow/15 text-amber-glow ring-amber-glow/35' },
  Sécurité: { icon: ShieldCheck, accent: 'text-violet-300', chip: 'bg-violet-400/15 text-violet-300 ring-violet-400/30' },
  Suppressions: { icon: CircleMinus, accent: 'text-red-300', chip: 'bg-red-500/15 text-red-300 ring-red-400/30' }
}
const OTHER_CATEGORY = { icon: Tag, accent: 'text-ink-200', chip: 'bg-white/[0.06] text-ink-200 ring-white/10' }

const CHANGELOG_PATH = 'CHANGELOG.md'
const releaseUrl = (version: string) => `${APP_REPO_URL}/releases/tag/app-v${version}`
const asList = (items: string[]) => items.map((item) => `- ${item.replace(/\n/g, '\n  ')}`).join('\n')

function Pill({ className, children }: { className: string; children: string }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap uppercase ring-1 ring-inset ${className}`}>
      {children}
    </span>
  )
}

function Sections({
  sections,
  filter,
  onLink
}: {
  sections: ChangelogSection[]
  filter: string | null
  onLink: (link: DocLink) => void
}) {
  return (
    <div className="mt-4 space-y-5">
      {sections
        .filter((section) => section.items.length > 0 && (!filter || section.title === filter))
        .map((section) => {
          const style = CATEGORY_STYLES[section.title] ?? OTHER_CATEGORY
          return (
            <div key={section.title}>
              <h3 className={`flex items-center gap-2 text-xs font-semibold tracking-widest uppercase ${style.accent}`}>
                <style.icon size={14} strokeWidth={2.5} /> {section.title}
              </h3>
              <DocMarkdown markdown={asList(section.items)} path={CHANGELOG_PATH} onLink={onLink} className="changelog-items" />
            </div>
          )
        })}
    </div>
  )
}

function ReleaseEntry({
  release,
  appVersion,
  updatedFrom,
  filter,
  onLink
}: {
  release: ChangelogRelease
  appVersion: string
  updatedFrom: string | null
  filter: string | null
  onLink: (link: DocLink) => void
}) {
  const { version } = release
  const current = version !== null && version === appVersion
  const fresh =
    version !== null && updatedFrom !== null && compareVersions(version, updatedFrom) > 0 && compareVersions(version, appVersion) <= 0
  return (
    <section id={releaseAnchor(release)} className="relative scroll-mt-24 pb-10 pl-9 last:pb-2">
      <span
        className={`absolute top-2 left-0 size-3 rounded-full ring-4 ring-ink-900 ${
          current ? 'bg-grass-400' : fresh ? 'bg-sky-300' : version === null ? 'bg-ink-600' : 'bg-ink-500'
        }`}
      />
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink-100">
          {version ? `Version ${version}` : 'Prochaine version'}
        </h2>
        {release.date && <time className="text-sm text-ink-400">{formatDate(`${release.date}T12:00:00`)}</time>}
        {version === null && <Pill className="bg-white/[0.06] text-ink-300 ring-white/10">{UNRELEASED}</Pill>}
        {current && <Pill className="bg-grass-400/15 text-grass-300 ring-grass-400/30">Ta version</Pill>}
        {fresh && <Pill className="bg-sky-400/15 text-sky-300 ring-sky-400/30">Nouveau</Pill>}
        {version && (
          <a
            href={releaseUrl(version)}
            onClick={(e) => {
              e.preventDefault()
              onLink({ kind: 'external', url: releaseUrl(version) })
            }}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-ink-400 transition hover:text-ink-100"
          >
            GitHub <ExternalLink size={12} />
          </a>
        )}
      </header>
      {release.summary && <DocMarkdown markdown={release.summary} path={CHANGELOG_PATH} onLink={onLink} className="mt-2" />}
      <Sections sections={release.sections} filter={filter} onLink={onLink} />
    </section>
  )
}

/** Mise à jour disponible : ce qu'elle apporte, tiré des notes des releases GitHub, et le bouton pour l'installer. */
function AvailableUpdate({ onLink }: { onLink: (link: DocLink) => void }) {
  const update = useStore((s) => s.catalog?.appUpdate ?? null)
  const progress = useStore((s) => s.appUpdateProgress)
  const installing = useStore((s) => s.busyId !== null)
  const install = useStore((s) => s.installAppUpdate)
  const notes = useMemo(
    () => (update?.releases ?? []).map((release) => ({ release, notes: parseReleaseNotes(release.notes) })),
    [update]
  )
  if (!update) return null

  return (
    <section className="mb-12 rounded-3xl bg-sky-400/[0.06] p-7 ring-1 ring-sky-400/25">
      <div className="flex flex-wrap items-center gap-4">
        <CircleArrowUp size={28} className="shrink-0 text-sky-300" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-widest text-sky-300 uppercase">Mise à jour disponible</p>
          <p className="mt-0.5 font-display text-2xl font-bold tracking-tight text-ink-100">Version {update.version}</p>
        </div>
        <Button
          variant="primary"
          icon={Download}
          disabled={progress !== null || installing}
          title={installing ? 'Disponible à la fin de l’installation du modpack' : undefined}
          onClick={() => void install()}
        >
          {progress ? 'Mise à jour en cours…' : 'Mettre à jour'}
        </Button>
      </div>
      {notes.map(({ release, notes: parsed }) => (
        <div key={release.version} className="mt-6 border-t border-white/[0.06] pt-5">
          {notes.length > 1 && (
            <p className="font-display text-lg font-semibold text-ink-100">
              Version {release.version}{' '}
              <span className="ml-1 font-sans text-sm font-normal text-ink-400">{formatDate(release.publishedAt)}</span>
            </p>
          )}
          {parsed.sections.length > 0 ? (
            <>
              {parsed.summary && <DocMarkdown markdown={parsed.summary} path={CHANGELOG_PATH} onLink={onLink} className="mt-2" />}
              <Sections sections={parsed.sections} filter={null} onLink={onLink} />
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-300">
              Les nouveautés de cette version sont décrites sur{' '}
              <button
                type="button"
                onClick={() => onLink({ kind: 'external', url: release.url })}
                className="font-semibold text-grass-300 hover:text-grass-400"
              >
                sa page GitHub
              </button>
              .
            </p>
          )}
        </div>
      ))}
    </section>
  )
}

/** Page « Nouveautés » de l'aide : l'historique des versions de l'application (CHANGELOG.md). */
export function ChangelogPage({ title, onLink }: { title: string; onLink: (link: DocLink) => void }) {
  const appVersion = useStore((s) => s.appVersion)
  const updatedFrom = useDocs((s) => s.updatedFrom)
  const [filter, setFilter] = useState<string | null>(null)

  // « Non publié » n'est montré qu'en développement : c'est le brouillon de la prochaine version.
  const releases = changelog.releases.filter((release) => releaseHasChanges(release) && (release.version !== null || import.meta.env.DEV))
  const categories = CHANGELOG_CATEGORIES.filter((category) =>
    releases.some((release) => release.sections.some((section) => section.title === category && section.items.length > 0))
  )
  const shown = filter ? releases.filter((release) => release.sections.some((s) => s.title === filter && s.items.length > 0)) : releases

  return (
    <div>
      <h1 className="font-display text-4xl font-bold tracking-tight text-ink-100">{title}</h1>
      <p className="mt-3 text-[1.05rem] leading-relaxed text-ink-300">
        L’historique des versions de {APP_NAME}, de la plus récente à la plus ancienne.{' '}
        {appVersion && (
          <>
            Tu utilises la version <strong className="font-semibold text-ink-100">{appVersion}</strong>.
          </>
        )}
        {updatedFrom && ` Mise à jour depuis la ${updatedFrom} : ce que tu viens de recevoir est marqué « Nouveau ».`}
      </p>

      <div className="mt-8">
        <AvailableUpdate onLink={onLink} />
      </div>

      {categories.length > 1 && (
        <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filtrer par rubrique">
          {[null, ...categories].map((category) => {
            const active = filter === category
            const style = category ? (CATEGORY_STYLES[category] ?? OTHER_CATEGORY) : null
            return (
              <button
                key={category ?? 'tout'}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(category)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
                  active
                    ? (style?.chip ?? 'bg-white/10 text-ink-100 ring-white/20')
                    : 'bg-white/[0.03] text-ink-400 ring-white/[0.08] hover:text-ink-200'
                }`}
              >
                {style && <style.icon size={13} strokeWidth={2.5} />}
                {category ?? 'Tout'}
              </button>
            )
          })}
        </div>
      )}

      <div className="relative before:absolute before:top-3 before:bottom-3 before:left-[5px] before:w-px before:bg-white/10">
        {shown.map((release) => (
          <ReleaseEntry
            key={release.heading}
            release={release}
            appVersion={appVersion}
            updatedFrom={updatedFrom}
            filter={filter}
            onLink={onLink}
          />
        ))}
      </div>
    </div>
  )
}
