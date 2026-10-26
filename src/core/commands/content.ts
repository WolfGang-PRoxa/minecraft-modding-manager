// Les contenus du Studio qui ne sont pas des modpacks : mods (dossier lié où leur projet dépose ses jars), packs de
// ressources et shaders (dossier du pack en cours de création, ou zips) ; versions, notes, CurseForge.
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { PackView } from '../../shared/studio'
import { StudioError } from '../studio/analyze'
import { CONTENT_KINDS, type ContentKind } from '../../shared/content'
import { packOf } from './refs'
import { command, type CommandContext } from './registry'

const modParam = z.string().min(1).describe('Le contenu (mod, pack de ressources, shader) : nom de son dossier, identifiant publié ou nom affiché.')
const modVersionParam = z
  .string()
  .min(1)
  .describe('Version : celle du jar pour un mod (« 1.2.0-26.3 »), le numéro pour un pack de ressources ou un shader (« 3 »), comme l’affiche « content versions ».')

/** Un contenu qui n'est pas un modpack ; `kinds` : ceux acceptés par la commande. */
async function modOf(ctx: CommandContext, ref: string, kinds: ContentKind[] = ['mod', 'resourcepack', 'shader', 'plugin']): Promise<PackView> {
  const pack = await packOf(ctx, ref)
  if (!kinds.includes(pack.type)) {
    throw new StudioError(`${pack.folder} est un ${CONTENT_KINDS[pack.type].label} : cette commande vise les ${kinds.map((k) => CONTENT_KINDS[k].plural).join(' ou les ')}.`)
  }
  return pack
}

export const contentCreate = command({
  name: 'content create',
  summary: 'Crée un mod, un pack de ressources ou un shader dans le dossier des contenus.',
  description:
    'Mod (type mod) : depuis le dossier où son projet dépose ses jars (releases, build/libs…), qui reste lié ; nom, ' +
    'identifiant, description et icône viennent du jar le plus récent, seule sa version est importée sauf versions. ' +
    'Pack de ressources (resourcepack) ou shader : depuis le dossier du pack en cours de création (qui reste lié, et ' +
    'dont la v1 est zippée) ou depuis un zip (copié comme v1). Le dossier source n’est jamais modifié.',
  params: z.object({
    source: z.string().min(1).describe('Chemin absolu : dossier des jars d’un mod ou d’un plugin, dossier ou zip d’un pack.'),
    type: z.enum(['mod', 'resourcepack', 'shader', 'plugin']).optional().describe('Type de contenu (mod par défaut).'),
    versions: z.array(z.string().min(1)).optional().describe('Mod : versions à importer ; par défaut la plus récente.')
  }),
  kind: 'write',
  async run({ source, type, versions }, ctx) {
    if (!isAbsolute(source)) throw new StudioError('Donne un chemin absolu.')
    const kind = type ?? 'mod'
    const folder =
      kind === 'mod' || kind === 'plugin' ? await ctx.service.createModFromSource(source, versions, kind) : await ctx.service.createPackContent(kind, source)
    return { folder, type: kind }
  },
  print: (r) => `${CONTENT_KINDS[r.type].label.replace(/^./, (c) => c.toUpperCase())} créé : ${r.folder}.`
})

export const contentZip = command({
  name: 'content zip',
  summary: 'Zippe le dossier lié d’un pack de ressources ou d’un shader comme sa version suivante.',
  params: z.object({ pack: modParam }),
  kind: 'write',
  async run({ pack: ref }, ctx) {
    const pack = await modOf(ctx, ref, ['resourcepack', 'shader'])
    return { folder: pack.folder, number: await ctx.service.zipContentVersion(pack.folder) }
  },
  print: (r) => `v${r.number} de ${r.folder} créée depuis son dossier.`
})

export const contentMinecraft = command({
  name: 'content minecraft',
  summary: 'Donne les versions de Minecraft d’un pack de ressources, d’un shader ou d’un plugin.',
  description:
    'Elles remplacent celles du fichier (pack.mcmeta, api-version d’un plugin, qui n’est que la plus ancienne visée) ; ' +
    'une liste vide revient à celles du fichier. Un shader ne les déclare pas. CurseForge, Modrinth et Hangar les exigent.',
  params: z.object({ pack: modParam, versions: z.array(z.string().min(1)).describe('Versions de Minecraft (« 26.3 »).') }),
  kind: 'write',
  async run({ pack: ref, versions }, ctx) {
    const pack = await modOf(ctx, ref, ['resourcepack', 'shader', 'plugin'])
    return { folder: pack.folder, versions: await ctx.service.setMinecraftVersions(pack.folder, versions) }
  },
  print: (r) => (r.versions.length ? `${r.folder} : Minecraft ${r.versions.join(', ')}.` : `${r.folder} : versions lues dans le zip.`)
})

export const contentVersions = command({
  name: 'content versions',
  summary: 'Versions d’un mod, d’un pack de ressources ou d’un shader (état sur GitHub et CurseForge), et pour un mod celles de son dossier lié à importer.',
  params: z.object({ pack: modParam }),
  kind: 'read',
  async run({ pack: ref }, ctx) {
    const pack = await modOf(ctx, ref)
    const available = pack.source && pack.type === 'mod' ? await ctx.service.availableModVersions(pack.folder) : []
    return {
      folder: pack.folder,
      source: pack.source,
      versions: pack.contentVersions.map((v) => ({
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

export const contentImport = command({
  name: 'content import',
  summary: 'Copie dans le Studio des versions du dossier lié d’un mod (par défaut la plus récente qui manque).',
  params: z.object({ pack: modParam, versions: z.array(z.string().min(1)).optional().describe('Versions à importer.') }),
  kind: 'write',
  async run({ pack: ref, versions }, ctx) {
    const pack = await modOf(ctx, ref, ['mod', 'plugin'])
    return { folder: pack.folder, imported: await ctx.service.importModVersions(pack.folder, versions) }
  },
  print: (r) => `Importé dans ${r.folder} : ${r.imported.join(', ')}.`
})

export const contentSource = command({
  name: 'content source',
  summary: 'Lie un contenu à son dossier (jars d’un mod, dossier d’un pack en cours de création), ou retire ce lien.',
  params: z.object({
    pack: modParam,
    source: z.string().min(1).optional().describe('Chemin absolu du dossier.'),
    unlink: z.boolean().optional().describe('Retirer le lien.')
  }),
  kind: 'write',
  async run({ pack: ref, source, unlink }, ctx) {
    if (!source === !unlink) throw new StudioError('Donne soit source, soit unlink.')
    if (source && !isAbsolute(source)) throw new StudioError('Donne le chemin absolu du dossier.')
    const pack = await modOf(ctx, ref)
    await ctx.service.linkModSource(pack.folder, source ?? null)
    return { folder: pack.folder, source: source ?? null }
  },
  print: (r) => (r.source ? `${r.folder} prend ses versions dans ${r.source}.` : `${r.folder} n’est plus lié à aucun dossier.`)
})

export const contentNotes = command({
  name: 'content notes',
  summary: 'Écrit les notes d’une version d’un contenu (Markdown), affichées dans la release GitHub, sur CurseForge et Modrinth.',
  params: z.object({ pack: modParam, version: modVersionParam, notes: z.string().describe('Texte complet des notes ; vide pour les effacer.') }),
  kind: 'write',
  async run({ pack: ref, version, notes }, ctx) {
    const pack = await modOf(ctx, ref)
    if (!pack.contentVersions.some((v) => v.version === version)) throw new StudioError(`${pack.folder} n’a pas de version ${version}.`)
    await ctx.service.setNotes(pack.folder, version, notes)
    return { folder: pack.folder, version }
  },
  print: (r) => `Notes de la version ${r.version} de ${r.folder} enregistrées.`
})

export const contentDelete = command({
  name: 'content delete',
  summary: 'Supprime une version d’un contenu : ses fichiers à la corbeille, sa release retirée de GitHub. Ses fichiers CurseForge et Modrinth restent.',
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

export const contentCurseforge = command({
  name: 'content curseforge',
  summary: 'Met une version d’un mod, d’un pack de ressources ou d’un shader en ligne sur son projet CurseForge (elle passe ensuite en modération). Pas les plugins.',
  description:
    'Chaque fichier est envoyé (nommé comme le jar sans « .jar » pour un mod, « <nom> v<N> » pour un pack), avec ses versions de Minecraft, son chargeur, son côté ' +
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

