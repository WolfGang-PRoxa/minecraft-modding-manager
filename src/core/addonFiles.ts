// Remplacer, dans un profil CurseForge, le fichier d'un projet (mod, pack de textures, shader) par un autre fichier
// de CurseForge, comme le ferait CurseForge : téléchargement vérifié, ancien fichier retiré, entrée d'installedAddons
// mise à jour dans le format de CurseForge (voir CLAUDE.md, « Faits CurseForge »). À n'utiliser que sur une copie
// d'essai : le profil d'origine du publieur n'est jamais modifié ainsi.
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { AddonKind } from '../shared/studio'
import { CLASS_IDS, type CfFile, type CfMod } from './curseforgeApi'
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
  // Sans empreinte, rien ne permettrait de savoir si le fichier reçu est bien celui publié.
  if (!expected) throw new StudioError(`${file.fileName} n’a pas d’empreinte sur CurseForge : mets-le à jour dans CurseForge.`)
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
    if (hash.digest('hex') !== expected) throw new StudioError(`${file.fileName} est arrivé abîmé (empreinte différente).`)
    await rename(part, destination)
  } catch (err) {
    await rm(part, { force: true })
    throw err
  }
}

/** Télécharge un fichier vers sa destination (avec la clé de l'API : CurseForgeClient.download). */
export type Download = (file: CfFile, destination: string) => Promise<void>

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
  download: Download
): Promise<void> {
  const addons = (instance.installedAddons as Json[] | undefined) ?? []
  const entry = addons.find((a) => Number(a.addonID) === projectId)
  if (!entry) throw new StudioError(`Le projet ${projectId} n’est pas dans ce profil.`)
  const folder = join(profilePath, ADDON_FOLDERS[kind])
  await mkdir(folder, { recursive: true })
  const onDisk = entry.isEnabled === false ? `${file.fileName}.disabled` : file.fileName
  await download(file, join(folder, onDisk))

  const previous = typeof entry.fileNameOnDisk === 'string' ? entry.fileNameOnDisk : null
  if (previous && previous.toLowerCase() !== onDisk.toLowerCase()) await rm(join(folder, previous), { force: true })
  entry.installedFile = installedFileFrom(file, (entry.installedFile as Json) ?? {}, file.fileName)
  entry.fileNameOnDisk = onDisk
  entry.filePaths = [join(folder, onDisk)]
  entry.modFolderPath = folder
  entry.dateUpdated = new Date().toISOString()
}

/**
 * Ajoute au profil un projet qu'il n'avait pas (une dépendance obligatoire) : son fichier, et une entrée
 * d'installedAddons faite sur le modèle d'une entrée existante de la même catégorie (champs propres à CurseForge
 * compris), complétée par ce que l'API dit du projet.
 */
export async function addAddon(
  profilePath: string,
  instance: Json,
  mod: CfMod,
  kind: AddonKind,
  file: CfFile & Json,
  download: Download
): Promise<void> {
  const addons = (instance.installedAddons as Json[] | undefined) ?? []
  if (addons.some((a) => Number(a.addonID) === mod.id)) throw new StudioError(`${mod.name} est déjà dans ce profil.`)
  const folder = join(profilePath, ADDON_FOLDERS[kind])
  await mkdir(folder, { recursive: true })
  await download(file, join(folder, file.fileName))

  const classId = CLASS_IDS[kind]
  const template = addons.find((a) => Number(a.categoryClassID) === classId) ?? addons[0] ?? {}
  const now = new Date().toISOString()
  const installed = installedFileFrom(file, {}, file.fileName)
  const entry: Json = {
    ...structuredClone(template),
    instanceID: randomUUID(),
    addonID: mod.id,
    gameID: 432,
    categoryClassID: classId,
    categoryIds: (mod.categories ?? []).map((c) => c.id),
    gameInstanceID: instance.guid,
    name: mod.name,
    modFolderPath: folder,
    fileNameOnDisk: file.fileName,
    authors: (mod.authors ?? []).map((a) => ({ id: a.id, name: a.name })),
    primaryAuthor: mod.authors?.[0]?.name ?? null,
    primaryCategoryId: mod.primaryCategoryId ?? null,
    webSiteURL: mod.links?.websiteUrl ?? null,
    thumbnailUrl: mod.logo?.thumbnailUrl ?? null,
    installedFile: installed,
    latestFile: structuredClone(installed),
    dateInstalled: now,
    dateUpdated: now,
    isEnabled: true,
    isLocked: false,
    filePaths: [join(folder, file.fileName)],
    preferenceReleaseType: null,
    preferenceAutoInstallUpdates: null,
    preferenceAlternateFile: false,
    preferenceIsIgnored: false,
    isModified: false,
    isWorkingCopy: false,
    isFuzzyMatch: false,
    manifestName: null,
    installedTargets: [],
    allowModDistribution: mod.allowModDistribution ?? null
  }
  if (!template.categorySection) delete entry.categorySection
  addons.push(entry)
  instance.installedAddons = addons
}
