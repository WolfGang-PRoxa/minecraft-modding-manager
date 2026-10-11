import { z } from 'zod'
import { StudioError } from '../studio/analyze'
import { findProfile, packOf, packParam, profileParam } from './refs'
import { command } from './registry'

const fileParam = z.string().min(1).describe('Nom du zip dans le dossier du modpack (par exemple Mon_Pack-v3.zip).')

export const versionsCreate = command({
  name: 'versions create',
  summary: 'Crée la prochaine version d’un modpack en zippant un profil CurseForge.',
  description:
    'Les données du joueur (mondes, captures, journaux…) et les fichiers exclus du modpack ne sont pas zippés. ' +
    'La version reste locale tant qu’elle n’est pas publiée (« publish plan » puis « publish apply »). Le profil ' +
    'devient la source du modpack (« profiles list » compare ensuite ses mods à ceux des versions).',
  params: z.object({
    pack: packParam,
    profile: profileParam,
    includeSaves: z.boolean().optional().describe('Inclure les mondes (dossier saves).')
  }),
  kind: 'write',
  async run({ pack: ref, profile: profileRef, includeSaves }, ctx) {
    const pack = await packOf(ctx, ref)
    const profile = await findProfile(ctx, profileRef)
    const fileName = await ctx.service.zipInstance(
      pack.folder,
      profile.path,
      includeSaves ?? false,
      (done, total) => ctx.progress('Création du zip', done, total),
      ctx.signal
    )
    return { folder: pack.folder, file: fileName, profile: profile.name }
  },
  print: ({ folder, file }) => `${file} créé dans ${folder}.`
})

export const versionsDelete = command({
  name: 'versions delete',
  summary: 'Supprime une version : son zip part à la corbeille et sa release est retirée de GitHub.',
  description: 'Son numéro reste pris : la version suivante ne le réutilise pas.',
  params: z.object({ pack: packParam, version: z.number().int().positive().describe('Numéro de la version.') }),
  kind: 'destructive',
  async run({ pack: ref, version }, ctx) {
    const pack = await packOf(ctx, ref)
    const result = await ctx.service.deleteVersion(pack.folder, version)
    if (!result.ok) throw new StudioError(result.error)
    return { folder: pack.folder, version, releasesRemoved: result.done }
  },
  print: ({ folder, version }) => `v${version} de ${folder} supprimée.`
})

export const versionsStrip = command({
  name: 'versions strip',
  summary: 'Retire d’un zip du modpack les fichiers exclus dans ses réglages (le zip est réécrit).',
  params: z.object({ pack: packParam, file: fileParam }),
  kind: 'destructive',
  async run({ pack: ref, file }, ctx) {
    const pack = await packOf(ctx, ref)
    const removed = await ctx.service.stripExcluded(
      pack.folder,
      file,
      (done, total) => ctx.progress('Réécriture du zip', done, total),
      ctx.signal
    )
    return { folder: pack.folder, file, removed }
  },
  print: ({ file, removed }) => `${removed} fichier(s) retiré(s) de ${file}.`
})

export const versionsContents = command({
  name: 'versions contents',
  summary: 'Contenu d’un zip du modpack : ses mods (avec leur projet CurseForge) et ses fichiers.',
  description: 'Sans path, seuls les dossiers de premier niveau sont détaillés (nombre de fichiers et taille).',
  params: z.object({
    pack: packParam,
    file: fileParam,
    path: z.string().optional().describe('Ne lister que les fichiers sous ce dossier (par exemple config).')
  }),
  kind: 'read',
  async run({ pack: ref, file, path }, ctx) {
    const pack = await packOf(ctx, ref)
    const contents = await ctx.service.zipContents(pack.folder, file)
    const mods = contents.mods.map((m) => ({
      file: m.fileName,
      name: m.name,
      curseforgeProject: m.addonId,
      disabled: m.disabled,
      size: m.size
    }))
    if (path) {
      const prefix = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase() + '/'
      return { mods, files: contents.files.filter((f) => f.path.toLowerCase().startsWith(prefix)) }
    }
    const folders = new Map<string, { files: number; size: number }>()
    for (const entry of contents.files) {
      const top = entry.path.includes('/') ? `${entry.path.split('/')[0]}/` : entry.path
      const folder = folders.get(top) ?? { files: 0, size: 0 }
      folder.files++
      folder.size += entry.size
      folders.set(top, folder)
    }
    return { mods, files: [...folders].map(([name, info]) => ({ path: name, ...info })) }
  }
})

export const versionsFile = command({
  name: 'versions file',
  summary: 'Lit un fichier texte d’un zip du modpack (configuration, script…), coupé à 256 Ko.',
  params: z.object({ pack: packParam, file: fileParam, path: z.string().min(1).describe('Chemin du fichier dans l’instance.') }),
  kind: 'read',
  async run({ pack: ref, file, path }, ctx) {
    const pack = await packOf(ctx, ref)
    const preview = await ctx.service.previewZipEntry(pack.folder, file, path)
    if (preview.kind === 'text') return { path, text: preview.text, truncated: preview.truncated }
    if (preview.kind === 'image') return { path, kind: 'image' }
    return { path, kind: preview.kind }
  },
  print: (result) => result.text ?? `${result.path} : fichier ${result.kind}, non affichable.`
})
