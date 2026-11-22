// Contenu de l'aide : les pages de docs/ et l'historique des versions en français (CHANGELOG.fr.md), intégrés à la
// compilation.
// Le sommaire (docs/README.md) fixe les pages affichées, leur groupe et leur ordre, comme sur GitHub.
import changelogSource from '../../../../CHANGELOG.fr.md?raw';
import { CHANGELOG_FR, parseChangelog, type ChangelogRelease } from '../../../shared/changelog';
import { APP_REPO_URL } from '../../../shared/config';
import {
  extractHeadings,
  headingSlug,
  isExternalLink,
  parseSummary,
  resolveRepoPath,
  splitHref,
  type Heading,
} from '../../../shared/docs';

const sources = import.meta.glob<string>('../../../../docs/*.md', { query: '?raw', import: 'default', eager: true });

/** Fichiers de la documentation, par chemin depuis la racine du dépôt (« docs/bibliotheque.md »). */
const files = new Map(Object.entries(sources).map(([key, text]) => [key.replace(/^(?:\.\.\/)+/, ''), text]));

const SUMMARY_PATH = 'docs/README.md';
const CHANGELOG_PATH = CHANGELOG_FR.file;

export const HOME = 'accueil';
export const CHANGELOG_PAGE = 'nouveautes';

export interface DocPage {
  /** Identifiant de la page dans l'aide (« bibliotheque »). */
  slug: string;
  /** Chemin depuis la racine du dépôt (« docs/bibliotheque.md »). */
  path: string;
  kind: 'home' | 'doc' | 'changelog';
  title: string;
  description: string;
  group: string | null;
  markdown: string;
  headings: Heading[];
}

export const summary = parseSummary(files.get(SUMMARY_PATH) ?? '# Aide');
export const changelog = parseChangelog(changelogSource);

function buildPages(): DocPage[] {
  const pages: DocPage[] = [
    {
      slug: HOME,
      path: SUMMARY_PATH,
      kind: 'home',
      title: 'Accueil',
      description: summary.intro,
      group: null,
      markdown: files.get(SUMMARY_PATH) ?? '',
      headings: [],
    },
  ];
  for (const group of summary.groups) {
    for (const entry of group.pages) {
      const path = resolveRepoPath(SUMMARY_PATH, splitHref(entry.file).path);
      if (!path || pages.some((page) => page.path === path)) continue;
      if (path === CHANGELOG_PATH) {
        pages.push({
          slug: CHANGELOG_PAGE,
          path,
          kind: 'changelog',
          title: entry.title,
          description: entry.description,
          group: group.title,
          markdown: changelogSource,
          headings: [],
        });
        continue;
      }
      const markdown = files.get(path);
      if (markdown === undefined) continue;
      pages.push({
        slug: path.replace(/^docs\//, '').replace(/\.md$/i, ''),
        path,
        kind: 'doc',
        title: entry.title,
        description: entry.description,
        group: group.title,
        markdown,
        headings: extractHeadings(markdown),
      });
    }
  }
  return pages;
}

export const pages = buildPages();

const bySlug = new Map(pages.map((page) => [page.slug, page]));
const byPath = new Map(pages.map((page) => [page.path.toLowerCase(), page]));

export const pageBySlug = (slug: string): DocPage | null => bySlug.get(slug) ?? null;

/** Pages du sommaire, dans l'ordre de lecture (pour « Précédent » et « Suivant »). */
export const readingOrder = pages.filter((page) => page.kind !== 'home');

/** Ancre d'une version dans la page Nouveautés : celle de son titre sur GitHub (« 103---2026-10-02 »). */
export const releaseAnchor = (release: ChangelogRelease): string => headingSlug(release.heading);

/** Adresse GitHub d'un fichier du dépôt. */
export const repoFileUrl = (path: string): string => `${APP_REPO_URL}/blob/main/${path}`;

export type DocLink =
  { kind: 'page'; slug: string; anchor: string | null } | { kind: 'external'; url: string } | { kind: 'none' };

/**
 * Cible d'un lien écrit dans le fichier `from` : une page de l'aide (avec son ancre), une adresse web, ou un fichier du
 * dépôt hors de la documentation, ouvert sur GitHub.
 */
export function resolveLink(from: string, href: string): DocLink {
  if (isExternalLink(href)) return /^(https|mailto):/i.test(href) ? { kind: 'external', url: href } : { kind: 'none' };
  const { path, anchor } = splitHref(href);
  if (!path) return { kind: 'page', slug: byPath.get(from.toLowerCase())?.slug ?? HOME, anchor };
  const target = resolveRepoPath(from, path);
  if (!target) return { kind: 'none' };
  const page = byPath.get(target.toLowerCase());
  if (page) return { kind: 'page', slug: page.slug, anchor };
  return { kind: 'external', url: `${repoFileUrl(target)}${anchor ? `#${anchor}` : ''}` };
}
