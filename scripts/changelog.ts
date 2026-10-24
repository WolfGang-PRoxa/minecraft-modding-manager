// Suivi de l'historique des versions de l'application (CHANGELOG.md) :
//
//   npm run changelog                       état : la section « Non publié » et les commits depuis la dernière
//                                           version, mentionnés ou non dans l'historique
//   npm run changelog -- --brouillon        ajoute à « Non publié » une entrée par commit non mentionné
//   npm run changelog -- --version 1.2.0    prépare la version 1.2.0 : « Non publié » devient la 1.2.0, datée du
//                                           jour, et package.json passe en 1.2.0 (ni commit, ni tag)
//   npm run changelog -- --notes 1.2.0      texte de la release GitHub de la 1.2.0 (option --sortie <fichier>)
//
// Un commit feat, fix ou perf est mentionné s'il modifie CHANGELOG.md, ou si son empreinte figure dans un
// commentaire du fichier (« <!-- 8f35361 --> »).
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  CHANGELOG_CATEGORIES,
  findRelease,
  parseChangelog,
  referencedCommits,
  releaseHasChanges,
  releaseNotesMarkdown,
  UNRELEASED,
  validateChangelog,
  type ChangelogCategory,
  type ChangelogReport
} from '../src/shared/changelog'
import { APP_REPO_URL, APP_TAG_PREFIX } from '../src/shared/config'
import { compareVersions } from '../src/shared/releases'

const { values: args } = parseArgs({
  options: {
    brouillon: { type: 'boolean', default: false },
    version: { type: 'string' },
    notes: { type: 'string' },
    sortie: { type: 'string' }
  }
})

const root = process.cwd()
const CHANGELOG = 'CHANGELOG.md'

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`
}

class ScriptError extends Error {}

// ---------------------------------------------------------------------------------------------
// Fichiers (la fin de ligne d'origine est conservée : CRLF sur un poste Windows, LF dans la CI)

interface TextFile {
  path: string
  lines: string[]
  eol: string
}

function readText(path: string): TextFile {
  const text = readFileSync(join(root, path), 'utf8').replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return { path, lines, eol: text.includes('\r\n') ? '\r\n' : '\n' }
}

const joinText = (file: TextFile) => file.lines.join(file.eol) + file.eol

function writeText(file: TextFile): void {
  writeFileSync(join(root, file.path), joinText(file))
}

const markdown = (file: TextFile) => file.lines.join('\n')

// ---------------------------------------------------------------------------------------------
// Git

function git(...gitArgs: string[]): string {
  return execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function lastReleaseTag(): string | null {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', `${APP_TAG_PREFIX}*`) || null
  } catch {
    return null
  }
}

/** Rubrique de l'historique qui correspond à un type de commit visible par les utilisateurs. */
const CATEGORY_OF: Record<string, ChangelogCategory> = { feat: 'Ajouts', fix: 'Corrections', perf: 'Améliorations' }

interface Commit {
  hash: string
  short: string
  subject: string
  type: string | null
  /** Texte du message, sans son type (« feat: »). */
  summary: string
  category: ChangelogCategory | null
  status: 'changelog' | 'cited' | 'missing' | 'ignored'
}

function commitsSince(tag: string | null, referenced: string[]): Commit[] {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  const log = git('log', '--no-merges', '--reverse', '--format=%H%x1f%s%x1e', range)
  const touched = new Set(git('log', '--no-merges', '--format=%H', range, '--', CHANGELOG).split('\n').filter(Boolean))
  return log
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, subject] = entry.split('\x1f')
      const match = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(subject)
      const type = match ? match[1].toLowerCase() : null
      const category = type ? (CATEGORY_OF[type] ?? null) : null
      const cited = referenced.some((ref) => hash.startsWith(ref))
      const status: Commit['status'] = !category ? 'ignored' : touched.has(hash) ? 'changelog' : cited ? 'cited' : 'missing'
      return { hash, short: hash.slice(0, 7), subject, type, summary: match ? match[2] : subject, category, status }
    })
}

// ---------------------------------------------------------------------------------------------
// Modification du fichier

const RELEASE_HEADING = /^##\s+/
const LINK_DEFINITION = /^\s{0,3}\[([^\]]+)\]:\s*\S+/
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Lignes de la section « Non publié » (titre exclu) : [début, fin[. Créée en tête des versions si elle manque. */
function unreleasedBlock(file: TextFile): [number, number] {
  const isUnreleased = (line: string) => new RegExp(`^##\\s+\\[?(${escapeRegExp(UNRELEASED)}|Unreleased)\\]?\\s*$`, 'i').test(line)
  let heading = file.lines.findIndex(isUnreleased)
  if (heading < 0) {
    const first = file.lines.findIndex((line) => RELEASE_HEADING.test(line))
    const at = first >= 0 ? first : file.lines.length
    file.lines.splice(at, 0, `## [${UNRELEASED}]`, '')
    heading = at
  }
  let end = heading + 1
  while (end < file.lines.length && !RELEASE_HEADING.test(file.lines[end]) && !LINK_DEFINITION.test(file.lines[end])) end++
  return [heading + 1, end]
}

/** Ajoute des entrées à une rubrique de « Non publié », créée à sa place si elle n'existe pas. */
function addEntries(file: TextFile, category: ChangelogCategory, entries: string[]): void {
  const [start, end] = unreleasedBlock(file)
  const headingAt = (index: number) => /^###\s+(.+?)\s*$/.exec(file.lines[index])?.[1] ?? null
  let section = -1
  for (let i = start; i < end; i++) if (headingAt(i) === category) section = i

  if (section >= 0) {
    // Après la dernière ligne non vide de la rubrique.
    let last = section
    for (let i = section + 1; i < end && !headingAt(i); i++) if (file.lines[i].trim()) last = i
    file.lines.splice(last + 1, 0, ...(last === section ? ['', ...entries] : entries))
    return
  }
  // Rubrique absente : avant la première rubrique qui la suit dans l'ordre, sinon en fin de section.
  const rank = CHANGELOG_CATEGORIES.indexOf(category)
  let at = end
  for (let i = start; i < end; i++) {
    const title = headingAt(i)
    if (title && CHANGELOG_CATEGORIES.indexOf(title as ChangelogCategory) > rank) {
      at = i
      break
    }
  }
  while (at > start && !file.lines[at - 1].trim()) at--
  // Une ligne vide sépare la rubrique de ce qui la suit, sauf s'il y en a déjà une.
  const gap = at < file.lines.length && file.lines[at].trim() !== '' ? [''] : []
  file.lines.splice(at, 0, '', `### ${category}`, '', ...entries, ...gap)
}

/** Remplace ou ajoute le lien de fin de fichier d'un libellé (« [1.2.0]: … »), avant celui de `before`. */
function setLink(file: TextFile, label: string, url: string, before: string | null): void {
  const line = `[${label}]: ${url}`
  const of = (name: string) => file.lines.findIndex((l) => new RegExp(`^\\s{0,3}\\[${escapeRegExp(name)}\\]:`).test(l))
  const existing = of(label)
  if (existing >= 0) {
    file.lines[existing] = line
    return
  }
  const anchor = before ? of(before) : -1
  if (anchor >= 0) {
    file.lines.splice(anchor, 0, line)
    return
  }
  let last = -1
  file.lines.forEach((l, i) => {
    if (LINK_DEFINITION.test(l)) last = i
  })
  if (last >= 0) file.lines.splice(last + 1, 0, line)
  else file.lines.push('', line)
}

const today = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function printReport(report: ChangelogReport): void {
  for (const error of report.errors) console.log(`${c.red('✖')} ${CHANGELOG} : ${error}`)
  for (const warning of report.warnings) console.log(`${c.yellow('⚠')} ${CHANGELOG} : ${warning}`)
  if (report.errors.length || report.warnings.length) console.log()
}

function packageVersion(): string {
  return (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version
}

// ---------------------------------------------------------------------------------------------
// Commandes

function status(): void {
  const file = readText(CHANGELOG)
  const text = markdown(file)
  const report = validateChangelog(text, { packageVersion: packageVersion() })
  printReport(report)

  const changelog = parseChangelog(text)
  const released = changelog.releases.filter((release) => release.version !== null)
  console.log(
    c.dim(
      `${CHANGELOG} : ${released.length} version${released.length > 1 ? 's' : ''}` +
        (released.length ? `, la dernière est la ${released[0].version} (${released[0].date}).` : '.')
    )
  )

  const unreleased = changelog.releases.find((release) => release.version === null)
  console.log(`\n${c.bold(UNRELEASED)}`)
  if (!unreleased || !releaseHasChanges(unreleased)) console.log(c.dim('  (vide)'))
  for (const section of unreleased?.sections ?? []) {
    if (!section.items.length) continue
    console.log(`  ${section.title}`)
    for (const item of section.items) {
      const line = item.replace(/\s+/g, ' ')
      console.log(c.dim(`    • ${line.length > 110 ? `${line.slice(0, 109)}…` : line}`))
    }
  }

  const tag = lastReleaseTag()
  const commits = commitsSince(tag, referencedCommits(text))
  console.log(`\n${c.bold(`Commits depuis ${tag ?? 'le début'}`)} ${c.dim(`(${commits.length})`)}`)
  if (commits.length === 0) console.log(c.dim('  (aucun)'))
  for (const commit of commits) {
    const label = `${commit.short} ${commit.subject}`
    if (commit.status === 'changelog') console.log(`  ${c.green('✔')} ${label} ${c.dim('· CHANGELOG.md modifié par le commit')}`)
    else if (commit.status === 'cited') console.log(`  ${c.green('✔')} ${label} ${c.dim('· cité dans CHANGELOG.md')}`)
    else if (commit.status === 'missing') console.log(`  ${c.yellow('⚠')} ${label} ${c.yellow('· à mentionner')}`)
    else console.log(c.dim(`  · ${label}`))
  }

  const missing = commits.filter((commit) => commit.status === 'missing').length
  console.log()
  if (missing) {
    console.log(
      c.yellow(
        `⚠ ${missing} commit${missing > 1 ? 's' : ''} à mentionner : écris ${missing > 1 ? 'leurs entrées' : 'son entrée'} dans « ${UNRELEASED} », ou lance npm run changelog -- --brouillon.\n`
      )
    )
  } else {
    console.log(c.green(`✔ Tous les changements visibles depuis ${tag ?? 'le début'} sont mentionnés.\n`))
  }
  if (report.errors.length) process.exit(1)
}

/** « feat: indique les versions… » → « Indique les versions…. <!-- 1a2b3c4 --> » */
function draftEntry(commit: Commit): string {
  const text = commit.summary.trim().replace(/^./, (char) => char.toUpperCase())
  return `- ${text}${/[.!?…]$/.test(text) ? '' : '.'} <!-- ${commit.short} -->`
}

function draft(): void {
  const file = readText(CHANGELOG)
  const commits = commitsSince(lastReleaseTag(), referencedCommits(markdown(file))).filter((commit) => commit.status === 'missing')
  if (commits.length === 0) {
    console.log(c.green(`✔ Rien à ajouter : tous les changements visibles sont déjà mentionnés.\n`))
    return
  }
  for (const category of CHANGELOG_CATEGORIES) {
    const entries = commits.filter((commit) => commit.category === category).map(draftEntry)
    if (entries.length) addEntries(file, category, entries)
  }
  writeText(file)
  console.log(`Ajouté à « ${UNRELEASED} » :`)
  for (const commit of commits) console.log(`  ${c.green('+')} ${commit.category} : ${draftEntry(commit).slice(2)}`)
  console.log(c.dim(`\nCes entrées reprennent les messages des commits : reformule-les pour les utilisateurs.\n`))
}

function prepareVersion(version: string): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new ScriptError(`Numéro de version invalide : ${version} (attendu : 1.2.3).`)
  }
  const file = readText(CHANGELOG)
  const changelog = parseChangelog(markdown(file))
  if (findRelease(changelog, version)) throw new ScriptError(`La version ${version} est déjà dans ${CHANGELOG}.`)
  const previous = changelog.releases.find((release) => release.version !== null)?.version ?? null
  if (previous && compareVersions(version, previous) <= 0) {
    throw new ScriptError(`La version ${version} doit être plus récente que la ${previous}.`)
  }
  const unreleased = changelog.releases.find((release) => release.version === null)
  if (!unreleased || !releaseHasChanges(unreleased)) {
    throw new ScriptError(`La section « ${UNRELEASED} » est vide : il n’y a rien à publier.`)
  }

  // Le contenu de « Non publié » passe sous le titre de la version ; les rubriques vides disparaissent.
  const [start, end] = unreleasedBlock(file)
  const block = file.lines.slice(start, end)
  const kept: string[] = []
  for (let i = 0; i < block.length; i++) {
    if (/^###\s+/.test(block[i])) {
      let next = i + 1
      while (next < block.length && !/^###\s+/.test(block[next])) next++
      if (!block.slice(i + 1, next).some((line) => line.trim() && !/^\s*<!--[\s\S]*-->\s*$/.test(line))) {
        i = next - 1
        continue
      }
    }
    kept.push(block[i])
  }
  while (kept.length && !kept[0].trim()) kept.shift()
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop()
  file.lines.splice(start, end - start, '', `## [${version}] - ${today()}`, '', ...kept, '')

  const tag = `${APP_TAG_PREFIX}${version}`
  setLink(file, UNRELEASED, `${APP_REPO_URL}/compare/${tag}...HEAD`, null)
  setLink(
    file,
    version,
    previous ? `${APP_REPO_URL}/compare/${APP_TAG_PREFIX}${previous}...${tag}` : `${APP_REPO_URL}/releases/tag/${tag}`,
    previous
  )

  const report = validateChangelog(markdown(file), { packageVersion: version })
  if (report.errors.length) {
    printReport(report)
    throw new ScriptError(`${CHANGELOG} n’a pas été modifié : corrige d’abord ces erreurs.`)
  }

  // package.json et package-lock.json, réécrits comme le fait npm (indentation de deux espaces).
  for (const path of ['package.json', 'package-lock.json']) {
    const json = readText(path)
    const data = JSON.parse(markdown(json)) as { version?: string; packages?: Record<string, { version?: string }> }
    data.version = version
    if (data.packages?.['']) data.packages[''].version = version
    json.lines = JSON.stringify(data, null, 2).split('\n')
    writeText(json)
  }
  writeText(file)

  console.log(c.green(`✔ ${CHANGELOG} : la section « ${UNRELEASED} » devient la version ${version} (${today()}).`))
  console.log(c.green(`✔ package.json et package-lock.json : version ${version}.`))
  console.log(`\nRelis l’historique, puis :`)
  console.log(c.dim(`  git commit -am "chore: version ${version}"`))
  console.log(c.dim(`  git tag ${tag}`))
  console.log(c.dim(`  git push origin main ${tag}\n`))
}

function releaseNotes(version: string): void {
  const release = findRelease(parseChangelog(markdown(readText(CHANGELOG))), version)
  if (!release || !releaseHasChanges(release)) {
    throw new ScriptError(
      `La version ${version} n’a pas d’entrée dans ${CHANGELOG} : prépare-la avec « npm run changelog -- --version ${version} ».`
    )
  }
  const installer = `Modding-Manager-Setup-${version}.exe`
  const body = [
    releaseNotesMarkdown(release),
    '---',
    `Télécharge **${installer}** ci-dessous et lance-le. Si Modding Manager (ou Modpack Manager) est déjà installé, il propose lui-même cette mise à jour en haut de sa fenêtre.`,
    'Windows peut afficher « Windows a protégé votre ordinateur » : clique sur **Informations complémentaires**, puis **Exécuter quand même**.',
    `[Historique complet des versions](${APP_REPO_URL}/blob/${APP_TAG_PREFIX}${version}/${CHANGELOG})`
  ].join('\n\n')
  if (args.sortie) {
    writeFileSync(join(root, args.sortie), `${body}\n`)
    console.log(c.green(`✔ Notes de la version ${version} écrites dans ${args.sortie}.`))
  } else {
    process.stdout.write(`${body}\n`)
  }
}

try {
  if (args.notes) releaseNotes(args.notes)
  else if (args.version) prepareVersion(args.version)
  else if (args.brouillon) draft()
  else status()
} catch (err) {
  console.error(c.red(`\n✖ ${err instanceof Error ? err.message : String(err)}\n`))
  process.exit(1)
}
