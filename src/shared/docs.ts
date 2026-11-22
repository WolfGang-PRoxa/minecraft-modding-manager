// Documentation de l'application : les pages Markdown de docs/, et leur sommaire (docs/README.md).
// Le même texte est lu sur GitHub et dans l'application : les ancres suivent donc les règles de GitHub.

/** Page listée dans le sommaire. */
export interface SummaryPage {
  /** Chemin relatif au dossier docs/ (« bibliotheque.md », « ../CHANGELOG.fr.md »). */
  file: string;
  title: string;
  /** Phrase qui suit le lien dans le sommaire. */
  description: string;
}

export interface SummaryGroup {
  title: string;
  pages: SummaryPage[];
}

export interface DocsSummary {
  title: string;
  /** Texte placé entre le titre et la première rubrique, en Markdown. */
  intro: string;
  groups: SummaryGroup[];
}

export interface Heading {
  depth: number;
  /** Texte affiché, sans la mise en forme Markdown. */
  text: string;
  /** Ancre, identique à celle de GitHub (doublons suffixés -1, -2…). */
  id: string;
  /** Ligne du titre dans le fichier (à partir de 1). */
  line: number;
}

export interface MarkdownLink {
  text: string;
  href: string;
  line: number;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** Lignes du texte, celles des blocs de code remplacées par des lignes vides (numéros de ligne conservés). */
export function proseLines(markdown: string): string[] {
  let fence: string | null = null;
  return markdown.split(/\r?\n/).map((line) => {
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return '';
    }
    if (marker) {
      fence = marker;
      return '';
    }
    return line;
  });
}

/**
 * Espaces insécables de la typographie française, à l'affichage : avant « : ; ! ? » et à l'intérieur des
 * guillemets, pour qu'un retour à la ligne ne sépare jamais la ponctuation de son mot.
 */
export function frenchSpacing(text: string): string {
  return text.replace(/ ([:;!?»])/g, ' $1').replace(/« /g, '« ');
}

/** Texte d'un passage Markdown, sans mise en forme : liens, code, gras, italique, commentaires. */
export function inlineText(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\p{L}\p{N}])[*_](.+?)[*_](?=[^\p{L}\p{N}]|$)/gu, '$1$2')
    .trim();
}

/**
 * Ancre d'un titre, calculée comme GitHub : minuscules, ponctuation et symboles retirés (lettres accentuées,
 * chiffres, tirets et soulignés gardés), espaces remplacées par des tirets.
 */
export function headingSlug(text: string): string {
  return inlineText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/** Ancres d'une page : un deuxième titre identique reçoit le suffixe -1, le suivant -2, comme sur GitHub. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = headingSlug(text);
    let id = base;
    let count = seen.get(base) ?? 0;
    while (seen.has(id)) id = `${base}-${++count}`;
    seen.set(base, count);
    seen.set(id, 0);
    return id;
  };
}

/** Titres de la page (hors blocs de code), avec leur ancre. */
export function extractHeadings(markdown: string): Heading[] {
  const slug = createSlugger();
  const headings: Heading[] = [];
  proseLines(markdown).forEach((line, index) => {
    const match = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;
    const text = inlineText(match[2]);
    headings.push({ depth: match[1].length, text, id: slug(match[2]), line: index + 1 });
  });
  return headings;
}

/** Liens Markdown de la page (hors blocs et extraits de code). */
export function extractLinks(markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  proseLines(markdown).forEach((line, index) => {
    const prose = line.replace(/`[^`]*`/g, '');
    for (const match of prose.matchAll(/(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      if (match[1]) continue;
      links.push({ text: inlineText(match[2]), href: match[3], line: index + 1 });
    }
    // Liens de référence (« [1.0.3]: https://… »).
    const definition = /^\s{0,3}\[([^\]]+)\]:\s*<?(\S+?)>?\s*$/.exec(prose);
    if (definition) links.push({ text: definition[1], href: definition[2], line: index + 1 });
  });
  return links;
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Sépare le chemin et l'ancre d'un lien (« page.md#ancre »). Le Markdown encode les caractères accentués des
 * liens (« #d%C3%A9j%C3%A0 ») : ils sont décodés.
 */
export function splitHref(href: string): { path: string; anchor: string | null } {
  const hash = href.indexOf('#');
  if (hash < 0) return { path: decode(href), anchor: null };
  return { path: decode(href.slice(0, hash)), anchor: decode(href.slice(hash + 1)) || null };
}

export const isExternalLink = (href: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(href);

/**
 * Lit le sommaire (docs/README.md) : un titre, une introduction, puis une rubrique (## …) par groupe de pages,
 * chacune listant ses pages sous la forme « - [Titre](page.md) : description ».
 */
export function parseSummary(markdown: string): DocsSummary {
  const summary: DocsSummary = { title: '', intro: '', groups: [] };
  const intro: string[] = [];
  let group: SummaryGroup | null = null;
  for (const line of proseLines(markdown)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading?.[1] === '#' && !summary.title) {
      summary.title = inlineText(heading[2]);
      continue;
    }
    if (heading?.[1] === '##') {
      group = { title: inlineText(heading[2]), pages: [] };
      summary.groups.push(group);
      continue;
    }
    if (!group) {
      if (summary.title) intro.push(line);
      continue;
    }
    const item = /^\s*[-*]\s+\[([^\]]+)\]\(\s*([^)\s]+)\s*\)\s*(?:[:—–-]\s*)?(.*)$/.exec(line);
    const last = group.pages[group.pages.length - 1];
    if (item) group.pages.push({ title: inlineText(item[1]), file: item[2], description: item[3].trim() });
    // Description écrite sur plusieurs lignes.
    else if (last && /^\s{2,}\S/.test(line)) last.description = `${last.description} ${line.trim()}`.trim();
  }
  summary.intro = intro.join('\n').trim();
  return summary;
}

/**
 * Chemin, depuis la racine du dépôt, d'un lien relatif écrit dans le fichier `from` (lui aussi depuis la racine) :
 * « ../CHANGELOG.fr.md » écrit dans « docs/a.md » donne « CHANGELOG.fr.md ». null si le lien sort du dépôt.
 */
export function resolveRepoPath(from: string, target: string): string | null {
  const parts = target.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '' || part === '.') continue;
    if (part !== '..') parts.push(part);
    else if (parts.length > 0) parts.pop();
    else return null;
  }
  return parts.join('/');
}
