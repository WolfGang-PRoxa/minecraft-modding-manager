// Mods, packs de ressources et shaders que le joueur ajoute, depuis la Bibliothèque, à un profil installé par
// l'application. Seulement ces profils-là : ils ont le marqueur, où chaque ajout est noté pour être gardé quand le
// modpack se met à jour (son dossier mods est alors remplacé ; resourcepacks et shaderpacks gardent les ajouts).
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { INSTANCE_MARKER_FILE } from '../shared/config'
import type { ContentRelease, ContentReleaseFile, InstalledExtra, InstanceMarker } from '../shared/types'
import { pathExists, removeQuietly, renameWithRetry, writeJsonAtomic } from './fsutil'
import { readInstanceMarker } from './previousIdentity'
import { StudioError } from './studio/analyze'

/** Dossier du profil où va chaque type de contenu. */
export const EXTRA_FOLDERS: Record<ContentRelease['kind'], string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
  plugin: 'plugins'
}

/** Télécharge `url` vers `destination` ; doit refuser un fichier dont l'empreinte SHA-256 n'est pas `sha256`. */
export type ExtraDownload = (url: string, destination: string, sha256: string) => Promise<void>

async function markerOf(profilePath: string): Promise<InstanceMarker> {
  const marker = await readInstanceMarker<InstanceMarker>(profilePath)
  if (!marker) throw new StudioError('Ce profil n’a pas été installé par l’application : rien ne peut y être ajouté.')
  return marker
}

/** Le fichier tel qu'il est sur le disque : un mod désactivé dans CurseForge prend le suffixe .disabled. */
async function presentPath(profilePath: string, file: string): Promise<string | null> {
  for (const candidate of [join(profilePath, file), join(profilePath, `${file}.disabled`)]) if (await pathExists(candidate)) return candidate
  return null
}

/**
 * Ajoute un fichier d'une version publiée au profil, ou remplace la version déjà ajoutée de ce contenu. Refusé si un
 * fichier du même nom est déjà là sans venir de la Bibliothèque (fourni par le modpack, ou posé à la main).
 */
export async function installExtra(profilePath: string, release: ContentRelease, file: ContentReleaseFile, download: ExtraDownload): Promise<InstalledExtra> {
  const marker = await markerOf(profilePath)
  const folder = EXTRA_FOLDERS[release.kind]
  const rel = `${folder}/${file.name}`
  const target = resolve(profilePath, rel)
  if (dirname(target) !== resolve(profilePath, folder) || relative(profilePath, target).startsWith('..')) throw new StudioError(`Nom de fichier refusé : ${file.name}.`)
  const extras = marker.extras ?? []
  const previous = extras.find((e) => e.kind === release.kind && e.id === release.id) ?? null
  if (previous?.version === release.version && (await presentPath(profilePath, previous.file))) {
    throw new StudioError(`${release.name} ${release.version} est déjà dans ce profil.`)
  }
  const owned = (path: string) => extras.some((e) => e.file.toLowerCase() === path.toLowerCase())
  if ((await presentPath(profilePath, rel)) && !owned(rel)) {
    throw new StudioError(`${rel} est déjà dans ce profil (fourni par le modpack ou ajouté à la main) : rien n’a été changé.`)
  }
  await mkdir(dirname(target), { recursive: true })
  const partial = `${target}.part`
  try {
    await download(file.url, partial, file.sha256)
    // Le fichier qu'il remplace (version précédente) part d'abord : un mod présent deux fois ne démarre pas.
    if (previous) {
      const old = await presentPath(profilePath, previous.file)
      if (old) await rm(old, { force: true })
    }
    await renameWithRetry(partial, target)
  } finally {
    await removeQuietly(partial)
  }
  const extra: InstalledExtra = {
    kind: release.kind,
    id: release.id,
    name: release.name,
    version: release.version,
    file: rel,
    sha256: file.sha256,
    installedAt: new Date().toISOString()
  }
  await writeJsonAtomic(join(profilePath, INSTANCE_MARKER_FILE), { ...marker, extras: [...extras.filter((e) => e !== previous), extra] })
  return extra
}

/** Retire un contenu ajouté depuis la Bibliothèque (son fichier, même désactivé, et sa ligne du marqueur). */
export async function removeExtra(profilePath: string, kind: ContentRelease['kind'], id: string): Promise<void> {
  const marker = await markerOf(profilePath)
  const extras = marker.extras ?? []
  const extra = extras.find((e) => e.kind === kind && e.id === id)
  if (!extra) throw new StudioError('Ce contenu n’a pas été ajouté à ce profil depuis la Bibliothèque.')
  const present = await presentPath(profilePath, extra.file)
  if (present) await rm(present, { force: true })
  await writeJsonAtomic(join(profilePath, INSTANCE_MARKER_FILE), { ...marker, extras: extras.filter((e) => e !== extra) })
}

/**
 * Mise à jour du modpack : remet dans la nouvelle version (dossier de travail) les ajouts du joueur que l'ancienne
 * contenait encore. Un fichier que la nouvelle version fournit sous le même nom lui revient : l'ajout est oublié.
 * Renvoie les ajouts gardés, à noter dans le nouveau marqueur.
 */
export async function carryOverExtras(oldDir: string, newDir: string, extras: InstalledExtra[], shippedByNew: Set<string>): Promise<InstalledExtra[]> {
  const kept: InstalledExtra[] = []
  for (const extra of extras) {
    if (shippedByNew.has(extra.file.toLowerCase())) continue
    const inNew = await presentPath(newDir, extra.file)
    if (inNew) {
      kept.push(extra)
      continue
    }
    const old = await presentPath(oldDir, extra.file)
    if (!old) continue
    const target = join(newDir, relative(oldDir, old))
    await mkdir(dirname(target), { recursive: true })
    await copyFile(old, target)
    kept.push(extra)
  }
  return kept
}
