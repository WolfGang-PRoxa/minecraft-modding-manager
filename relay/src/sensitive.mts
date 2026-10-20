import type { ChangedFile } from './github.mts'

// Fichiers par lesquels une correction pourrait atteindre la chaîne de publication (CI et ses secrets, build,
// installeur, dépendances), le relais lui-même ou les consignes des sessions suivantes. Une proposition qui en touche
// un ne se fusionne jamais depuis un mail : le propriétaire la relit et la fusionne lui-même.

const SENSITIVE: RegExp[] = [
  /^\.github\//,
  /^relay\//,
  /^build\//,
  /^scripts\//,
  /^\.claude\//,
  /(^|\/)CLAUDE\.md$/i,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)\.npmrc$/,
  /^electron-builder\.ya?ml$/,
  /^electron\.vite\.config\.[cm]?[jt]s$/,
  /^\.gitattributes$/
]

const isSensitive = (path: string) => SENSITIVE.some((pattern) => pattern.test(path))

/** Chemins sensibles touchés par une proposition (un fichier renommé compte pour ses deux chemins). */
export function sensitiveFiles(files: ChangedFile[]): string[] {
  const paths = files.flatMap((file) => (file.previous_filename ? [file.filename, file.previous_filename] : [file.filename]))
  return [...new Set(paths.filter(isSensitive))]
}
