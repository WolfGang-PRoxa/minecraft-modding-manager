// Remplacer, dans un profil CurseForge, le fichier d'un projet (mod, pack de textures, shader) par un autre fichier
// de CurseForge, comme le ferait CurseForge : téléchargement vérifié, ancien fichier retiré, entrée d'installedAddons
// mise à jour dans le format de CurseForge (voir CLAUDE.md, « Faits CurseForge »). À n'utiliser que sur une copie
// d'essai : le profil d'origine du publieur n'est jamais modifié ainsi.
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { AddonKind } from '../shared/studio'
import type { CfFile } from './curseforgeApi'
import { baseModFile } from './instanceAddons'
import { StudioError } from './studio/analyze'

type Json = Record<string, unknown>

/** Dossier d'un projet dans le profil, d'après sa catégorie. */
export const ADDON_FOLDERS: Record<AddonKind, string> = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }

/** `installedFile` de CurseForge à partir d'un fichier de l'API (mêmes valeurs, autres noms de champs). */
export function installedFileFrom(file: CfFile & Json, previous: Json = {}, fileNameOnDisk = file.fileName): Json {
  return {
    id: file.id,
    fileName: file.fileName,
    fileDate: file.fileDate,
    fileLength: file.fileLength,
    releaseType: file.releaseType,
    fileStatus: file.fileStatus ?? 4,
    downloadUrl: file.downloadUrl,
    isAlternate: false,
    alternateFileId: file.alternateFileId ?? 0,
    serverPackFileId: file.serverPackFileId ?? 0,
    dependencies: file.dependencies.map((d) => ({ addonId: d.modId, type: d.relationType })),
    isAvailable: file.isAvailable,
    modules: ((file.modules as Array<{ name: string; fingerprint: number }> | undefined) ?? []).map((m) => ({
      foldername: m.name,
      fingerprint: m.fingerprint,
      invalidFingerprint: false
    })),
    packageFingerprint: file.fileFingerprint ?? 0,
    gameVersion: file.gameVersions,
    sortableGameVersion: ((file.sortableGameVersions as Json[] | undefined) ?? []).map((v) => ({
      gameVersion: v.gameVersion,
      gameVersionName: v.gameVersionName,
      gameVersionTypeId: v.gameVersionTypeId
    })),
    isCompatibleWithClient: previous.isCompatibleWithClient ?? false,
    isEarlyAccessContent: file.isEarlyAccessContent ?? false,
    restrictProjectFileAccess: previous.restrictProjectFileAccess ?? 0,
    projectStatus: previous.projectStatus ?? 4,
    projectId: file.modId,
    fileNameOnDisk,
    hashes: file.hashes.map((h) => ({ type: h.algo, value: h.value }))
  }
}

/** Télécharge un fichier de CurseForge et vérifie son empreinte SHA-1 ; le fichier n'apparaît qu'une fois vérifié. */
export async function downloadCurseForgeFile(file: CfFile, destination: string, apiKey: string): Promise<void> {
  if (!file.downloadUrl) {
    throw new StudioError(`${file.fileName} : son auteur n’autorise pas le téléchargement hors de CurseForge. Mets-le à jour dans CurseForge.`)
  }
  const expected = file.hashes.find((h) => h.algo === 1)?.value.toLowerCase()
  const part = `${destination}.part`
  let res: Response
  try {
    res = await fetch(file.downloadUrl, { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(300_000) })
  } catch {
    throw new StudioError(`Téléchargement de ${file.fileName} impossible : vérifie ta connexion internet.`)
  }
  if (!res.ok || !res.body) throw new StudioError(`Téléchargement de ${file.fileName} refusé (${res.status}).`)
  const hash = createHash('sha1')
  try {
    await pipeline(
      Readable.fromWeb(res.body as never),
      async function* (source) {
        for await (const chunk of source) {
          hash.update(chunk as Buffer)
          yield chunk
        }
      },
      createWriteStream(part)
    )
    if (expected && hash.digest('hex') !== expected) throw new StudioError(`${file.fileName} est arrivé abîmé (empreinte différente).`)
    await rename(part, destination)
  } catch (err) {
    await rm(part, { force: true })
    throw err
  }
}

/**
 * Remplace dans le profil le fichier d'un projet par `file` : téléchargement, puis ancien fichier retiré et entrée de
 * minecraftinstance.json (objet `instance`, à réécrire ensuite par l'appelant) mise à jour. Un mod désactivé le reste.
 */
export async function replaceAddonFile(
  profilePath: string,
  instance: Json,
  projectId: number,
  kind: AddonKind,
  file: CfFile & Json,
  apiKey: string
): Promise<void> {
  const addons = (instance.installedAddons as Json[] | undefined) ?? []
  const entry = addons.find((a) => Number(a.addonID) === projectId)
  if (!entry) throw new StudioError(`Le projet ${projectId} n’est pas dans ce profil.`)
  const folder = join(profilePath, ADDON_FOLDERS[kind])
  await mkdir(folder, { recursive: true })
  const disabled = entry.isEnabled === false
  const onDisk = disabled ? `${file.fileName}.disabled` : file.fileName
  await downloadCurseForgeFile(file, join(folder, onDisk), apiKey)

  const previous = typeof entry.fileNameOnDisk === 'string' ? entry.fileNameOnDisk : null
  if (previous && baseModFile(previous).toLowerCase() !== file.fileName.toLowerCase()) {
    await rm(join(folder, previous), { force: true })
  }
  const path = join(folder, onDisk)
  entry.installedFile = installedFileFrom(file, (entry.installedFile as Json) ?? {}, file.fileName)
  entry.fileNameOnDisk = onDisk
  entry.filePaths = [path]
  entry.modFolderPath = folder
  entry.dateUpdated = new Date().toISOString()
}
