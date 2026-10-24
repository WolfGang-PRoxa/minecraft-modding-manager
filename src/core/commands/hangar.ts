// Hangar (plugins Paper) : clé du publieur, lien d'un plugin avec son projet, versions du projet, mise en ligne.
import { z } from 'zod'
import { hangarAuthStatus } from '../hangar'
import { StudioError } from '../studio/analyze'
import { packOf } from './refs'
import { command } from './registry'

const pluginParam = z.string().min(1).describe('Le plugin : nom de son dossier, identifiant publié ou nom affiché (la casse est ignorée).')

export const hangarStatus = command({
  name: 'hangar status',
  summary: 'Dit si la clé d’API Hangar est disponible et acceptée, et à quel compte elle appartient.',
  description: 'Ne l’affiche jamais. Elle s’enregistre dans l’application (Paramètres → Compte Hangar), pas par une commande.',
  params: z.object({}),
  kind: 'read',
  run: () => hangarAuthStatus({ dotenvDir: process.cwd() }),
  print: (s) =>
    !s.source
      ? 'Clé Hangar : absente'
      : `Clé Hangar : ${s.source === 'saved' ? 'enregistrée dans l’application' : s.source === 'env' ? 'variable d’environnement' : 'fichier .env'}, ${
          s.valid ? `acceptée (compte ${s.username ?? '?'})` : s.valid === false ? 'refusée' : 'non vérifiée'
        }${s.error ? ` (${s.error})` : ''}`
})

export const hangarLink = command({
  name: 'hangar link',
  summary: 'Lie un plugin à son projet Hangar (adresse de la page ou nom du projet), ou retire ce lien.',
  description: 'Le projet se crée une fois sur hangar.papermc.io.',
  params: z.object({
    pack: pluginParam,
    project: z.string().min(1).optional().describe('Adresse (hangar.papermc.io/<auteur>/<projet>) ou nom du projet.'),
    unlink: z.boolean().optional().describe('Retirer le lien.')
  }),
  kind: 'write',
  async run({ pack: ref, project, unlink }, ctx) {
    if (!project === !unlink) throw new StudioError('Donne soit project, soit unlink.')
    const pack = await packOf(ctx, ref)
    if (unlink) {
      await ctx.service.updatePublishTargets(pack.folder, { unlinkHangar: true })
      return { folder: pack.folder, project: null }
    }
    return { folder: pack.folder, project: await ctx.service.linkHangar(pack.folder, project!) }
  },
  print: (r) => (r.project ? `${r.folder} est lié au projet Hangar ${r.project.owner}/${r.project.slug} (${r.project.url}).` : `${r.folder} n’est plus lié à Hangar.`)
})

export const hangarVersions = command({
  name: 'hangar versions',
  summary: 'Versions du projet Hangar d’un plugin, avec la version locale correspondante.',
  params: z.object({ pack: pluginParam }),
  kind: 'read',
  async run({ pack: ref }, ctx) {
    const pack = await packOf(ctx, ref)
    if (!pack.hangar) throw new StudioError(`${pack.name} n’est lié à aucun projet Hangar (hangar link).`)
    return { folder: pack.folder, versions: await ctx.service.hangarVersions(pack.folder) }
  },
  print: (r) =>
    r.versions.length
      ? r.versions.map((v) => `${v.name} : canal ${v.channel}${v.date ? `, ${v.date.slice(0, 10)}` : ''}${v.sentByApp ? ' (envoyée par l’application)' : ''}`).join('\n')
      : `${r.folder} n’a encore aucune version sur Hangar.`
})

export const hangarPublish = command({
  name: 'hangar publish',
  summary: 'Met une version d’un plugin en ligne sur son projet Hangar, pour Paper.',
  description:
    'Le jar, avec ses versions de Minecraft (content minecraft si son api-version ne suffit pas) et ses notes, dans le ' +
    'canal Release (Snapshot avec releaseType beta ou alpha). Irréversible : montre au publieur la version et ses notes avant.',
  params: z.object({
    pack: pluginParam,
    version: z.string().min(1).describe('Version déclarée par plugin.yml (« 2.1.0 »).'),
    releaseType: z.enum(['release', 'beta', 'alpha']).optional().describe('Release (par défaut) ou Snapshot.')
  }),
  kind: 'destructive',
  async run({ pack: ref, version, releaseType }, ctx) {
    const pack = await packOf(ctx, ref)
    const result = await ctx.service.publishToHangar(pack.folder, version, releaseType ?? 'release', (text) => ctx.progress(text))
    return { folder: pack.folder, version: result.version, url: pack.hangar ? `${pack.hangar.url}/versions/${encodeURIComponent(result.version)}` : null }
  },
  print: (r) => [`Version ${r.version} publiée sur Hangar.`, ...(r.url ? [r.url] : [])].join('\n')
})
