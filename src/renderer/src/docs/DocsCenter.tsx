import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  CloudUpload,
  Download,
  ExternalLink,
  House,
  LifeBuoy,
  Search,
  Sparkles,
  X
} from 'lucide-react'
import { releaseHasChanges } from '../../../shared/changelog'
import { frenchSpacing, inlineText } from '../../../shared/docs'
import { IconButton } from '../components/Button'
import { Logo } from '../components/Logo'
import { useStore } from '../store'
import { ChangelogPage } from './ChangelogPage'
import {
  CHANGELOG_PAGE,
  changelog,
  HOME,
  pageBySlug,
  pages,
  readingOrder,
  releaseAnchor,
  repoFileUrl,
  summary,
  type DocLink,
  type DocPage
} from './content'
import { DocMarkdown } from './DocMarkdown'
import { searchDocs, type SearchHit } from './search'
import { useDocs } from './store'
import { APP_NAME } from '../../../shared/config'

/** Hauteur réservée à la barre du haut de la page, pour qu'une ancre ne s'y cache pas. */
const TOP_OFFSET = 96

interface TocEntry {
  id: string
  text: string
  depth: number
}

function tocFor(page: DocPage): TocEntry[] {
  if (page.kind === 'changelog') {
    return changelog.releases
      .filter((release) => release.version !== null && releaseHasChanges(release))
      .map((release) => ({ id: releaseAnchor(release), text: `Version ${release.version}`, depth: 2 }))
  }
  return page.headings.filter((heading) => heading.depth === 2 || heading.depth === 3)
}

/** Une fenêtre de dialogue est-elle ouverte par-dessus l'aide ? Elle garde alors la main sur le clavier. */
const modalOpen = () => document.querySelector('[aria-modal="true"]') !== null

/** Description d'une page du sommaire (« : ce que fait… ») présentée seule : « Ce que fait… ». */
const describe = (description: string) => frenchSpacing(inlineText(description).replace(/^\p{Ll}/u, (c) => c.toUpperCase()))

function NavLink({ active, onClick, children, badge }: { active: boolean; onClick: () => void; children: ReactNode; badge?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] transition ${
        active ? 'bg-white/10 font-semibold text-ink-100' : 'text-ink-300 hover:bg-white/[0.05] hover:text-ink-100'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
    </button>
  )
}

function Sidebar({ searchRef }: { searchRef: RefObject<HTMLInputElement | null> }) {
  const location = useDocs((s) => s.location)
  const query = useDocs((s) => s.query)
  const setQuery = useDocs((s) => s.setQuery)
  const navigate = useDocs((s) => s.navigate)
  const updatedFrom = useDocs((s) => s.updatedFrom)
  const appVersion = useStore((s) => s.appVersion)
  const update = useStore((s) => s.catalog?.appUpdate?.version ?? null)
  const searching = query.trim() !== ''

  const changelogBadge = update ? (
    <span className="rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">{update}</span>
  ) : updatedFrom ? (
    <span className="size-2 rounded-full bg-sky-300" title="Nouveautés depuis ta dernière version" />
  ) : null

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/40">
      <div className="px-4 pt-5 pb-3">
        <div className="mb-4 flex items-center gap-2.5 px-1">
          <BookOpen size={18} className="text-grass-300" />
          <span className="font-display text-lg font-semibold tracking-tight text-ink-100">Aide</span>
        </div>
        <label className="flex h-10 items-center gap-2 rounded-xl bg-ink-950/70 px-3 ring-1 ring-inset ring-white/10 focus-within:ring-grass-400/60">
          <Search size={15} className="shrink-0 text-ink-500" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const first = searchDocs(query)[0]
              if (first) navigate({ slug: first.section.slug, anchor: first.section.anchor })
            }}
            placeholder="Rechercher dans l’aide"
            aria-label="Rechercher dans l’aide"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500"
          />
          <kbd className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 font-sans text-[10px] font-semibold text-ink-400">Ctrl K</kbd>
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-6" aria-label="Pages de l’aide">
        <NavLink active={!searching && location.slug === HOME} onClick={() => navigate({ slug: HOME })}>
          <span className="inline-flex items-center gap-2">
            <House size={14} /> Accueil
          </span>
        </NavLink>
        {summary.groups.map((group) => (
          <div key={group.title} className="mt-5">
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">{group.title}</p>
            {pages
              .filter((page) => page.group === group.title)
              .map((page) => (
                <NavLink
                  key={page.slug}
                  active={!searching && location.slug === page.slug}
                  onClick={() => navigate({ slug: page.slug })}
                  badge={page.slug === CHANGELOG_PAGE ? changelogBadge : undefined}
                >
                  {page.title}
                </NavLink>
              ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] px-5 py-3 text-xs text-ink-500">
        {APP_NAME} {appVersion && `v${appVersion}`}
      </div>
    </aside>
  )
}

function QuickLink({
  icon: Icon,
  title,
  text,
  onClick
}: {
  icon: LucideIcon
  title: string
  text: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-4 rounded-2xl bg-white/[0.03] p-5 text-left ring-1 ring-inset ring-white/[0.07] transition hover:bg-white/[0.06] hover:ring-white/15"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-grass-400/10 text-grass-300 ring-1 ring-inset ring-grass-400/20">
        <Icon size={19} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold text-ink-100">
          {title}
          <ChevronRight size={15} className="text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-ink-300" />
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-ink-400">{text}</span>
      </span>
    </button>
  )
}

function HomePage() {
  const navigate = useDocs((s) => s.navigate)
  const appVersion = useStore((s) => s.appVersion)
  const update = useStore((s) => s.catalog?.appUpdate?.version ?? null)
  const go = (slug: string, anchor: string | null = null) => navigate({ slug, anchor })

  return (
    <div>
      <div className="flex items-center gap-4">
        <Logo size={52} className="drop-shadow-xl" />
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink-100">{summary.title || 'Aide'}</h1>
          {appVersion && <p className="mt-1 text-sm text-ink-400">Version {appVersion}</p>}
        </div>
      </div>
      <p className="mt-6 text-[1.05rem] leading-relaxed text-ink-300">
        Tout ce qu’il faut savoir pour installer tes modpacks, les garder à jour et publier les tiens. Choisis un sujet,
        ou cherche quelques mots avec <span className="font-semibold text-ink-200">Ctrl + K</span>.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <QuickLink icon={Download} title="Installer un modpack" text="Du premier clic à la partie dans CurseForge." onClick={() => go('bibliotheque', 'installer-un-modpack')} />
        <QuickLink icon={CloudUpload} title="Publier mes modpacks" text="Devenir publieur et prendre en main le Studio." onClick={() => go('studio')} />
        <QuickLink icon={LifeBuoy} title="Résoudre un problème" text="Les messages d’erreur, leur cause et leur solution." onClick={() => go('depannage')} />
        <QuickLink
          icon={Sparkles}
          title="Nouveautés"
          text={update ? `La version ${update} est disponible : découvre ce qu’elle apporte.` : 'L’historique des versions de l’application.'}
          onClick={() => go(CHANGELOG_PAGE)}
        />
      </div>

      {summary.groups.map((group) => (
        <section key={group.title} className="mt-10">
          <h2 className="mb-3 text-xs font-semibold tracking-widest text-ink-400 uppercase">{group.title}</h2>
          <div className="grid items-start gap-2 sm:grid-cols-2">
            {pages
              .filter((page) => page.group === group.title)
              .map((page) => (
                <button
                  key={page.slug}
                  type="button"
                  onClick={() => go(page.slug)}
                  className="rounded-xl px-4 py-3 text-left transition hover:bg-white/[0.05]"
                >
                  <span className="font-medium text-ink-100">{page.title}</span>
                  {page.description && (
                    <span className="mt-0.5 block text-sm leading-snug text-ink-400">{describe(page.description)}</span>
                  )}
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function SearchResults({ query }: { query: string }) {
  const navigate = useDocs((s) => s.navigate)
  const hits = useMemo(() => searchDocs(query), [query])

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink-100">Recherche</h1>
      <p className="mt-2 text-sm text-ink-400">
        {hits.length === 0
          ? `Aucun résultat pour « ${query.trim()} ». Essaie d’autres mots, ou parcours les pages à gauche.`
          : `${hits.length} résultat${hits.length > 1 ? 's' : ''} pour « ${query.trim()} »`}
      </p>
      <div className="mt-6 space-y-2">
        {hits.map((hit: SearchHit) => (
          <button
            key={`${hit.section.slug}#${hit.section.anchor ?? ''}`}
            type="button"
            onClick={() => navigate({ slug: hit.section.slug, anchor: hit.section.anchor })}
            className="block w-full rounded-2xl bg-white/[0.03] px-5 py-4 text-left ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.06] hover:ring-white/15"
          >
            <span className="flex items-center gap-1.5 text-xs text-ink-500">
              {hit.section.group && (
                <>
                  {hit.section.group} <ChevronRight size={12} />
                </>
              )}
              {hit.section.pageTitle}
            </span>
            <span className="mt-1 block font-semibold text-ink-100">{hit.section.heading}</span>
            {hit.snippet.length > 0 && (
              <span className="mt-1.5 block text-sm leading-relaxed text-ink-400">
                {hit.snippet.map((part, i) =>
                  part.hit ? (
                    <mark key={i} className="rounded bg-grass-400/20 px-0.5 text-ink-100">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={i}>{frenchSpacing(part.text)}</span>
                  )
                )}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function PageFooter({ page, onLink }: { page: DocPage; onLink: (link: DocLink) => void }) {
  const navigate = useDocs((s) => s.navigate)
  const index = readingOrder.findIndex((p) => p.slug === page.slug)
  const previous = index > 0 ? readingOrder[index - 1] : null
  const next = index >= 0 && index < readingOrder.length - 1 ? readingOrder[index + 1] : null

  return (
    <footer className="mt-16 border-t border-white/[0.06] pt-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {previous ? (
          <button
            type="button"
            onClick={() => navigate({ slug: previous.slug })}
            className="rounded-2xl px-5 py-4 text-left ring-1 ring-inset ring-white/[0.07] transition hover:bg-white/[0.04]"
          >
            <span className="flex items-center gap-1.5 text-xs text-ink-500">
              <ArrowLeft size={13} /> Précédent
            </span>
            <span className="mt-1 block font-semibold text-ink-100">{previous.title}</span>
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button
            type="button"
            onClick={() => navigate({ slug: next.slug })}
            className="rounded-2xl px-5 py-4 text-right ring-1 ring-inset ring-white/[0.07] transition hover:bg-white/[0.04]"
          >
            <span className="flex items-center justify-end gap-1.5 text-xs text-ink-500">
              Suivant <ArrowRight size={13} />
            </span>
            <span className="mt-1 block font-semibold text-ink-100">{next.title}</span>
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onLink({ kind: 'external', url: repoFileUrl(page.path) })}
        className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition hover:text-ink-200"
      >
        Voir cette page sur GitHub <ExternalLink size={12} />
      </button>
    </footer>
  )
}

function Toc({ entries, active, onSelect }: { entries: TocEntry[]; active: string | null; onSelect: (id: string) => void }) {
  if (entries.length < 2) return null
  return (
    <nav className="sticky top-0 max-h-full overflow-y-auto py-10 pr-6" aria-label="Sur cette page">
      <p className="mb-3 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">Sur cette page</p>
      <ul className="space-y-0.5 border-l border-white/[0.07]">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              className={`-ml-px block w-full border-l py-1 text-left text-[13px] leading-snug transition ${
                entry.depth === 3 ? 'pl-6' : 'pl-3.5'
              } ${
                active === entry.id
                  ? 'border-grass-400 font-medium text-grass-300'
                  : 'border-transparent text-ink-400 hover:border-ink-500 hover:text-ink-200'
              }`}
            >
              {entry.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * L'aide de l'application : la documentation de docs/ et les nouveautés, dans la zone de contenu de la fenêtre
 * (la barre de titre et la proposition de mise à jour restent visibles). Bouton « Aide » ou F1.
 */
export function DocsCenter() {
  const open = useDocs((s) => s.open)
  const location = useDocs((s) => s.location)
  const seq = useDocs((s) => s.seq)
  const query = useDocs((s) => s.query)
  const history = useDocs((s) => s.history)
  const navigate = useDocs((s) => s.navigate)
  const back = useDocs((s) => s.back)
  const close = useDocs((s) => s.close)
  const setQuery = useDocs((s) => s.setQuery)
  const scroller = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState<string | null>(null)

  const page = pageBySlug(location.slug) ?? pageBySlug(HOME)!
  const searching = query.trim() !== ''
  const toc = useMemo(() => tocFor(page), [page])

  const onLink = useCallback(
    (link: DocLink) => {
      if (link.kind === 'external') void window.api.openExternal(link.url)
      else if (link.kind === 'page') navigate({ slug: link.slug, anchor: link.anchor })
    },
    [navigate]
  )

  const scrollTo = useCallback((id: string, smooth: boolean) => {
    const container = scroller.current
    const target = container?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    if (!container || !target) return
    const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - TOP_OFFSET + 24
    container.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    // La section visée est brièvement mise en évidence.
    target.removeAttribute('data-flash')
    void target.offsetWidth
    target.setAttribute('data-flash', '')
  }, [])

  // Chaque navigation : en haut de la page, ou sur l'ancre demandée.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      if (location.anchor && !searching) scrollTo(location.anchor, false)
      else scroller.current?.scrollTo({ top: 0 })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, seq, searching, location.anchor, scrollTo])

  // À l'ouverture, les touches de défilement agissent sur la page.
  useEffect(() => {
    if (open) scroller.current?.focus({ preventScroll: true })
  }, [open])

  // Section en cours de lecture, pour « Sur cette page ».
  useEffect(() => {
    const container = scroller.current
    if (!open || !container) return
    let frame = 0
    const update = () => {
      frame = 0
      const limit = container.getBoundingClientRect().top + TOP_OFFSET + 8
      let current: string | null = toc[0]?.id ?? null
      for (const entry of toc) {
        const element = container.querySelector(`#${CSS.escape(entry.id)}`)
        if (element && element.getBoundingClientRect().top <= limit) current = entry.id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [open, toc, seq])

  // Raccourcis de l'aide. Écoutés à la capture : `Échap` ferme l'aide sans fermer aussi ce qu'elle recouvre
  // (panneau de détails), mais laisse une fenêtre de dialogue ouverte par-dessus se fermer d'abord.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen()) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (useDocs.getState().query) setQuery('')
        else close()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        back()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, close, back, setQuery])

  if (!open) return null

  // « Aide › Jouer › La bibliothèque » ; un groupe qui porte le nom de sa page n'est pas répété.
  const crumbs = searching
    ? ['Recherche']
    : page.kind === 'home'
      ? []
      : [...new Set([page.group, page.title].filter((crumb): crumb is string => Boolean(crumb)))]

  return (
    <section
      aria-label="Aide"
      className="animate-fade-in absolute inset-0 z-[45] flex bg-ink-900"
      onMouseUp={(e) => {
        // Bouton « précédent » de la souris.
        if (e.button === 3) back()
      }}
    >
      <Sidebar searchRef={searchRef} />

      <div ref={scroller} tabIndex={-1} className="relative min-w-0 flex-1 overflow-y-auto outline-none">
        <div className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-white/[0.05] bg-ink-900/85 px-6 backdrop-blur-xl">
          <IconButton icon={ArrowLeft} label="Retour (Alt + ←)" disabled={history.length === 0} onClick={back} />
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
            <button
              type="button"
              onClick={() => navigate({ slug: HOME })}
              className="shrink-0 text-ink-400 transition hover:text-ink-100"
            >
              Aide
            </button>
            {crumbs.map((crumb, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                <ChevronRight size={14} className="shrink-0 text-ink-600" />
                <span className={`truncate ${i === crumbs.length - 1 ? 'font-semibold text-ink-100' : 'text-ink-400'}`}>{crumb}</span>
              </span>
            ))}
          </div>
          <IconButton icon={X} label="Fermer l’aide (Échap)" onClick={close} />
        </div>

        <article key={searching ? 'recherche' : page.slug} className="mx-auto max-w-3xl px-10 pt-10 pb-20">
          {searching ? (
            <SearchResults query={query} />
          ) : page.kind === 'home' ? (
            <HomePage />
          ) : page.kind === 'changelog' ? (
            <>
              <ChangelogPage title={page.title} onLink={onLink} />
              <PageFooter page={page} onLink={onLink} />
            </>
          ) : (
            <>
              <DocMarkdown markdown={page.markdown} path={page.path} headings={page.headings} onLink={onLink} />
              <PageFooter page={page} onLink={onLink} />
            </>
          )}
        </article>
      </div>

      {!searching && toc.length > 1 && (
        <div className="hidden w-64 shrink-0 xl:block">
          <Toc entries={toc} active={active} onSelect={(id) => scrollTo(id, true)} />
        </div>
      )}
    </section>
  )
}
