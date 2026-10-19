// Publication d'un modpack sur CurseForge : lien avec un projet existant (numérotation et fichiers joints repris de
// ses versions déjà publiées), mise en ligne d'une version (export au format CurseForge + envoi), suivi de la
// modération. Les noms suivent l'usage du propriétaire : fichier « <nom>.zip », affiché « <nom>_V<N>.zip ».
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yauzl from 'yauzl'
import type { CurseForgeVersion, PackCurseForge } from '../../shared/studio'
import type { CfFile, CurseForgeClient } from '../curseforgeApi'
import { curseForgeApis } from '../curseforgeAuth'
import { exportForCurseForge } from '../curseforgeExport'
import { FILE_STATUS_LABELS, type CurseForgeUploader } from '../curseforgeUpload'
import { StudioError } from './analyze'
import { readEntries } from '../zip'

/** Catégorie des modpacks sur CurseForge. */
const MODPACK_CLASS = 4471

/** Numéro de version dans un nom affiché « …_V12.zip » (usage du propriétaire), sinon null. */
export const versionInDisplayName = (displayName: string) => {
  const match = /_V(\d+)(?:\.zip)?$/i.exec(displayName.trim())
  return match ? Number(match[1]) : null
}

/** Nom affiché d'une version sur CurseForge. */
export const displayNameFor = (name: string, version: number) => `${name}_V${version}.zip`

/** Nom de fichier sûr sous Windows, comme ceux que produit l'export de CurseForge. */
export const exportFileName = (name: string) => `${name.replace(/[<>:"/\\|?*]/g, '').replace(/[. ]+$/, '').trim() || 'modpack'}.zip`

/** Identifiant d'un projet d'après sa page (…/minecraft/modpacks/<slug>), son slug ou son numéro. */
export async function resolveProject(client: CurseForgeClient, ref: string | number): Promise<{ id: number; name: string; url: string | null }> {
  const text = String(ref).trim()
  let id = /^\d+$/.test(text) ? Number(text) : null
  if (id === null) {
    const slug = /curseforge\.com\/minecraft\/modpacks\/([^/?#]+)/i.exec(text)?.[1] ?? text
    const found = await client.searchModpackBySlug(slug)
    if (!found) throw new StudioError(`Aucun modpack CurseForge à l’adresse « ${slug} ».`)
    id = found.id
  }
  const [mod] = await client.getMods([id])
  if (!mod) throw new StudioError(`Projet CurseForge ${id} introuvable.`)
  if (mod.classId !== MODPACK_CLASS) throw new StudioError(`« ${mod.name} » n’est pas un modpack sur CurseForge.`)
  return { id: mod.id, name: mod.name, url: mod.links?.websiteUrl ?? null }
}

/** Chemins joints sous overrides/ dans un fichier publié (téléchargé depuis le serveur de fichiers de CurseForge). */
async function publishedOverrides(file: CfFile): Promise<string[]> {
  const url = `${curseForgeApis().cdn}/files/${Math.floor(file.id / 1000)}/${file.id % 1000}/${encodeURIComponent(file.fileName)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) }).catch(() => null)
  if (!res?.ok) return []
  const buffer = Buffer.from(await res.arrayBuffer())
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.fromBuffer(buffer, { lazyEntries: true, autoClose: false }, (err, z) => (err ? reject(err) : resolve(z)))
  ).catch(() => null)
  if (!zip) return []
  try {
    return (await readEntries(zip)).map((e) => e.fileName).filter((n) => n.startsWith('overrides/') && !n.endsWith('/')).map((n) => n.slice('overrides/'.length))
  } finally {
    zip.close()
  }
}

/**
 * Ce que le lien avec un projet existant apporte : le plus grand numéro déjà publié (la numérotation continue) et les
 * fichiers joints à sa dernière version (même choix pour les suivantes).
 */
export async function inspectProject(client: CurseForgeClient, projectId: number): Promise<{ highestVersion: number; overrides: string[] }> {
  const files = (await client.getAllModFiles(projectId)).filter((f) => !f.isServerPack)
  const highestVersion = Math.max(0, ...files.map((f) => versionInDisplayName(f.displayName) ?? 0))
  const latest = files.reduce<CfFile | null>((best, f) => (!best || f.id > best.id ? f : best), null)
  return { highestVersion, overrides: latest ? await publishedOverrides(latest) : [] }
}

export interface PublishInput {
  name: string
  version: number
  versionZip: string
  minecraftVersion: string
  modLoader: string | null
  notes: string
  releaseType: 'release' | 'beta' | 'alpha'
  curseforge: PackCurseForge
  /** Versions déjà sur le projet (projectVersions) : leurs numéros sont pris. */
  published: CurseForgeVersion[]
}

/** Exporte la version au format CurseForge et l'envoie ; renvoie l'identifiant du fichier créé. */
export async function publishVersion(uploader: CurseForgeUploader, input: PublishInput, onStep: (text: string) => void): Promise<number> {
  const same = input.published.find((v) => v.number === input.version)
  if (same || input.curseforge.files[String(input.version)]) {
    const name = same?.displayName ? ` (« ${same.displayName} »)` : ''
    throw new StudioError(`La v${input.version} est déjà sur CurseForge${name} : crée une nouvelle version pour publier un changement.`)
  }
  const taken = [...Object.keys(input.curseforge.files).map(Number), ...input.published.map((v) => v.number ?? 0)]
  const newer = taken.filter((v) => v > input.version)
  if (newer.length) throw new StudioError(`La v${Math.max(...newer)} est déjà sur CurseForge : une version plus ancienne n’y a plus sa place.`)
  const dir = join(tmpdir(), 'modpack-manager', `curseforge-${Date.now()}`)
  await mkdir(dir, { recursive: true })
  try {
    onStep('Export au format CurseForge')
    const file = join(dir, exportFileName(input.name))
    await exportForCurseForge(input.versionZip, file, { name: input.name, overrides: input.curseforge.overrides })
    onStep('Envoi vers CurseForge')
    const gameVersions = await uploader.gameVersionIds(input.minecraftVersion, input.modLoader)
    return await uploader.upload(input.curseforge.projectId, file, {
      displayName: displayNameFor(input.name, input.version),
      changelog: input.notes.trim() || `Version ${input.version}`,
      releaseType: input.releaseType,
      gameVersions
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Toutes les versions du projet, de la plus récente à la plus ancienne : celles que CurseForge liste (approuvées), puis
 * celles envoyées par l'application qu'il ne liste pas (en modération, refusées) ou plus (supprimées depuis le site).
 * Numéro : celui de l'application pour un fichier qu'elle a envoyé, sinon le « _V<N> » du nom affiché.
 */
export async function projectVersions(client: CurseForgeClient, curseforge: PackCurseForge): Promise<CurseForgeVersion[]> {
  const listed = (await client.getAllModFiles(curseforge.projectId)).filter((f) => !f.isServerPack)
  const known = new Set(listed.map((f) => f.id))
  const unlisted = Object.values(curseforge.files).filter((id) => !known.has(id))
  const files = [...listed, ...(unlisted.length ? await client.getFiles(unlisted) : [])]
  const sent = new Map(Object.entries(curseforge.files).map(([version, fileId]) => [fileId, Number(version)]))
  const versions = files.map((file): CurseForgeVersion => {
    const status = Number(file.fileStatus ?? 0)
    return {
      fileId: file.id,
      number: sent.get(file.id) ?? versionInDisplayName(file.displayName),
      status,
      label: FILE_STATUS_LABELS[status] ?? `état ${status}`,
      displayName: file.displayName,
      releaseType: file.releaseType,
      date: file.fileDate || null,
      gameVersions: file.gameVersions ?? [],
      sentByApp: sent.has(file.id),
      url: curseforge.url ? `${curseforge.url}/files/${file.id}` : null
    }
  })
  const found = new Set(files.map((f) => f.id))
  for (const [fileId, version] of sent) {
    if (found.has(fileId)) continue
    versions.push({ fileId, number: version, status: 0, label: 'introuvable sur CurseForge', displayName: '', releaseType: 0, date: null, gameVersions: [], sentByApp: true, url: null })
  }
  return versions.sort((a, b) => b.fileId - a.fileId)
}

/** Garde le fichier exporté pour vérification (commande « curseforge export »). */
export async function exportToFile(input: Pick<PublishInput, 'name' | 'versionZip' | 'curseforge'>, destination: string) {
  return exportForCurseForge(input.versionZip, destination, { name: input.name, overrides: input.curseforge.overrides })
}
