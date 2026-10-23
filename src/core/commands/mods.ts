// Les mods du Studio : création depuis le dossier où leur projet dépose ses jars, versions, notes, CurseForge.
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { PackView } from '../../shared/studio'
import { StudioError } from '../studio/analyze'
import { packOf } from './refs'
import { command, type CommandContext } from './registry'

const modParam = z.string().min(1).describe('Le mod : nom de son dossier, identifiant publié ou nom affiché (la casse est ignorée).')
const modVersionParam = z.string().min(1).describe('Version déclarée par le jar (« 1.2.0-26.3 »), comme l’affiche « mods versions ».')

async function modOf(ctx: CommandContext, ref: string): Promise<PackView> {
  const pack = await packOf(ctx, ref)
  if (pack.type !== 'mod') throw new StudioError(`${pack.folder} n’est pas un mod.`)
  return pack
}

export const modsCreate = command({
  name: 'mods create',
  summary: 'Crée un mod depuis le dossier où son projet dépose ses jars (releases, build/libs…), qui lui reste lié.',
  description:
    'Nom, identifiant et description viennent du jar le plus récent ; seule sa version est importée, sauf versions. ' +
    'Une copie du dernier jar sous un autre nom (lma-latest.jar) n’est comptée qu’une fois. L’icône du mod devient ' +
    'son image. Le dossier du projet n’est jamais modifié.',
  params: z.object({
    source: z.string().min(1).describe('Chemin absolu du dossier des jars du mod.'),
    versions: z.array(z.string().min(1)).optional().describe('Versions à importer (toutes celles voulues) ; par défaut la plus récente.')
  }),
  kind: 'write',
  async run({ source, versions }, ctx) {
    if (!isAbsolute(source)) throw new StudioError('Donne le chemin absolu du dossier des jars.')
    return { folder: await ctx.service.createModFromSource(source, versions) }
  },
  print: (r) => `Mod créé : ${r.folder}.`
})

export const modsVersions = command({
  name: 'mods versions',
  summary: 'Versions d’un mod : celles du Studio (état sur GitHub et CurseForge) et celles de son dossier lié à importer.',
  params: z.object({ pack: modParam }),
  kind: 'read',
  async run({ pack: ref }, ctx) {
    const pack = await modOf(ctx, ref)
    const available = pack.source ? await ctx.service.availableModVersions(pack.folder) : []
    return {
      folder: pack.folder,
      source: pack.source,
      versions: pack.modVersions.map((v) => ({
        version: v.version,
        files: v.files.map((f) => ({ file: f.fileName, loaders: f.loaders, minecraftVersions: f.minecraftVersions, side: f.side, dependencies: f.dependencies })),
        github: v.remote,
        curseforgeFileId: v.curseforgeFileId,
        notes: v.notes
      })),
      toImport: available.map((v) => ({ version: v.version, files: v.files.map((f) => f.fileName) })),
      errors: pack.errors
    }
  },
  print: (r) =>
    [
      ...r.versions.map((v) => `${v.version} — ${v.files.map((f) => f.file).join(', ')} · GitHub : ${v.github}${v.curseforgeFileId ? ` · CurseForge : fichier ${v.curseforgeFileId}` : ''}`),
      ...(r.versions.length ? [] : ['Aucune version dans le Studio.']),
      ...(r.toImport.length ? [`À importer depuis ${r.source} : ${r.toImport.map((v) => v.version).join(', ')}`] : []),
      ...r.errors.map((e) => `⚠ ${e}`)
    ].join('\n')
})

export const modsImport = command({
  name: 'mods import',
  summary: 'Copie dans le Studio des versions du dossier lié d’un mod (par défaut la plus récente qui manque).',
  params: z.object({ pack: modParam, versions: z.array(z.string().min(1)).optional().describe('Versions à importer.') }),
  kind: 'write',
  async run({ pack: ref, versions }, ctx) {
    const pack = await modOf(ctx, ref)
    return { folder: pack.folder, imported: await ctx.service.importModVersions(pack.folder, versions) }
  },
  print: (r) => `Importé dans ${r.folder} : ${r.imported.join(', ')}.`
})

export const modsSource = command({
  name: 'mods source',
  summary: 'Lie un mod au dossier où son projet dépose ses jars, ou retire ce lien.',
  params: z.object({
    pack: modParam,
    source: z.string().min(1).optional().describe('Chemin absolu du dossier des jars.'),
    unlink: z.boolean().optional().describe('Retirer le lien.')
  }),
  kind: 'write',
  async run({ pack: ref, source, unlink }, ctx) {
    if (!source === !unlink) throw new StudioError('Donne soit source, soit unlink.')
    if (source && !isAbsolute(source)) throw new StudioError('Donne le chemin absolu du dossier des jars.')
    const pack = await modOf(ctx, ref)
    await ctx.service.linkModSource(pack.folder, source ?? null)
    return { folder: pack.folder, source: source ?? null }
  },
  print: (r) => (r.source ? `${r.folder} prend ses versions dans ${r.source}.` : `${r.folder} n’est plus lié à aucun dossier.`)
})

export const modsNotes = command({
  name: 'mods notes',
  summary: 'Écrit les notes d’une version d’un mod (Markdown), affichées dans la release GitHub et sur CurseForge.',
  params: z.object({ pack: modParam, version: modVersionParam, notes: z.string().describe('Texte complet des notes ; vide pour les effacer.') }),
  kind: 'write',
  async run({ pack: ref, version, notes }, ctx) {
    const pack = await modOf(ctx, ref)
    if (!pack.modVersions.some((v) => v.version === version)) throw new StudioError(`${pack.folder} n’a pas de version ${version}.`)
    await ctx.service.setNotes(pack.folder, version, notes)
    return { folder: pack.folder, version }
  },
  print: (r) => `Notes de la version ${r.version} de ${r.folder} enregistrées.`
})

export const modsDelete = command({
  name: 'mods delete',
  summary: 'Supprime une version d’un mod : ses jars à la corbeille, sa release retirée de GitHub. Son fichier CurseForge reste.',
  params: z.object({ pack: modParam, version: modVersionParam }),
  kind: 'destructive',
  async run({ pack: ref, version }, ctx) {
    const pack = await modOf(ctx, ref)
    const result = await ctx.service.deleteModVersion(pack.folder, version)
    if (!result.ok) throw new StudioError(result.error)
    return { folder: pack.folder, version, releasesRemoved: result.done }
  },
  print: (r) => `Version ${r.version} de ${r.folder} supprimée${r.releasesRemoved ? ', release retirée de GitHub' : ''}.`
})

export const modsCurseforge = command({
  name: 'mods curseforge',
  summary: 'Met une version d’un mod en ligne sur son projet CurseForge (elle passe ensuite en modération).',
  description:
    'Chaque jar est envoyé, nommé comme lui sans « .jar », avec ses versions de Minecraft, son chargeur, son côté ' +
    '(client, serveur) et ses dépendances obligatoires dont l’identifiant est aussi un projet CurseForge (fabric-api…). ' +
    'Irréversible : montre au publieur la version, ses notes et le type avant. Seule une version plus récente que ' +
    'celles déjà envoyées est acceptée. Le projet se lie avec « curseforge link ».',
  params: z.object({
    pack: modParam,
    version: modVersionParam,
    releaseType: z.enum(['release', 'beta', 'alpha']).optional().describe('Type de version (release par défaut).')
  }),
  kind: 'destructive',
  async run({ pack: ref, version, releaseType }, ctx) {
    const pack = await modOf(ctx, ref)
    const result = await ctx.service.publishModToCurseForge(pack.folder, version, releaseType ?? 'release', (text) => ctx.progress(text))
    return { folder: pack.folder, version, ...result, url: pack.curseforge?.url ? `${pack.curseforge.url}/files/${result.fileIds[0]}` : null }
  },
  print: (r) =>
    [
      `Version ${r.version} envoyée sur CurseForge (fichier ${r.fileIds.join(', ')}), en modération.`,
      ...(r.unknownDependencies.length ? [`Dépendances introuvables sur CurseForge, à lier depuis le site : ${r.unknownDependencies.join(', ')}.`] : []),
      ...(r.url ? [r.url] : [])
    ].join('\n')
})

