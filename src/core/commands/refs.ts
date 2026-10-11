// Comment une commande désigne un modpack ou un profil CurseForge : par un nom, comme le ferait une personne.
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { PackView, StudioOverview } from '../../shared/studio'
import type { CurseForgeProfile } from '../../shared/types'
import { listProfiles, readProfile } from '../profiles'
import { StudioError } from '../studio/analyze'
import type { CommandContext } from './registry'

export const packParam = z
  .string()
  .min(1)
  .describe('Le modpack : nom de son dossier, identifiant publié ou nom affiché (la casse est ignorée).')

export const profileParam = z
  .string()
  .min(1)
  .describe('Le profil CurseForge : son nom (dossier du profil dans Instances), son guid, ou le chemin absolu de son dossier.')

/** Retrouve un modpack par son dossier, son identifiant ou son nom. */
export function findPack(overview: StudioOverview, ref: string): PackView {
  const wanted = ref.trim().toLowerCase()
  const pack =
    overview.packs.find((p) => p.folder.toLowerCase() === wanted) ??
    overview.packs.find((p) => p.id.toLowerCase() === wanted) ??
    overview.packs.find((p) => p.name.toLowerCase() === wanted)
  if (!pack) {
    const known = overview.packs.map((p) => p.folder).join(', ') || 'aucun'
    throw new StudioError(`Modpack introuvable : « ${ref} ». Modpacks du dossier : ${known}.`)
  }
  return pack
}

export async function packOf(ctx: CommandContext, ref: string): Promise<PackView> {
  const overview = await ctx.service.overview()
  if (!overview.settings.workspaceDir) throw new StudioError('Aucun dossier de modpacks : choisis-le dans l’application.')
  return findPack(overview, ref)
}

/** Paramètres d'une commande qui vise un profil : directement, ou par le modpack qui en vient. */
export const target = {
  pack: z.string().min(1).optional().describe('Le modpack : on travaille sur son profil CurseForge source.'),
  profile: z.string().min(1).optional().describe('Ou directement un profil CurseForge (nom, guid ou dossier).')
}

/** Le profil visé : celui donné, sinon le profil source du modpack donné. */
export async function profileFor(ctx: CommandContext, pack?: string, profile?: string): Promise<string> {
  if (!pack === !profile) throw new StudioError('Donne soit pack, soit profile.')
  if (profile) return (await findProfile(ctx, profile)).path
  const view = await packOf(ctx, pack!)
  const library = await ctx.service.library()
  const source = library.folders.flatMap((f) => f.profiles).find((p) => p.pack?.folder === view.folder)
  if (!source) throw new StudioError(`${view.folder} n’a pas de profil CurseForge source : lie-le avec « packs link ».`)
  return source.path
}

/** Retrouve un profil CurseForge par son nom, son guid ou son dossier. */
export async function findProfile(ctx: CommandContext, ref: string): Promise<CurseForgeProfile> {
  if (isAbsolute(ref)) {
    const profile = await readProfile(ref)
    if (!profile) throw new StudioError(`${ref} n’est pas un profil CurseForge (minecraftinstance.json absent ou illisible).`)
    return profile
  }
  const dir = await ctx.instancesDir()
  const wanted = ref.trim().toLowerCase()
  const profiles = await listProfiles(dir)
  const profile = profiles.find((p) => p.name.toLowerCase() === wanted) ?? profiles.find((p) => p.guid?.toLowerCase() === wanted)
  if (!profile) throw new StudioError(`Profil CurseForge introuvable dans ${dir} : « ${ref} ». Voir « profiles list ».`)
  return profile
}
