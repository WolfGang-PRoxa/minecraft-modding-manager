import { z } from 'zod'
import type { AddonUpdate, UpdatePlan } from '../../shared/studio'
import { CurseForgeClient } from '../curseforgeApi'
import { readProfile } from '../profiles'
import { StudioError } from '../studio/analyze'
import { checkUpdates } from '../updates'
import { findProfile, packOf } from './refs'
import { command, type CommandContext } from './registry'

/** Le profil à vérifier : celui donné, sinon le profil source du modpack donné. */
async function profileFor(ctx: CommandContext, pack?: string, profile?: string): Promise<string> {
  if (!pack === !profile) throw new StudioError('Donne soit pack, soit profile.')
  if (profile) return (await findProfile(ctx, profile)).path
  const view = await packOf(ctx, pack!)
  const library = await ctx.service.library()
  const source = library.folders.flatMap((f) => f.profiles).find((p) => p.pack?.folder === view.folder)
  if (!source) throw new StudioError(`${view.folder} n’a pas de profil CurseForge source : lie-le avec « packs link ».`)
  return (await readProfile(source.path))!.path
}

const RELEASE = ['', '', ' (bêta)', ' (alpha)']

function printUpdate(u: AddonUpdate): string {
  const to = `${u.to.fileName}${RELEASE[u.to.releaseType] ?? ''}`
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
    pack: z.string().min(1).optional().describe('Le modpack dont on vérifie le profil source.'),
    profile: z.string().min(1).optional().describe('Ou directement un profil CurseForge (nom, guid ou dossier).'),
    beta: z.boolean().optional().describe('Accepter aussi les versions bêta (par défaut : versions stables seulement).')
  }),
  kind: 'read',
  async run({ pack, profile, beta }, ctx) {
    const path = await profileFor(ctx, pack, profile)
    const client = await CurseForgeClient.create({ dotenvDir: process.cwd() })
    return checkUpdates(path, client, { channel: beta ? 'beta' : 'release' })
  },
  print: (plan: UpdatePlan) =>
    [
      `${plan.profile} — Minecraft ${plan.minecraftVersion}${plan.modLoader ? ` · ${plan.modLoader}` : ''} · ${plan.checked} projet(s) vérifié(s)`,
      ...(plan.updates.length ? plan.updates.map(printUpdate) : ['  Tout est à jour.']),
      ...plan.warnings.map((w) => `  ⚠ ${w}`),
      ...(plan.untracked.length ? [`  Posés à la main, non suivis : ${plan.untracked.join(', ')}`] : [])
    ].join('\n')
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
