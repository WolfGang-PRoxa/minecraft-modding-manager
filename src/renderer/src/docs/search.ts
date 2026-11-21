// Recherche dans l'aide : chaque page est découpée en sections (une par titre), cherchées sans tenir compte des
// accents ni des majuscules. Le corpus est petit : tout est fait en mémoire, à la première recherche.
import { releaseHasChanges, stripComments, UNRELEASED } from '../../../shared/changelog';
import { changelog, pages, releaseAnchor, type DocPage } from './content';

export interface SearchSection {
  slug: string;
  pageTitle: string;
  group: string | null;
  anchor: string | null;
  heading: string;
  text: string;
}

export interface SearchHit {
  section: SearchSection;
  score: number;
  /** Extrait du texte, découpé en morceaux surlignés ou non. */
  snippet: Array<{ text: string; hit: boolean }>;
}

interface Folded {
  norm: string;
  /** Position, dans le texte d'origine, de chaque caractère du texte normalisé. */
  map: number[];
}

/** Minuscules, sans accents, apostrophes unifiées : « Écran d’accueil » → « ecran d'accueil ». */
function foldChar(char: string): string {
  return char
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'");
}

function fold(text: string): Folded {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    for (const char of foldChar(text[i])) {
      norm += char;
      map.push(i);
    }
  }
  return { norm, map };
}

export const normalize = (text: string): string => fold(text).norm;

/** Texte brut d'un passage Markdown, pour la recherche. */
export function markdownToText(markdown: string): string {
  return stripComments(markdown)
    .replace(/^\s*(`{3,}|~{3,}).*$/gm, '')
    .replace(/^\s*>\s?\[!\w+\]\s*$/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/\\$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function docSections(page: DocPage): SearchSection[] {
  const lines = page.markdown.split(/\r?\n/);
  const sections: SearchSection[] = [];
  const base = { slug: page.slug, pageTitle: page.title, group: page.group };
  let current: SearchSection = { ...base, anchor: null, heading: page.title, text: '' };
  let buffer: string[] = [];
  const flush = () => {
    current.text = markdownToText(buffer.join('\n'));
    if (current.text || current.anchor) sections.push(current);
    buffer = [];
  };
  lines.forEach((line, index) => {
    const heading = page.headings.find((h) => h.line === index + 1);
    if (heading && heading.depth === 1) return;
    if (heading && heading.depth <= 3) {
      flush();
      current = { ...base, anchor: heading.id, heading: heading.text, text: '' };
      return;
    }
    buffer.push(line);
  });
  flush();
  return sections;
}

function changelogSections(page: DocPage): SearchSection[] {
  return changelog.releases
    .filter((release) => (release.version !== null || import.meta.env.DEV) && releaseHasChanges(release))
    .map((release) => ({
      slug: page.slug,
      pageTitle: page.title,
      group: page.group,
      anchor: releaseAnchor(release),
      heading: release.version ? `Version ${release.version}` : UNRELEASED,
      text: markdownToText(
        [release.summary, ...release.sections.flatMap((section) => [section.title, ...section.items])].join('\n'),
      ),
    }));
}

interface IndexedSection {
  section: SearchSection;
  heading: string;
  title: string;
  body: Folded;
}

let index: IndexedSection[] | null = null;

function buildIndex(): IndexedSection[] {
  const sections = pages.flatMap((page) =>
    page.kind === 'doc' ? docSections(page) : page.kind === 'changelog' ? changelogSections(page) : [],
  );
  return sections.map((section) => ({
    section,
    heading: normalize(section.heading),
    title: normalize(section.pageTitle),
    body: fold(section.text),
  }));
}

function count(haystack: string, needle: string): number {
  let n = 0;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) n++;
  return n;
}

const SNIPPET_BEFORE = 60;
const SNIPPET_LENGTH = 200;

/** Extrait autour de la première occurrence, avec chaque terme surligné. */
function snippet(text: string, body: Folded, terms: string[], phrase: string): SearchHit['snippet'] {
  if (!text) return [];
  const firstPhrase = body.norm.indexOf(phrase);
  const positions = terms.map((term) => body.norm.indexOf(term)).filter((at) => at >= 0);
  const first = firstPhrase >= 0 ? firstPhrase : positions.length ? Math.min(...positions) : 0;
  let start = Math.max(0, (body.map[first] ?? 0) - SNIPPET_BEFORE);
  if (start > 0) start = text.indexOf(' ', start) + 1 || start;
  // L'extrait s'arrête sur une fin de mot.
  let end = Math.min(text.length, start + SNIPPET_LENGTH);
  if (end < text.length) end = text.lastIndexOf(' ', end) > start ? text.lastIndexOf(' ', end) : end;

  // Zones surlignées, en positions du texte d'origine.
  const marks: Array<[number, number]> = [];
  for (const term of terms) {
    for (let at = body.norm.indexOf(term); at >= 0; at = body.norm.indexOf(term, at + term.length)) {
      const from = body.map[at];
      const to = body.map[at + term.length - 1] + 1;
      if (to > start && from < end) marks.push([Math.max(from, start), Math.min(to, end)]);
    }
  }
  marks.sort((a, b) => a[0] - b[0]);

  const parts: SearchHit['snippet'] = [];
  let cursor = start;
  for (const [from, to] of marks) {
    if (to <= cursor) continue;
    if (from > cursor) parts.push({ text: text.slice(cursor, from), hit: false });
    parts.push({ text: text.slice(Math.max(from, cursor), to), hit: true });
    cursor = to;
  }
  if (cursor < end) parts.push({ text: text.slice(cursor, end), hit: false });
  if (start > 0) parts.unshift({ text: '… ', hit: false });
  if (end < text.length) parts.push({ text: ' …', hit: false });
  return parts;
}

/** Sections qui contiennent tous les mots cherchés, les plus pertinentes d'abord. */
export function searchDocs(query: string, limit = 40): SearchHit[] {
  const phrase = normalize(query).replace(/\s+/g, ' ').trim();
  const terms = [...new Set(phrase.split(/[\s']+/).filter((term) => term.length >= 2 || /\d/.test(term)))];
  if (terms.length === 0) return [];
  index ??= buildIndex();

  const hits: SearchHit[] = [];
  for (const entry of index) {
    const all = `${entry.title} ${entry.heading} ${entry.body.norm}`;
    if (!terms.every((term) => all.includes(term))) continue;
    let score = 0;
    for (const term of terms) {
      if (entry.heading.includes(term)) score += entry.heading.startsWith(term) ? 10 : 8;
      if (entry.title.includes(term)) score += 4;
      score += Math.min(5, count(entry.body.norm, term));
    }
    if (terms.length > 1 && entry.heading.includes(phrase)) score += 12;
    if (terms.length > 1 && entry.body.norm.includes(phrase)) score += 6;
    hits.push({ section: entry.section, score, snippet: snippet(entry.section.text, entry.body, terms, phrase) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
