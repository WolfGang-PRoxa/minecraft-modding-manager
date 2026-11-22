// Historique des versions de l'application, au format « Keep a Changelog », en deux langues qui disent la même chose :
// CHANGELOG.md en anglais et CHANGELOG.fr.md en français. Le français est lu par l'application (page Nouveautés) et
// donne les notes de la release GitHub, que l'application relit pour annoncer une mise à jour ; scripts/changelog.ts
// tient les deux fichiers (suivi, préparation d'une version) et scripts/docs.ts vérifie qu'ils concordent.
import { compareVersions } from './releases';

/** Section des changements pas encore publiés, toujours en tête du fichier (français). */
export const UNRELEASED = 'Non publié';

/** Rubriques d'une version, dans l'ordre où elles s'affichent (français). */
export const CHANGELOG_CATEGORIES = ['Ajouts', 'Améliorations', 'Corrections', 'Sécurité', 'Suppressions'] as const;

export type ChangelogCategory = (typeof CHANGELOG_CATEGORIES)[number];

/** Une langue de l'historique : son fichier, le titre de « Non publié » et ses rubriques, dans le même ordre. */
export interface ChangelogLanguage {
  file: string;
  /** Code de la langue, pour les messages (« fr », « en »). */
  code: string;
  unreleased: string;
  categories: readonly string[];
}

export const CHANGELOG_FR: ChangelogLanguage = {
  file: 'CHANGELOG.fr.md',
  code: 'fr',
  unreleased: UNRELEASED,
  categories: CHANGELOG_CATEGORIES,
};

export const CHANGELOG_EN: ChangelogLanguage = {
  file: 'CHANGELOG.md',
  code: 'en',
  unreleased: 'Unreleased',
  categories: ['Added', 'Changed', 'Fixed', 'Security', 'Removed'],
};

/** Les deux fichiers de l'historique : le français d'abord (celui de l'application et des notes de release). */
export const CHANGELOG_LANGUAGES = [CHANGELOG_FR, CHANGELOG_EN] as const;

/** Rubrique d'une langue qui correspond à une rubrique française (« Ajouts » → « Added »). */
export function translateCategory(category: ChangelogCategory, language: ChangelogLanguage): string {
  return language.categories[CHANGELOG_CATEGORIES.indexOf(category)];
}

export interface ChangelogSection {
  title: string;
  /** Une entrée par élément de liste, en Markdown, sans les commentaires HTML. */
  items: string[];
}

export interface ChangelogRelease {
  /** Numéro de version ; null pour la section « Non publié ». */
  version: string | null;
  /** Date de publication (AAAA-MM-JJ). */
  date: string | null;
  /** Titre tel qu'écrit dans le fichier (« [1.0.3] - 2026-10-02 ») : son ancre est celle de GitHub. */
  heading: string;
  /** Paragraphe placé avant les rubriques, en Markdown. */
  summary: string;
  sections: ChangelogSection[];
  /** Ligne du titre (à partir de 1). */
  line: number;
}

export interface Changelog {
  title: string;
  intro: string;
  /** Dans l'ordre du fichier : « Non publié », puis de la plus récente à la plus ancienne. */
  releases: ChangelogRelease[];
  /** Liens de fin de fichier (« [1.0.3]: https://… »), par libellé. */
  links: Record<string, string>;
}

export interface ChangelogReport {
  errors: string[];
  warnings: string[];
}

const COMMENT = /<!--[\s\S]*?-->/g;
const LINK_DEFINITION = /^\s{0,3}\[([^\]]+)\]:\s*<?(\S+?)>?\s*$/;
const THEMATIC_BREAK = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const stripComments = (text: string): string => text.replace(COMMENT, '').trim();

interface Block {
  summary: string;
  sections: ChangelogSection[];
  /** Lignes de texte ignorées (ni résumé, ni entrée de liste), pour la vérification. */
  stray: number[];
  /** Entrées placées avant toute rubrique. */
  orphans: number[];
}

/** Lit le contenu d'une version : un résumé facultatif, puis des rubriques (### …) faites de listes. */
function parseBlock(lines: Array<{ text: string; line: number }>): Block {
  const block: Block = { summary: '', sections: [], stray: [], orphans: [] };
  const summary: string[] = [];
  let section: ChangelogSection | null = null;
  let item: string[] | null = null;

  const closeItem = () => {
    if (item && section) {
      const text = stripComments(item.join('\n'));
      if (text) section.items.push(text);
    }
    item = null;
  };

  for (const { text, line } of lines) {
    const heading = /^\s{0,3}###\s+(.+?)\s*#*\s*$/.exec(text);
    if (heading) {
      closeItem();
      section = { title: heading[1].trim(), items: [] };
      block.sections.push(section);
      continue;
    }
    const entry = /^\s{0,3}[-*+]\s+(.*)$/.exec(text);
    if (entry) {
      closeItem();
      if (!section) {
        block.orphans.push(line);
        continue;
      }
      item = [entry[1]];
      continue;
    }
    if (!text.trim()) continue;
    if (item && /^(?: {2,}|\t)/.test(text)) {
      item.push(text.trim());
      continue;
    }
    closeItem();
    if (/^\s*<!--[\s\S]*-->\s*$/.test(text)) continue;
    if (!section) summary.push(text.trim());
    else block.stray.push(line);
  }
  closeItem();
  block.summary = stripComments(summary.join('\n'));
  return block;
}

function parseHeading(heading: string): { label: string; date: string | null } {
  const match = /^\[([^\]]+)\](?:\s*[-–—]\s*(.+))?$/.exec(heading) ?? /^(\S+)(?:\s+[-–—]\s+(.+))?$/.exec(heading);
  return match ? { label: match[1].trim(), date: match[2]?.trim() || null } : { label: heading, date: null };
}

const isUnreleased = (label: string) =>
  CHANGELOG_LANGUAGES.some((language) => label.toLowerCase() === language.unreleased.toLowerCase());

interface ParsedRelease extends ChangelogRelease {
  block: Block;
  bracketed: boolean;
}

function parse(markdown: string): { changelog: Changelog; releases: ParsedRelease[] } {
  const lines = markdown.split(/\r?\n/);
  const changelog: Changelog = { title: '', intro: '', releases: [], links: {} };
  const intro: string[] = [];
  const releases: ParsedRelease[] = [];
  let current: { heading: string; line: number; lines: Array<{ text: string; line: number }> } | null = null;

  const flush = () => {
    if (!current) return;
    const { label, date } = parseHeading(current.heading);
    const block = parseBlock(current.lines);
    releases.push({
      version: isUnreleased(label) ? null : label,
      date,
      heading: current.heading,
      summary: block.summary,
      sections: block.sections,
      line: current.line,
      block,
      bracketed: current.heading.startsWith('['),
    });
    current = null;
  };

  lines.forEach((text, index) => {
    const line = index + 1;
    const definition = LINK_DEFINITION.exec(text);
    if (definition) {
      changelog.links[definition[1]] = definition[2];
      return;
    }
    const h1 = /^#\s+(.+?)\s*$/.exec(text);
    if (h1 && !changelog.title && !current) {
      changelog.title = h1[1];
      return;
    }
    const h2 = /^##\s+(.+?)\s*#*\s*$/.exec(text);
    if (h2) {
      flush();
      current = { heading: h2[1], line, lines: [] };
      return;
    }
    if (current) current.lines.push({ text, line });
    else if (changelog.title) intro.push(text);
  });
  flush();

  changelog.intro = stripComments(intro.join('\n'));
  changelog.releases = releases.map((r) => ({
    version: r.version,
    date: r.date,
    heading: r.heading,
    summary: r.summary,
    sections: r.sections,
    line: r.line,
  }));
  return { changelog, releases };
}

export function parseChangelog(markdown: string): Changelog {
  return parse(markdown).changelog;
}

/**
 * Nouveautés d'une version lues dans les notes d'une release GitHub (écrites par la CI depuis CHANGELOG.md) :
 * tout ce qui précède le premier trait horizontal, la suite étant le mode d'emploi de l'installeur.
 * Une release plus ancienne, sans rubriques, n'en donne aucune.
 */
export function parseReleaseNotes(body: string): Pick<ChangelogRelease, 'summary' | 'sections'> {
  const lines: Array<{ text: string; line: number }> = [];
  for (const [index, text] of body.split(/\r?\n/).entries()) {
    if (THEMATIC_BREAK.test(text)) break;
    lines.push({ text, line: index + 1 });
  }
  const block = parseBlock(lines);
  const sections = block.sections.filter((section) => section.items.length > 0);
  return { summary: sections.length ? block.summary : '', sections };
}

export function findRelease(changelog: Changelog, version: string): ChangelogRelease | null {
  return changelog.releases.find((release) => release.version === version) ?? null;
}

export const releaseHasChanges = (release: Pick<ChangelogRelease, 'sections'>): boolean =>
  release.sections.some((section) => section.items.length > 0);

/** Notes d'une version, en Markdown : son résumé puis ses rubriques (texte des notes de la release GitHub). */
export function releaseNotesMarkdown(release: Pick<ChangelogRelease, 'summary' | 'sections'>): string {
  const parts = release.summary ? [release.summary] : [];
  for (const section of release.sections) {
    if (!section.items.length) continue;
    parts.push(`### ${section.title}`);
    parts.push(section.items.map((item) => `- ${item.replace(/\n/g, '\n  ')}`).join('\n'));
  }
  return parts.join('\n\n');
}

/** Empreintes de commits citées dans les commentaires du fichier (« <!-- 8f35361 --> »). */
export function referencedCommits(markdown: string): string[] {
  const hashes: string[] = [];
  for (const comment of markdown.match(COMMENT) ?? []) {
    for (const hash of comment.match(/\b[0-9a-f]{7,40}\b/gi) ?? []) hashes.push(hash.toLowerCase());
  }
  return hashes;
}

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/**
 * Vérifie le fichier : titres de version (« ## [1.2.0] - 2026-10-03 »), ordre des versions et des dates,
 * rubriques connues, entrées présentes. `packageVersion` (version de package.json) doit avoir son entrée.
 */
export function validateChangelog(
  markdown: string,
  options: { packageVersion?: string; language?: ChangelogLanguage } = {},
): ChangelogReport {
  const { unreleased, categories } = options.language ?? CHANGELOG_FR;
  const { changelog, releases } = parse(markdown);
  const errors: string[] = [];
  const warnings: string[] = [];
  const at = (line: number, message: string) => `ligne ${line} : ${message}`;

  if (!changelog.title) errors.push('Titre principal (« # … ») manquant en tête du fichier.');
  if (releases.length === 0) errors.push('Aucune version : chaque version a son titre « ## [x.y.z] - AAAA-MM-JJ ».');

  const seen = new Set<string>();
  let previous: ParsedRelease | null = null;
  releases.forEach((release, index) => {
    const label = release.version ?? unreleased;
    if (!release.bracketed)
      warnings.push(at(release.line, `écris le titre « ## [${label}]${release.date ? ` - ${release.date}` : ''} ».`));
    if (release.version === null) {
      if (index > 0) errors.push(at(release.line, `la section « ${unreleased} » doit être la première.`));
      if (parseHeading(release.heading).label !== unreleased)
        errors.push(at(release.line, `la section des changements non publiés s’intitule « ## [${unreleased}] ».`));
      if (release.date) warnings.push(at(release.line, `la section « ${unreleased} » n’a pas de date.`));
    } else {
      if (!VERSION.test(release.version))
        errors.push(at(release.line, `numéro de version « ${release.version} » invalide (attendu : 1.2.3).`));
      if (!release.date)
        errors.push(at(release.line, `date manquante pour la version ${release.version} (« - AAAA-MM-JJ »).`));
      else if (!validDate(release.date))
        errors.push(at(release.line, `date « ${release.date} » invalide (attendu : AAAA-MM-JJ).`));
      if (seen.has(release.version)) errors.push(at(release.line, `la version ${release.version} apparaît deux fois.`));
      seen.add(release.version);
      if (!releaseHasChanges(release))
        errors.push(at(release.line, `la version ${release.version} ne contient aucune entrée.`));
      if (previous?.version && VERSION.test(previous.version) && VERSION.test(release.version)) {
        if (compareVersions(release.version, previous.version) >= 0) {
          errors.push(
            at(
              release.line,
              `la version ${release.version} doit être placée après la ${previous.version} (de la plus récente à la plus ancienne).`,
            ),
          );
        }
        if (previous.date && release.date && release.date > previous.date) {
          errors.push(at(release.line, `la version ${release.version} est datée après la ${previous.version}.`));
        }
      }
    }
    if (!changelog.links[label]) warnings.push(at(release.line, `lien « [${label}]: … » manquant en fin de fichier.`));

    const titles = new Set<string>();
    let rank = -1;
    for (const section of release.sections) {
      const known = categories.indexOf(section.title);
      if (known < 0) {
        errors.push(
          at(
            release.line,
            `rubrique « ${section.title} » inconnue dans ${label} (rubriques : ${categories.join(', ')}).`,
          ),
        );
      } else {
        if (known < rank)
          warnings.push(at(release.line, `rubriques de ${label} dans le désordre (ordre : ${categories.join(', ')}).`));
        rank = Math.max(rank, known);
      }
      if (titles.has(section.title))
        errors.push(at(release.line, `rubrique « ${section.title} » en double dans ${label}.`));
      titles.add(section.title);
      if (!section.items.length && release.version !== null)
        warnings.push(at(release.line, `rubrique « ${section.title} » vide dans ${label}.`));
    }
    for (const line of release.block.orphans)
      errors.push(at(line, `entrée placée avant toute rubrique (« ### ${categories[0]} »…).`));
    for (const line of release.block.stray)
      warnings.push(at(line, 'texte ignoré : seules les listes sont lues sous une rubrique.'));
    previous = release;
  });

  for (const label of Object.keys(changelog.links)) {
    if (!releases.some((r) => (r.version ?? unreleased) === label))
      warnings.push(`Lien « [${label}] » sans version correspondante.`);
  }
  if (options.packageVersion && !seen.has(options.packageVersion)) {
    errors.push(
      `La version ${options.packageVersion} de package.json n’a pas d’entrée : prépare-la avec « npm run changelog -- --version ${options.packageVersion} ».`,
    );
  }
  return { errors, warnings };
}

/**
 * Vérifie que les deux langues de l'historique disent la même chose : mêmes versions, aux mêmes dates, avec les mêmes
 * rubriques (« Ajouts » ↔ « Added »…) et autant d'entrées dans chacune. Les textes, eux, ne sont pas comparés.
 */
export function compareChangelogs(
  reference: { markdown: string; language: ChangelogLanguage },
  translation: { markdown: string; language: ChangelogLanguage },
): string[] {
  const errors: string[] = [];
  const shape = (markdown: string, language: ChangelogLanguage) =>
    new Map(
      parseChangelog(markdown).releases.map((release) => [
        release.version ?? '',
        {
          release,
          sections: new Map(
            release.sections
              .filter((section) => section.items.length > 0)
              .map((section) => [language.categories.indexOf(section.title), section.items.length]),
          ),
        },
      ]),
    );
  const ref = shape(reference.markdown, reference.language);
  const other = shape(translation.markdown, translation.language);
  const name = (version: string, language: ChangelogLanguage) => (version ? version : language.unreleased);
  const file = translation.language.file;

  for (const [version, { release, sections }] of ref) {
    const match = other.get(version);
    if (!match) {
      errors.push(`la version ${name(version, reference.language)} de ${reference.language.file} manque dans ${file}.`);
      continue;
    }
    if (release.date !== match.release.date) {
      errors.push(
        `la version ${version} est datée du ${release.date} dans ${reference.language.file} et du ${match.release.date} dans ${file}.`,
      );
    }
    const indexes = new Set([...sections.keys(), ...match.sections.keys()]);
    for (const index of [...indexes].sort((x, y) => x - y)) {
      const count = sections.get(index) ?? 0;
      const translated = match.sections.get(index) ?? 0;
      if (index < 0 || count === translated) continue;
      errors.push(
        `${name(version, translation.language)} : ${count} entrée${count > 1 ? 's' : ''} « ${reference.language.categories[index]} » dans ${reference.language.file}, ${translated} « ${translation.language.categories[index]} » dans ${file}.`,
      );
    }
  }
  for (const version of other.keys()) {
    if (!ref.has(version)) {
      errors.push(
        `la version ${name(version, translation.language)} de ${file} manque dans ${reference.language.file}.`,
      );
    }
  }
  return errors;
}
