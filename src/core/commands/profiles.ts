import { z } from 'zod'
import { formatLoader } from '../../shared/format'
import type { ProfileState, ProfileView } from '../../shared/studio'
import { StudioError } from '../studio/analyze'
import { findProfile, packOf, packParam, profileParam } from './refs'
import { command } from './registry'

const STATE_LABELS: Record<ProfileState, string> = {
  unlinked: 'aucun modpack',
  'no-version': 'modpack sans version',
  'up-to-date': 'à jour',
  older: 'version plus ancienne',
  changed: 'changé depuis la dernière version'
}

function describeProfile(p: ProfileView): string {
  const game = [p.minecraftVersion, formatLoader(p.modLoader), p.modCount !== null ? `${p.modCount} mods` : null].filter(Boolean).join(' · ')
  const pack = p.pack ? ` → ${p.pack.folder}${p.link === 'guessed' ? ' (lien deviné)' : ''} : ${STATE_LABELS[p.state]}` : ''
  const origin = p.installedPack ? ` [installé par l’application : ${p.installedPack.id} v${p.installedPack.version}]` : p.curseforgeProjectId ? ' [modpack CurseForge]' : ''
  return `${p.name} — ${game}${origin}${pack}`
}

export const profilesList = command({
  name: 'profiles list',
  summary: 'Les profils CurseForge du PC, rangés par dossier comme dans CurseForge, chacun face au modpack qui en vient.',
  description:
    'state : unlinked (aucun modpack), no-version, up-to-date (mêmes mods que la dernière version), older (mêmes mods ' +
    'qu’une version plus ancienne), changed (ses mods ont changé : de quoi créer la version suivante). link : saved ' +
    '(lien enregistré) ou guessed (déduit des mods ou du nom ; « packs link » l’enregistre). curseforgeProjectId : le ' +
    'profil est une installation d’un modpack de CurseForge. installedPack : installé par l’application depuis GitHub.',
  params: z.object({ folder: z.string().optional().describe('Ne lister que ce dossier de CurseForge (nom, casse ignorée).') }),
  kind: 'read',
  async run({ folder }, ctx) {
    const library = await ctx.service.library()
    if (library.error) throw new StudioError(library.error)
    const folders = folder ? library.folders.filter((f) => f.name.toLowerCase() === folder.trim().toLowerCase()) : library.folders
    if (folder && !folders.length) {
      throw new StudioError(`Dossier CurseForge introuvable : « ${folder} ». Dossiers : ${library.folders.map((f) => f.name).join(', ')}.`)
    }
    return { ...library, folders }
  },
  print: (library) =>
    [
      `Dossier Instances : ${library.instancesDir}`,
      ...library.folders.flatMap((f) => [`\n${f.name}`, ...f.profiles.map((p) => `  ${describeProfile(p)}`)]),
      ...(library.packsWithoutProfile.length ? [`\nModpacks sans profil CurseForge : ${library.packsWithoutProfile.join(', ')}`] : [])
    ].join('\n')
})

export const packsLink = command({
  name: 'packs link',
  summary: 'Lie un modpack au profil CurseForge d’où viennent ses versions, ou retire ce lien.',
  description: 'Créer une version depuis un profil fait déjà le lien. Utile pour confirmer un lien deviné ou en changer.',
  params: z.object({
    pack: packParam,
    profile: profileParam.optional(),
    unlink: z.boolean().optional().describe('Retirer le lien.')
  }),
  kind: 'write',
  async run({ pack: ref, profile: profileRef, unlink }, ctx) {
    if (!profileRef === !unlink) throw new StudioError('Donne soit profile, soit unlink.')
    const pack = await packOf(ctx, ref)
    const profile = profileRef ? await findProfile(ctx, profileRef) : null
    await ctx.service.linkProfile(pack.folder, profile?.path ?? null)
    return { folder: pack.folder, profile: profile?.name ?? null }
  },
  print: ({ folder, profile }) => (profile ? `${folder} est lié au profil ${profile}.` : `${folder} n’est plus lié à un profil.`)
})
