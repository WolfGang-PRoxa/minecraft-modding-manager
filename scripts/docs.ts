// Vérifie la documentation intégrée à l'application et l'historique des versions :
//
//   npm run docs:verifier
//
// Le sommaire (docs/README.md) liste chaque page de docs/, chaque page commence par son titre, les liens mènent à
// un fichier existant et à une ancre existante (calculée comme sur GitHub), le texte ne contient pas de HTML (que
// l'application n'affiche pas), et CHANGELOG.md respecte son format. Lancé par `npm run build`.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateChangelog } from '../src/shared/changelog'
import {
  extractHeadings,
  extractLinks,
  isExternalLink,
  parseSummary,
  proseLines,
  resolveRepoPath,
  splitHref
} from '../src/shared/docs'

const root = process.cwd()
const SUMMARY = 'docs/README.md'
const CHANGELOG = 'CHANGELOG.md'

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`
}

interface Problem {
  file: string
  line?: number
  message: string
}

const errors: Problem[] = []
const warnings: Problem[] = []
const texts = new Map<string, string>()

const exists = (path: string) => existsSync(join(root, path))
function read(path: string): string {
  let text = texts.get(path)
  if (text === undefined) {
    text = readFileSync(join(root, path), 'utf8').replace(/^﻿/, '')
    texts.set(path, text)
  }
  return text
}

const anchorsCache = new Map<string, Set<string>>()
function anchorsOf(path: string): Set<string> {
  let anchors = anchorsCache.get(path)
  if (!anchors) {
    anchors = new Set(extractHeadings(read(path)).map((heading) => heading.id))
    anchorsCache.set(path, anchors)
  }
  return anchors
}

// Sommaire : chaque page listée existe, une seule fois.
if (!exists(SUMMARY)) {
  errors.push({ file: SUMMARY, message: 'sommaire introuvable.' })
}
const summary = exists(SUMMARY) ? parseSummary(read(SUMMARY)) : { title: '', intro: '', groups: [] }
if (exists(SUMMARY) && !summary.title) errors.push({ file: SUMMARY, line: 1, message: 'titre (« # … ») manquant.' })
if (exists(SUMMARY) && summary.groups.length === 0) {
  errors.push({ file: SUMMARY, message: 'aucune rubrique (« ## … ») : l’aide n’aurait aucune page.' })
}

const pages = new Map<string, string>()
for (const group of summary.groups) {
  if (group.pages.length === 0) warnings.push({ file: SUMMARY, message: `rubrique « ${group.title} » sans page.` })
  for (const page of group.pages) {
    const target = resolveRepoPath(SUMMARY, splitHref(page.file).path)
    if (!target || !target.toLowerCase().endsWith('.md') || !exists(target)) {
      errors.push({ file: SUMMARY, message: `page « ${page.title} » introuvable : ${page.file}` })
    } else if (pages.has(target)) {
      errors.push({ file: SUMMARY, message: `page « ${page.title} » listée deux fois (${page.file}).` })
    } else {
      pages.set(target, page.title)
      if (!page.description) warnings.push({ file: SUMMARY, message: `page « ${page.title} » sans description.` })
    }
  }
}

// Chaque page de docs/ figure au sommaire, sinon l'application ne l'afficherait pas.
for (const name of exists('docs') ? readdirSync(join(root, 'docs')).sort() : []) {
  if (!name.toLowerCase().endsWith('.md') || name === 'README.md') continue
  if (!pages.has(`docs/${name}`)) {
    errors.push({ file: `docs/${name}`, message: 'page absente du sommaire (docs/README.md) : elle ne serait pas affichée dans l’application.' })
  }
}

// Titres, HTML et liens de chaque fichier.
// Le README du dépôt et ses traductions (README.fr.md…), en plus des pages de docs/.
const readmes = readdirSync(root).filter((name) => /^README(\.[a-z-]+)?\.md$/i.test(name))
const checked = [SUMMARY, ...pages.keys(), ...readmes].filter(exists)
let linkCount = 0
for (const file of checked) {
  const text = read(file)
  const headings = extractHeadings(text)
  const first = text.split(/\r?\n/).find((line) => line.trim())
  if (!first?.startsWith('# ')) errors.push({ file, line: 1, message: 'la page doit commencer par son titre (« # … »).' })
  const titles = headings.filter((heading) => heading.depth === 1)
  if (titles.length > 1) warnings.push({ file, line: titles[1].line, message: 'plusieurs titres de niveau 1 : la page n’en a qu’un.' })

  if (!readmes.includes(file)) {
    proseLines(text).forEach((line, index) => {
      const prose = line.replace(/`[^`]*`/g, '')
      const tag = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>]*)?\/?>/.exec(prose)
      if (tag) {
        errors.push({
          file,
          line: index + 1,
          message: `« ${tag[0]} » serait lu comme du HTML, que l’application n’affiche pas : mets-le entre accents graves.`
        })
      }
    })
  }

  for (const link of extractLinks(text)) {
    linkCount++
    if (isExternalLink(link.href)) {
      if (/^http:/i.test(link.href)) {
        warnings.push({ file, line: link.line, message: `lien non sécurisé, que l’application n’ouvrira pas : ${link.href}` })
      }
      continue
    }
    const { path, anchor } = splitHref(link.href)
    const target = path ? resolveRepoPath(file, path) : file
    if (target === null || !exists(target)) {
      errors.push({ file, line: link.line, message: `lien cassé : ${link.href}` })
      continue
    }
    if (anchor && target.toLowerCase().endsWith('.md') && !anchorsOf(target).has(anchor)) {
      errors.push({ file, line: link.line, message: `ancre introuvable : ${link.href}` })
    }
  }
}

// Historique des versions.
let versions = 0
if (!exists(CHANGELOG)) {
  errors.push({ file: CHANGELOG, message: 'fichier introuvable.' })
} else {
  const packageVersion = (JSON.parse(read('package.json')) as { version: string }).version
  const report = validateChangelog(read(CHANGELOG), { packageVersion })
  errors.push(...report.errors.map((message) => ({ file: CHANGELOG, message })))
  warnings.push(...report.warnings.map((message) => ({ file: CHANGELOG, message })))
  versions = (read(CHANGELOG).match(/^##\s+\[?\d+\.\d+\.\d+/gm) ?? []).length
}

const where = (problem: Problem) => `${problem.file}${problem.line ? `:${problem.line}` : ''}`
console.log(c.dim(`Documentation : ${pages.size} pages au sommaire, ${linkCount} liens vérifiés. Historique : ${versions} versions.\n`))
for (const problem of errors) console.log(`${c.red('✖')} ${c.bold(where(problem))} ${problem.message}`)
for (const problem of warnings) console.log(`${c.yellow('⚠')} ${where(problem)} ${problem.message}`)
if (errors.length || warnings.length) console.log()

if (errors.length) {
  console.log(c.red(`✖ ${errors.length} erreur${errors.length > 1 ? 's' : ''} à corriger.\n`))
  process.exit(1)
}
console.log(c.green(`✔ Documentation et historique des versions en ordre${warnings.length ? ' (voir les avertissements)' : ''}.\n`))
