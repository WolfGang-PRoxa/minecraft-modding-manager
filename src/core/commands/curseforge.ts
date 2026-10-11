import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { StudioError } from '../studio/analyze'
import { packOf, packParam } from './refs'
import { command } from './registry'

const versionParam = z.number().int().positive().describe('Numéro de la version (v28 → 28).')

export const curseforgeLink = command({
  name: 'curseforge link',
  summary: 'Lie un modpack à son projet CurseForge (numéro, adresse de la page ou slug).',
  description:
    'Pour un projet qui a déjà des versions, la numérotation du modpack continue après la plus haute (« _V27 » → la ' +
    'prochaine est la v28) et les fichiers joints à l’export (overrides) sont ceux de sa dernière version. Le projet ' +
    'doit exister : on le crée une fois sur le site de CurseForge.',
  params: z.object({ pack: packParam, project: z.string().min(1).describe('Numéro, slug ou adresse de la page du projet.') }),
  kind: 'write',
  async run({ pack: ref, project }, ctx) {
    const pack = await packOf(ctx, ref)
    return { folder: pack.folder, ...(await ctx.service.linkCurseForge(pack.folder, project)) }
  },
  print: (r) =>
    `${r.folder} est lié à « ${r.name} » (${r.projectId}).${r.highestVersion ? ` Dernière version publiée : V${r.highestVersion}.` : ''}\n` +
    `Fichiers joints : ${r.overrides.join(', ') || 'aucun'}`
})

export const curseforgeTargets = command({
  name: 'curseforge targets',
  summary: 'Règle où un modpack est publié (GitHub ou non) et les fichiers joints à son export CurseForge.',
  description:
    'overrides : chemins depuis la racine de l’instance (jokers *, ?, **/) des fichiers mis dans l’export CurseForge ' +
    '(packs de textures, réglages des shaders…), comme dans la fenêtre d’export de CurseForge. github: false = ' +
    'seulement sur CurseForge (ses releases GitHub ne sont plus touchées). unlink retire le lien avec CurseForge.',
  params: z.object({
    pack: packParam,
    overrides: z.array(z.string()).optional().describe('Fichiers joints à l’export (remplace la liste).'),
    github: z.boolean().optional().describe('Publier aussi sur GitHub.'),
    unlink: z.boolean().optional().describe('Retirer le lien avec le projet CurseForge.')
  }),
  kind: 'write',
  async run({ pack: ref, overrides, github, unlink }, ctx) {
    const pack = await packOf(ctx, ref)
    await ctx.service.updatePublishTargets(pack.folder, { overrides: overrides?.filter((o) => o.trim()), github, unlinkCurseForge: unlink })
    const updated = await packOf(ctx, pack.folder)
    return { folder: updated.folder, github: updated.github, curseforge: updated.curseforge }
  }
})

export const curseforgeExport = command({
  name: 'curseforge export',
  summary: 'Crée l’export CurseForge d’une version dans un fichier, sans l’envoyer, pour le vérifier.',
  params: z.object({ pack: packParam, version: versionParam, output: z.string().min(1).describe('Chemin absolu du zip à créer.') }),
  kind: 'write',
  async run({ pack: ref, version, output }, ctx) {
    if (!isAbsolute(output)) throw new StudioError('Le chemin du zip doit être absolu.')
    const pack = await packOf(ctx, ref)
    return { output, ...(await ctx.service.exportCurseForge(pack.folder, version, output)) }
  },
  print: (r) => `${r.output} : ${r.projects} projets CurseForge, fichiers joints : ${r.overrides.join(', ') || 'aucun'}`
})

export const curseforgePublish = command({
  name: 'curseforge publish',
  summary: 'Met une version en ligne sur le projet CurseForge du modpack (elle passe ensuite en modération).',
  description:
    'Export au format CurseForge (manifest.json, modlist.html, fichiers joints), nom affiché « <nom>_V<N>.zip », notes ' +
    'de la version en Markdown. Irréversible : montre au publieur la version, ses notes et le type (release, beta, ' +
    'alpha) avant, et teste-la d’abord. Refusé si un mod du profil ne vient pas de CurseForge. Le pack serveur reste ' +
    'à joindre à la main sur le site.',
  params: z.object({
    pack: packParam,
    version: versionParam,
    releaseType: z.enum(['release', 'beta', 'alpha']).optional().describe('Type de version (release par défaut).')
  }),
  kind: 'destructive',
  async run({ pack: ref, version, releaseType }, ctx) {
    const pack = await packOf(ctx, ref)
    const fileId = await ctx.service.publishToCurseForge(pack.folder, version, releaseType ?? 'release', (text) => ctx.progress(text))
    return { folder: pack.folder, version, fileId, url: pack.curseforge?.url ? `${pack.curseforge.url}/files/${fileId}` : null }
  },
  print: (r) => `v${r.version} envoyée sur CurseForge (fichier ${r.fileId}), en modération.${r.url ? `\n${r.url}` : ''}`
})

export const curseforgeVersions = command({
  name: 'curseforge versions',
  summary: 'État sur CurseForge des versions publiées d’un modpack (en modération, approuvée, refusée…).',
  params: z.object({ pack: packParam }),
  kind: 'read',
  async run({ pack: ref }, ctx) {
    const pack = await packOf(ctx, ref)
    return { folder: pack.folder, versions: await ctx.service.curseForgeStatuses(pack.folder) }
  },
  print: (r) =>
    Object.keys(r.versions).length
      ? Object.entries(r.versions)
          .map(([v, s]) => `v${v} : ${s.label}${s.displayName ? ` (${s.displayName})` : ''}`)
          .join('\n')
      : `${r.folder} n’a encore aucune version publiée par l’application sur CurseForge.`
})
