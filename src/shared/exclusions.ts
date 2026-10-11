// Fichiers exclus des versions d'un modpack : des chemins relatifs au dossier de l'instance, séparés par « / ».
// Un chemin exclut le fichier ou le dossier qu'il désigne, avec tout son contenu. Dans un chemin, « * » remplace
// n'importe quels caractères d'un nom, « ? » un seul caractère, et « ** » n'importe quelle suite de dossiers
// (« **/*.log » : tous les .log). La casse est ignorée, comme sous Windows. Le fichier du profil
// (minecraftinstance.json, à la racine) n'est jamais exclu : sans lui, il n'y a plus d'instance.
import { CURSEFORGE_INSTANCE_FILE, INSTANCE_MARKER_FILE } from './config'

/** Données propres à la partie du publieur, jamais publiées quand une version est créée depuis CurseForge. */
export const DEFAULT_EXCLUSIONS = [
  'saves',
  'screenshots',
  'logs',
  'crash-reports',
  'backups',
  'local',
  'downloads',
  '.mixin.out',
  'journeymap/data',
  'xaero',
  'xaerowaypoints',
  'xaeroworldmap',
  'usercache.json',
  'usernamecache.json',
  'command_history.txt',
  // Identité du profil du publieur (son guid) : chaque installation reçoit la sienne.
  '.curseclient',
  INSTANCE_MARKER_FILE
]

/** Met un chemin saisi au format des exclusions ; null s'il est vide ou s'il sortirait de l'instance. */
export function normalizeExclusion(input: string): string | null {
  const path = input
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+|\/+$/g, '')
  if (!path || path.split('/').some((part) => part === '..' || part === '.' || part.trim() === '')) return null
  return path
}

/** Exclusions dédoublonnées (casse ignorée), dans l'ordre de saisie. */
export function normalizeExclusions(inputs: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const input of inputs) {
    const path = normalizeExclusion(input)
    if (!path || seen.has(path.toLowerCase())) continue
    seen.add(path.toLowerCase())
    result.push(path)
  }
  return result
}

const hasWildcard = (pattern: string) => /[*?]/.test(pattern)

/** Le fichier du profil, à la racine de l'instance : jamais exclu. */
export const isInstanceFile = (path: string) => path.toLowerCase() === CURSEFORGE_INSTANCE_FILE

function toRegExp(pattern: string): RegExp {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*' && pattern[i + 1] === '*') {
      // « **/ » : aucun dossier ou plusieurs ; « ** » ailleurs : tout le reste du chemin.
      if (pattern[i + 2] === '/') {
        source += '(?:.*/)?'
        i += 2
      } else {
        source += '.*'
        i++
      }
    } else if (char === '*') source += '[^/]*'
    else if (char === '?') source += '[^/]'
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`, 'i')
}

/**
 * Fonction qui dit si un chemin est exclu : lui-même, ou l'un des dossiers qui le contiennent. Elle renvoie le
 * chemin (ou le dossier) qui a provoqué l'exclusion, sinon null.
 */
export function exclusionMatcher(patterns: string[]): (path: string) => string | null {
  const exact = new Set<string>()
  const globs: RegExp[] = []
  for (const pattern of normalizeExclusions(patterns)) {
    if (hasWildcard(pattern)) globs.push(toRegExp(pattern))
    else exact.add(pattern.toLowerCase())
  }
  if (exact.size === 0 && globs.length === 0) return () => null
  return (path) => {
    const parts = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').split('/')
    if (parts.length === 1 && isInstanceFile(parts[0])) return null
    let prefix = ''
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part
      if (exact.has(prefix.toLowerCase()) || globs.some((re) => re.test(prefix))) return prefix
    }
    return null
  }
}
