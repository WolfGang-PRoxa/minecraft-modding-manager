// Modrinth : jeton du publieur, lien d'un mod avec son projet, versions du projet, mise en ligne d'une version.
import { z } from 'zod'
import { modrinthAuthStatus } from '../modrinth'
import { StudioError } from '../studio/analyze'
import { packOf } from './refs'
import { command } from './registry'

const modParam = z.string().min(1).describe('Le mod : nom de son dossier, identifiant publié ou nom affiché (la casse est ignorée).')

export const modrinthStatus = command({
  name: 'modrinth status',
  summary: 'Dit si le jeton Modrinth est disponible et accepté, et à quel compte il appartient.',
  description: 'Ne l’affiche jamais. Il s’enregistre dans l’application (Paramètres → Compte Modrinth), pas par une commande.',
  params: z.object({}),
  kind: 'read',
  run: () => modrinthAuthStatus({ dotenvDir: process.cwd() }),
  print: (s) =>
    !s.source
      ? 'Jeton Modrinth : absent'
      : `Jeton Modrinth : ${s.source === 'saved' ? 'enregistré dans l’application' : s.source === 'env' ? 'variable d’environnement' : 'fichier .env'}, ${
          s.valid ? `accepté (compte ${s.username ?? '?'})` : s.valid === false ? 'refusé' : 'non vérifié'
        }${s.error ? ` (${s.error})` : ''}`
})

export const modrinthLink = command({
  name: 'modrinth link',
  summary: 'Lie un mod à son projet Modrinth (adresse de la page, slug ou identifiant), ou retire ce lien.',
  description: 'Le projet se crée une fois sur le site de Modrinth. Les versions mises en ligne depuis le site sont reconnues au nom de leurs fichiers.',
  params: z.object({
    pack: modParam,
    project: z.string().min(1).optional().describe('Adresse (modrinth.com/mod/…), slug ou identifiant du projet.'),
    unlink: z.boolean().optional().describe('Retirer le lien.')
  }),
  kind: 'write',
  async run({ pack: ref, project, unlink }, ctx) {
    if (!project === !unlink) throw new StudioError('Donne soit project, soit unlink.')
    const pack = await packOf(ctx, ref)
    if (unlink) {
      await ctx.service.updatePublishTargets(pack.folder, { unlinkModrinth: true })
      return { folder: pack.folder, project: null }
    }
    return { folder: pack.folder, project: await ctx.service.linkModrinth(pack.folder, project!) }
  },
  print: (r) => (r.project ? `${r.folder} est lié au projet Modrinth ${r.project.slug} (${r.project.url}).` : `${r.folder} n’est plus lié à Modrinth.`)
})

export const modrinthVersions = command({
  name: 'modrinth versions',
  summary: 'Versions du projet Modrinth d’un mod, de la plus récente à la plus ancienne, avec la version locale correspondante.',
  params: z.object({ pack: modParam }),
  kind: 'read',
  async run({ pack: ref }, ctx) {
    const pack = await packOf(ctx, ref)
    if (!pack.modrinth) throw new StudioError(`${pack.name} n’est lié à aucun projet Modrinth (modrinth link).`)
    return { folder: pack.folder, versions: await ctx.service.modrinthVersions(pack.folder) }
  },
  print: (r) =>
    r.versions.length
      ? r.versions
          .map((v) => `${v.versionNumber} : ${v.name}, ${v.status}${v.date ? `, ${v.date.slice(0, 10)}` : ''}${v.version ? ` → ${v.version}` : ''}${v.sentByApp ? ' (envoyée par l’application)' : ''}`)
          .join('\n')
      : `${r.folder} n’a encore aucune version sur Modrinth.`
})

export const modrinthPublish = command({
  name: 'modrinth publish',
  summary: 'Met une version d’un mod en ligne sur son projet Modrinth.',
  description:
    'Ses jars, nommée « <nom> <version> », numéro = version du jar, avec ses versions de Minecraft, ses chargeurs, ses ' +
    'notes et ses dépendances obligatoires dont l’identifiant est aussi un projet Modrinth (fabric-api…). Visible tout ' +
    'de suite si le projet est approuvé : montre au publieur la version et ses notes avant. Seule une version plus ' +
    'récente que celles déjà envoyées est acceptée.',
  params: z.object({
    pack: modParam,
    version: z.string().min(1).describe('Version déclarée par le jar (« 1.2.0-26.3 »).'),
    releaseType: z.enum(['release', 'beta', 'alpha']).optional().describe('Type de version (release par défaut).')
  }),
  kind: 'destructive',
  async run({ pack: ref, version, releaseType }, ctx) {
    const pack = await packOf(ctx, ref)
    const result = await ctx.service.publishModToModrinth(pack.folder, version, releaseType ?? 'release', (text) => ctx.progress(text))
    return { folder: pack.folder, version, ...result, url: pack.modrinth ? `${pack.modrinth.url}/version/${result.versionId}` : null }
  },
  print: (r) =>
    [
      `Version ${r.version} publiée sur Modrinth.`,
      ...(r.unknownDependencies.length ? [`Dépendances introuvables sur Modrinth, à ajouter depuis le site : ${r.unknownDependencies.join(', ')}.`] : []),
      ...(r.url ? [r.url] : [])
    ].join('\n')
})
