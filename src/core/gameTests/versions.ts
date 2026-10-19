// Versions demandées par les mods, comparées comme le font les chargeurs : prédicats de Fabric (« >=1.2 <2 », « ~1.2 »,
// « ^1.2 », « 1.20.x », « * ») sur des versions sémantiques, plages Maven de Forge et NeoForge (« [47,) », « [1.0,2.0) »).
// Dans le doute (version ou plage illisible, « ${file.jarVersion} » non résolu…), la réponse est null : une vérification
// ne signale jamais ce qu'elle ne comprend pas.

// ---------------------------------------------------------------------------------------------
// Fabric : versions sémantiques étendues (autant de nombres que voulu, pré-version, métadonnées de build ignorées)

interface SemVer {
  core: number[]
  /** null : pas de pré-version ; [] : « 1.21.4- », plus petite que toute pré-version. */
  pre: string[] | null
}

function parseSemVer(text: string): SemVer | null {
  const match = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]*))?(?:\+[0-9A-Za-z.+-]*)?$/.exec(text.trim())
  if (!match) return null
  return { core: match[1].split('.').map(Number), pre: match[2] === undefined ? null : match[2] ? match[2].split('.') : [] }
}

function comparePre(a: string[] | null, b: string[] | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return -1
    if (i >= b.length) return 1
    const [x, y] = [a[i], b[i]]
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)]
    if (nx && ny) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y)
    } else if (nx !== ny) return nx ? -1 : 1
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

function compareSemVer(a: SemVer, b: SemVer): number {
  for (let i = 0; i < Math.max(a.core.length, b.core.length); i++) {
    const diff = (a.core[i] ?? 0) - (b.core[i] ?? 0)
    if (diff) return diff
  }
  return comparePre(a.pre, b.pre)
}

/** Une condition d'un prédicat Fabric, par exemple « >=1.2.3 », « ~1.2 » ou « 1.20.x ». */
function fabricTerm(term: string, version: SemVer): boolean | null {
  if (term === '*' || term === '') return true
  const match = /^(>=|<=|>|<|=|~|\^)?(.+)$/.exec(term)
  if (!match) return null
  const [, op = '=', raw] = match
  // Jokers : « 1.20.x » = même début.
  if (/(^|\.)[xX*](\.|$)/.test(raw)) {
    if (op !== '=') return null
    const parts = raw.split('.')
    const fixed = parts.slice(0, parts.findIndex((p) => /^[xX*]$/.test(p)))
    if (!fixed.every((p) => /^\d+$/.test(p))) return null
    return fixed.every((p, i) => (version.core[i] ?? 0) === Number(p))
  }
  const target = parseSemVer(raw)
  if (!target) return null
  const cmp = compareSemVer(version, target)
  switch (op) {
    case '>=':
      return cmp >= 0
    case '<=':
      return cmp <= 0
    case '>':
      return cmp > 0
    case '<':
      return cmp < 0
    case '=':
      return cmp === 0
    case '~':
      // Même majeure et mineure, au moins cette version.
      return cmp >= 0 && version.core[0] === target.core[0] && (version.core[1] ?? 0) === (target.core[1] ?? 0)
    case '^':
      return cmp >= 0 && version.core[0] === target.core[0]
  }
  return null
}

/**
 * La version satisfait-elle le prédicat Fabric (une chaîne : conditions séparées par des espaces, toutes requises ;
 * un tableau : l'une des chaînes) ? null si l'un des deux est illisible.
 */
export function matchesFabric(predicate: string | string[], version: string): boolean | null {
  const parsed = parseSemVer(version)
  const alternatives = Array.isArray(predicate) ? predicate : [predicate]
  if (!alternatives.length) return true
  if (alternatives.every((p) => p.trim() === '*' || p.trim() === '')) return true
  if (!parsed) return null
  let unknown = false
  for (const alternative of alternatives) {
    const results = alternative.trim().split(/\s+/).map((term) => fabricTerm(term, parsed))
    if (results.every((r) => r === true)) return true
    if (results.some((r) => r === null) && !results.some((r) => r === false)) unknown = true
  }
  return unknown ? null : false
}

// ---------------------------------------------------------------------------------------------
// Forge et NeoForge : versions et plages Maven

// Portage de ComparableVersion de Maven 3.8 (celui de Forge et NeoForge) : « - » ouvre une sous-liste (1.8.2-55 est
// après 1.8-54), une lettre seule suivie d'un chiffre est un qualificatif connu (a1 = alpha1), sinon un qualificatif
// inconnu, rangé après la version finale (1.0.12a est après 1.0.12).

type MavenItem = { kind: 'int'; value: number } | { kind: 'string'; value: string } | { kind: 'list'; items: MavenItem[] }

const QUALIFIERS = ['alpha', 'beta', 'milestone', 'rc', 'snapshot', '', 'sp']
const QUALIFIER_ALIASES: Record<string, string> = { ga: '', final: '', release: '', cr: 'rc' }
const RELEASE_INDEX = '5'

function stringItem(value: string, followedByDigit: boolean): MavenItem {
  if (followedByDigit && value.length === 1) value = { a: 'alpha', b: 'beta', m: 'milestone' }[value] ?? value
  return { kind: 'string', value: QUALIFIER_ALIASES[value] ?? value }
}

const parseItem = (isDigit: boolean, text: string): MavenItem =>
  isDigit ? { kind: 'int', value: Number(text.replace(/^0+(?=\d)/, '')) } : stringItem(text, false)

const isNull = (item: MavenItem) => (item.kind === 'int' ? item.value === 0 : item.kind === 'string' ? item.value === '' : item.items.length === 0)

function normalize(list: MavenItem & { kind: 'list' }) {
  for (let i = list.items.length - 1; i >= 0; i--) {
    const last = list.items[i]
    if (isNull(last)) list.items.splice(i, 1)
    else if (last.kind !== 'list') break
  }
}

function parseMaven(text: string): MavenItem | null {
  const version = text.trim().toLowerCase()
  if (!version || /\s/.test(version) || /[\[\](),]/.test(version)) return null
  const root: MavenItem & { kind: 'list' } = { kind: 'list', items: [] }
  let list = root
  const stack = [root]
  const openList = () => {
    const next: MavenItem & { kind: 'list' } = { kind: 'list', items: [] }
    list.items.push(next)
    list = next
    stack.push(next)
  }
  let isDigit = false
  let start = 0
  for (let i = 0; i < version.length; i++) {
    const c = version[i]
    if (c === '.' || c === '-') {
      list.items.push(i === start ? { kind: 'int', value: 0 } : parseItem(isDigit, version.slice(start, i)))
      start = i + 1
      if (c === '-') openList()
    } else if (c >= '0' && c <= '9') {
      if (!isDigit && i > start) {
        list.items.push(stringItem(version.slice(start, i), true))
        start = i
        openList()
      }
      isDigit = true
    } else {
      if (isDigit && i > start) {
        list.items.push(parseItem(true, version.slice(start, i)))
        start = i
        openList()
      }
      isDigit = false
    }
  }
  if (version.length > start) list.items.push(parseItem(isDigit, version.slice(start)))
  while (stack.length) normalize(stack.pop()!)
  return root
}

const comparableQualifier = (q: string) => {
  const index = QUALIFIERS.indexOf(q)
  return index === -1 ? `${QUALIFIERS.length}-${q}` : String(index)
}
const compareStrings = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1)

function compareItems(a: MavenItem, b: MavenItem | null): number {
  if (a.kind === 'int') {
    if (!b) return a.value === 0 ? 0 : 1
    return b.kind === 'int' ? Math.sign(a.value - b.value) : 1
  }
  if (a.kind === 'string') {
    if (!b) return compareStrings(comparableQualifier(a.value), RELEASE_INDEX)
    if (b.kind === 'string') return compareStrings(comparableQualifier(a.value), comparableQualifier(b.value))
    return -1
  }
  if (!b) return a.items.length ? compareItems(a.items[0], null) : 0
  if (b.kind === 'int') return -1
  if (b.kind === 'string') return 1
  for (let i = 0; i < Math.max(a.items.length, b.items.length); i++) {
    const [l, r] = [a.items[i] ?? null, b.items[i] ?? null]
    const result = l === null ? (r === null ? 0 : -compareItems(r, l)) : compareItems(l, r)
    if (result) return result
  }
  return 0
}

export function compareMaven(a: string, b: string): number | null {
  const [x, y] = [parseMaven(a), parseMaven(b)]
  if (!x || !y) return null
  return compareItems(x, y)
}

/**
 * La version est-elle dans la plage Maven (« [1.0,2.0) », « [47,) », « (,1.2] », « [1.0] », plusieurs plages séparées
 * par des virgules, ou une version seule qui accepte tout) ? null si l'une ou l'autre est illisible.
 */
export function matchesMaven(range: string, version: string): boolean | null {
  const text = range.replace(/\s+/g, '')
  if (!text || text === '*') return true
  if (!/[[\]()]/.test(text)) return parseMaven(text) && parseMaven(version) ? true : null
  if (!parseMaven(version)) return null
  const sets = text.match(/[[(][^\])]*[\])]/g)
  if (!sets || sets.join(',') !== text) return null
  let unknown = false
  for (const set of sets) {
    const [open, close] = [set[0], set.at(-1)]
    const inner = set.slice(1, -1)
    if (!inner.includes(',')) {
      // « [1.0] » : exactement cette version.
      const cmp = compareMaven(version, inner)
      if (cmp === null) unknown = true
      else if (cmp === 0 && open === '[' && close === ']') return true
      continue
    }
    const bounds = inner.split(',')
    if (bounds.length !== 2) {
      unknown = true
      continue
    }
    const [low, high] = bounds
    const lowCmp = low ? compareMaven(version, low) : 1
    const highCmp = high ? compareMaven(version, high) : -1
    if (lowCmp === null || highCmp === null) {
      unknown = true
      continue
    }
    const aboveLow = open === '[' ? lowCmp >= 0 : lowCmp > 0
    const belowHigh = close === ']' ? highCmp <= 0 : highCmp < 0
    if (aboveLow && belowHigh) return true
  }
  return unknown ? null : false
}

/** Plage ou prédicat d'une dépendance, lu selon la famille du mod qui la déclare. */
export function satisfies(ecosystem: 'fabric' | 'forge', constraint: string | string[], version: string): boolean | null {
  if (/\$\{/.test(version)) return null
  if (ecosystem === 'fabric') return matchesFabric(constraint, version)
  return Array.isArray(constraint) ? null : matchesMaven(constraint, version)
}

/** Une contrainte affichée au publieur (« >=1.2 <2 », « [47,) »). */
export const describeConstraint = (constraint: string | string[]) => (Array.isArray(constraint) ? constraint.join(' ou ') : constraint)
