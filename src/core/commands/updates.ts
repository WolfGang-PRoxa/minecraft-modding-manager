import { z } from 'zod'
import type { AddonUpdate, TrialResult, UpdatePlan } from '../../shared/studio'
import { CurseForgeClient } from '../curseforgeApi'
import { StudioError } from '../studio/analyze'
import { trialPathOf } from '../trialUpdates'
import { findProfile, packOf } from './refs'
import { command, type CommandContext } from './registry'

const target = {
  pack: z.string().min(1).optional().describe('Le modpack : on travaille sur son profil CurseForge source.'),
  profile: z.string().min(1).optional().describe('Ou directement un profil CurseForge (nom, guid ou dossier).')
}

/** Le profil visé : celui donné, sinon le profil source du modpack donné. */
async function profileFor(ctx: CommandContext, pack?: string, profile?: string): Promise<string> {
  if (!pack === !profile) throw new StudioError('Donne soit pack, soit profile.')
  if (profile) return (await findProfile(ctx, profile)).path
  const view = await packOf(ctx, pack!)
  const library = await ctx.service.library()
  const source = library.folders.flatMap((f) => f.profiles).find((p) => p.pack?.folder === view.folder)
  if (!source) throw new StudioError(`${view.folder} n’a pas de profil CurseForge source : lie-le avec « packs link ».`)
  return source.path
}

const RELEASE = ['', '', ' (bêta)', ' (alpha)']

function printUpdate(u: AddonUpdate): string {
  const to = `${u.to.fileName}${RELEASE[u.to.releaseType] ?? ''}${u.downloadable ? '' : ' (à faire dans CurseForge)'}`
  if (!u.from) return `  + ${u.name} : ${to} (dépendance de ${u.requiredBy.join(', ')})`
  return `  ~ ${u.name} : ${u.from.fileName} → ${to}`
}

export const updatesCheck = command({
  name: 'updates check',
  summary: 'Cherche sur CurseForge les mises à jour des mods, packs de textures et shaders d’un profil (sans rien changer).',
  description:
    'Même version de Minecraft et même chargeur que le profil ; dépendances obligatoires manquantes ajoutées. Demande la ' +
    'clé de l’API CurseForge (curseforge status). Les fichiers posés à la main (untracked) ne sont jamais mis à jour. ' +
    'Pour juger une mise à jour, lis ses notes de version avec « updates changelog ».',
  params: z.object({
    ...target,
    beta: z.boolean().optional().describe('Accepter aussi les versions bêta (par défaut : versions stables seulement).')
  }),
  kind: 'read',
  async run({ pack, profile, beta }, ctx) {
    return ctx.service.checkUpdates(await profileFor(ctx, pack, profile), beta ? 'beta' : 'release')
  },
  print: (plan: UpdatePlan) =>
    [
      `${plan.profile} — Minecraft ${plan.minecraftVersion}${plan.modLoader ? ` · ${plan.modLoader}` : ''} · ${plan.checked} projet(s) vérifié(s)`,
      ...(plan.updates.length ? plan.updates.map(printUpdate) : ['  Tout est à jour.']),
      ...plan.warnings.map((w) => `  ⚠ ${w}`),
      ...(plan.untracked.length ? [`  Posés à la main, non suivis : ${plan.untracked.join(', ')}`] : [])
    ].join('\n')
})

export const updatesApply = command({
  name: 'updates apply',
  summary: 'Crée la copie d’essai « <profil> (essai) » avec les mises à jour du profil ; le profil d’origine n’est pas touché.',
  description:
    'L’essai apparaît dans CurseForge après sa relance : le publieur peut y jouer. Une mise à jour dont l’auteur interdit ' +
    'le téléchargement hors de CurseForge est laissée de côté (skipped) : elle se fait dans CurseForge. Ensuite : ' +
    '« updates promote » reporte l’essai dans le profil d’origine, « updates discard » l’abandonne.',
  params: z.object({
    ...target,
    beta: z.boolean().optional().describe('Accepter aussi les versions bêta.'),
    only: z.array(z.number().int().positive()).optional().describe('Seulement ces projets CurseForge (projectId de « updates check »).')
  }),
  kind: 'write',
  async run({ pack, profile, beta, only }, ctx) {
    const path = await profileFor(ctx, pack, profile)
    return ctx.service.applyUpdatesToTrial(path, { channel: beta ? 'beta' : 'release', only }, (done, total, name) =>
      ctx.progress(name ? `Mise à jour : ${name}` : 'Mises à jour appliquées', done, total)
    )
  },
  print: (result: TrialResult) =>
    [
      `Essai créé : ${result.trialPath}`,
      ...result.applied.map(printUpdate),
      ...result.skipped.map((s) => `  ✖ ${s.update.name} : ${s.reason}`),
      'Relance CurseForge pour le voir et y jouer, puis « updates promote » (garder) ou « updates discard » (abandonner).'
    ].join('\n')
})

export const updatesPromote = command({
  name: 'updates promote',
  summary: 'Reporte l’essai validé dans le profil d’origine, puis met l’essai à la corbeille.',
  description:
    'Seuls les fichiers des projets changés ou ajoutés sont reportés ; mondes, réglages et mods désactivés du profil ' +
    'd’origine restent les siens. CurseForge est fermé le temps de l’écriture, puis rouvert. Refusé si Minecraft tourne ' +
    'depuis le profil ou son essai. Ensuite, « versions create » en fait une nouvelle version du modpack.',
  params: z.object(target),
  kind: 'destructive',
  async run({ pack, profile }, ctx) {
    const path = await profileFor(ctx, pack, profile)
    return { profile: path, promoted: await ctx.service.promoteTrial(path) }
  },
  print: ({ promoted }) => `Essai reporté : ${promoted.join(', ') || 'rien à reporter'}.`
})

export const updatesDiscard = command({
  name: 'updates discard',
  summary: 'Abandonne l’essai d’un profil (corbeille) ; le profil d’origine n’est pas touché.',
  params: z.object(target),
  kind: 'destructive',
  async run({ pack, profile }, ctx) {
    const path = await profileFor(ctx, pack, profile)
    await ctx.service.discardTrial(path)
    return { trial: trialPathOf(path) }
  },
  print: ({ trial }) => `${trial} est à la corbeille.`
})

/** Texte brut d'un changelog HTML (assez pour être lu dans un terminal ou par Claude). */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const updatesChangelog = command({
  name: 'updates changelog',
  summary: 'Notes de version d’un fichier CurseForge (texte), pour juger une mise à jour avant de l’appliquer.',
  params: z.object({
    project: z.number().int().positive().describe('Projet CurseForge (projectId de « updates check »).'),
    file: z.number().int().positive().describe('Fichier (to.fileId de « updates check »).')
  }),
  kind: 'read',
  async run({ project, file }) {
    const client = await CurseForgeClient.create({ dotenvDir: process.cwd() })
    const text = htmlToText(await client.getChangelog(project, file))
    return { project, file, changelog: text.length > 20_000 ? `${text.slice(0, 20_000)}\n…` : text }
  },
  print: ({ changelog }) => changelog || '(pas de notes de version)'
})
