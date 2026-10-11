// Export au format des modpacks de CurseForge (celui que CurseForge produit lui-même) à partir du zip d'une version :
// manifest.json (projets et fichiers CurseForge, sans les mods eux-mêmes), modlist.html, et dans overrides/ les seuls
// fichiers choisis par le publieur (packs de textures, réglages des shaders…). Format relevé sur les fichiers publiés
// du propriétaire (voir CLAUDE.md).
import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { basename } from 'node:path'
import { ZipArchive } from 'archiver'
import type { Entry, ZipFile } from 'yauzl'
import { CURSEFORGE_INSTANCE_FILE } from '../shared/config'
import { exclusionMatcher } from '../shared/exclusions'
import { baseModFile } from './instanceAddons'
import { StudioError } from './studio/analyze'
import { findRootPrefix, openEntry, openZip, readEntries } from './zip'

type Json = Record<string, unknown>

/** Entrées d'installedAddons qui désignent bien un fichier de CurseForge (projet et fichier connus). */
const curseForgeAddons = (instance: Json) =>
  ((instance.installedAddons as Json[] | undefined) ?? []).filter(
    (a) => Number(a.addonID) > 0 && Number.isInteger(Number((a.installedFile as Json | undefined)?.id)) && Number((a.installedFile as Json).id) > 0
  )

export interface ExportResult {
  /** Projets CurseForge listés dans manifest.json. */
  projects: number
  /** Fichiers mis dans overrides (chemins depuis la racine de l'instance). */
  overrides: string[]
  image: string | null
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function readBuffer(zip: ZipFile, entry: Entry): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of await openEntry(zip, entry)) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/** Chargeur tel que l'écrit l'export de CurseForge : sans la version de Minecraft que CurseForge ajoute à Fabric et Quilt. */
export function manifestLoaderId(loader: string): string {
  return /^((?:fabric|quilt)-[^-]+)-/.exec(loader)?.[1] ?? loader
}

/** manifest.json de CurseForge pour cette instance. */
export function curseForgeManifest(instance: Json, name: string, image: string | null): Json {
  const loader = ((instance.baseModLoader as Json | null)?.name as string | undefined) ?? null
  const addons = curseForgeAddons(instance)
  return {
    minecraft: { version: instance.gameVersion, modLoaders: loader ? [{ id: manifestLoaderId(loader), primary: true }] : [] },
    manifestType: 'minecraftModpack',
    manifestVersion: 1,
    name,
    author: '',
    files: addons.map((a) => ({ projectID: Number(a.addonID), fileID: Number((a.installedFile as Json).id), required: a.isEnabled !== false })),
    overrides: 'overrides',
    ...(image ? { image } : {})
  }
}

/** modlist.html de CurseForge : un lien par projet, avec son auteur. */
export function curseForgeModlist(instance: Json): string {
  const addons = curseForgeAddons(instance)
  const items = addons.map((a) => {
    const author = typeof a.primaryAuthor === 'string' && a.primaryAuthor ? ` (by ${escapeHtml(a.primaryAuthor)})` : ''
    return `<li><a href="${escapeHtml(String(a.webSiteURL ?? ''))}">${escapeHtml(String(a.name ?? a.addonID))}${author}</a></li>`
  })
  return `﻿<ul>\n${items.join('\n')}\n</ul>`
}

/**
 * Crée l'export CurseForge d'une version à partir de son zip. `overrides` : chemins (jokers permis, comme les
 * exclusions) des fichiers à joindre. Refuse un mod du dossier mods que CurseForge ne connaît pas : sa modération le
 * rejetterait.
 */
export async function exportForCurseForge(versionZip: string, destination: string, options: { name: string; overrides: string[] }): Promise<ExportResult> {
  const zip = await openZip(versionZip)
  try {
    const entries = await readEntries(zip)
    const prefix = findRootPrefix(entries, CURSEFORGE_INSTANCE_FILE)
    if (prefix === null) throw new StudioError(`${basename(versionZip)} ne contient pas d’instance CurseForge.`)
    const instance = JSON.parse((await readBuffer(zip, entries.find((e) => e.fileName === prefix + CURSEFORGE_INSTANCE_FILE)!)).toString('utf8').replace(/^﻿/, '')) as Json
    const files = entries.filter((e) => e.fileName.startsWith(prefix) && !e.fileName.endsWith('/')).map((e) => ({ entry: e, path: e.fileName.slice(prefix.length) }))

    // Mods posés à la main : présents dans mods, absents d'installedAddons.
    const known = new Set<string>()
    for (const a of curseForgeAddons(instance)) {
      for (const name of [a.fileNameOnDisk, (a.installedFile as Json | undefined)?.fileName]) {
        if (typeof name === 'string') known.add(baseModFile(name).toLowerCase())
      }
    }
    const untracked = files.filter((f) => /^mods\/[^/]+\.jar(\.disabled)?$/i.test(f.path) && !known.has(baseModFile(f.path.slice(5)).toLowerCase()))
    if (untracked.length) {
      throw new StudioError(
        `Ces mods ne viennent pas de CurseForge et seraient refusés par sa modération : ${untracked.map((f) => f.path.slice(5)).join(', ')}. Installe-les depuis CurseForge, ou retire-les du profil.`
      )
    }

    const wanted = exclusionMatcher(options.overrides)
    const overrides = options.overrides.length ? files.filter((f) => wanted(f.path) && f.path !== CURSEFORGE_INSTANCE_FILE) : []
    const imagePath = typeof instance.profileImagePath === 'string' ? instance.profileImagePath : null
    const imageEntry = imagePath ? files.find((f) => !f.path.includes('/') && f.path.toLowerCase() === basename(imagePath).toLowerCase()) : undefined
    const image = imageEntry ? `profileImage/${imageEntry.path}` : null

    const part = `${destination}.part`
    await new Promise<void>((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 6 } })
      const out = createWriteStream(part)
      out.on('close', () => resolve())
      archive.on('error', reject)
      out.on('error', reject)
      archive.pipe(out)
      archive.append(JSON.stringify(curseForgeManifest(instance, options.name, image), null, 2), { name: 'manifest.json' })
      archive.append(curseForgeModlist(instance), { name: 'modlist.html' })
      const add = async () => {
        for (const f of overrides) archive.append(await readBuffer(zip, f.entry), { name: `overrides/${f.path}` })
        if (imageEntry) archive.append(await readBuffer(zip, imageEntry.entry), { name: image! })
        await archive.finalize()
      }
      add().catch(reject)
    }).catch(async (err) => {
      await rm(part, { force: true })
      throw err
    })
    await rename(part, destination)
    return {
      projects: curseForgeAddons(instance).length,
      overrides: overrides.map((f) => f.path),
      image
    }
  } finally {
    zip.close()
  }
}
