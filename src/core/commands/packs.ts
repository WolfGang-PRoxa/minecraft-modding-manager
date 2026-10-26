import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { CONTENT_KINDS } from '../../shared/content'
import { formatLoader } from '../../shared/format'
import type { DisabledMod, PackView, VersionView } from '../../shared/studio'
import { StudioError } from '../studio/analyze'
import { findProfile, packOf, packParam } from './refs'
import { command, type CommandContext } from './registry'

const versionSummary = (v: VersionView) => ({
  number: v.number,
  file: v.fileName,
  size: v.size,
  minecraftVersion: v.analysis?.minecraftVersion ?? null,
  modLoader: formatLoader(v.analysis?.modLoader ?? null),
  modCount: v.analysis?.modCount ?? null,
  github: v.remote,
  error: v.error
})

const settingsSummary = (pack: PackView) => ({
  exclude: pack.settings.exclude,
  disabledMods: pack.settings.disabledMods.map((m) => m.name ?? m.file),
  keepPlayerConfigs: pack.settings.keepPlayerConfigs
})

export const packsList = command({
  name: 'packs list',
  summary: 'Liste les modpacks du dossier des contenus, avec leur dernière version et son état sur GitHub.',
  description:
    'L’état sur GitHub (published, create, update…) n’est connu qu’une fois GitHub lu : passe refresh pour le relire.',
  params: z.object({ refresh: z.boolean().optional().describe('Relire GitHub avant de répondre.') }),
  kind: 'read',
  async run({ refresh }, ctx) {
    const overview = await ctx.service.overview({ refreshRemote: refresh })
    return overview.packs.map((pack) => ({
      folder: pack.folder,
      id: pack.id,
      type: pack.type,
      name: pack.name,
      group: pack.group,
      versions: pack.versions.length,
      latest: pack.versions[0] ? versionSummary(pack.versions[0]) : null,
      nextVersion: pack.nextVersion,
      pendingZips: pack.pending.length,
      onlyOnGitHub: pack.remoteOnly.map((r) => r.tag),
      settings: settingsSummary(pack),
      errors: pack.errors
    }))
  },
  print: (packs) =>
    packs.length
      ? packs
          .map((p) => {
            const latest = p.latest
              ? `v${p.latest.number} · ${p.latest.minecraftVersion ?? '?'} · ${p.latest.modLoader ?? '?'} · ${p.latest.modCount ?? '?'} mods · ${p.latest.github}`
              : 'aucune version'
            const extra = [p.pendingZips ? `${p.pendingZips} zip(s) à ranger` : '', ...p.errors].filter(Boolean)
            const kind = p.type === 'modpack' ? '' : ` [${CONTENT_KINDS[p.type].label}]`
            return `${p.name}${kind} (${p.folder}) — ${latest}${extra.length ? `\n  ⚠ ${extra.join('\n  ⚠ ')}` : ''}`
          })
          .join('\n')
      : 'Aucun modpack dans le dossier.'
})

export const packsShow = command({
  name: 'packs show',
  summary: 'Détaille un modpack : fiche, réglages des versions, toutes ses versions, leurs notes et le bilan de leurs tests.',
  params: z.object({ pack: packParam }),
  kind: 'read',
  async run({ pack: ref }, ctx) {
    const pack = await packOf(ctx, ref)
    return {
      folder: pack.folder,
      dir: pack.dir,
      id: pack.id,
      name: pack.name,
      description: pack.description,
      group: pack.group,
      settings: pack.settings,
      nextVersion: pack.nextVersion,
      versions: pack.versions.map((v) => ({
        ...versionSummary(v),
        modifiedAt: v.modifiedAt,
        notes: v.notes,
        warnings: v.analysis?.warnings ?? [],
        changesOnGitHub: v.changes,
        excludedFilesInside: v.excluded,
        tests: v.tests
      })),
      pendingZips: pack.pending,
      onlyOnGitHub: pack.remoteOnly,
      errors: pack.errors
    }
  }
})

export const packsCreate = command({
  name: 'packs create',
  summary: 'Crée un modpack dans le dossier des contenus, éventuellement depuis un profil CurseForge (avec sa v1).',
  description:
    'Son identifiant publié est tiré du nom et ne change plus. Avec profile, le profil est zippé comme v1 et devient la ' +
    'source du modpack ; sans, ajoute ensuite une version avec « versions create ».',
  params: z.object({
    name: z.string().min(1).describe('Nom affiché du modpack.'),
    profile: z.string().min(1).optional().describe('Profil CurseForge source (nom, guid ou chemin), zippé comme v1.'),
    includeSaves: z.boolean().optional().describe('Avec profile : inclure les mondes dans la v1.')
  }),
  kind: 'write',
  async run({ name, profile: profileRef, includeSaves }, ctx) {
    if (!profileRef) return { folder: await ctx.service.createPack(name), file: null }
    const profile = await findProfile(ctx, profileRef)
    const { folder, fileName } = await ctx.service.createPackFromProfile(
      name,
      profile.path,
      includeSaves ?? false,
      (done, total) => ctx.progress('Création du zip', done, total),
      ctx.signal
    )
    return { folder, file: fileName }
  },
  print: ({ folder, file }) => `Modpack créé : ${folder}${file ? ` (${file})` : ''}`
})

export const packsEdit = command({
  name: 'packs edit',
  summary: 'Change le nom affiché ou la description d’un modpack.',
  params: z.object({
    pack: packParam,
    name: z.string().optional().describe('Nouveau nom affiché.'),
    description: z.string().optional().describe('Nouvelle description (Markdown simple).')
  }),
  kind: 'write',
  async run({ pack: ref, name, description }, ctx) {
    const pack = await packOf(ctx, ref)
    await ctx.service.updatePackInfo(pack.folder, {
      name: name ?? pack.name,
      description: description ?? pack.description
    })
    return { folder: pack.folder }
  },
  print: ({ folder }) => `Fiche de ${folder} enregistrée.`
})

export const packsGroup = command({
  name: 'packs group',
  summary: 'Range un modpack ou un contenu dans un groupe du Studio, ou l’en sort.',
  description:
    'Un groupe est un sous-dossier de la colonne de gauche du Studio, dans la section de son type (Packs de ressources, ' +
    'Mods…) : les contenus du même groupe y sont réunis. Rien ne bouge sur le disque ni chez les joueurs. Sans group ' +
    '(ou vide) : retiré de son groupe.',
  params: z.object({
    pack: packParam,
    group: z.string().optional().describe('Nom du groupe (« Mystical Agriculture 3D ») ; absent ou vide pour l’en sortir.')
  }),
  kind: 'write',
  async run({ pack: ref, group }, ctx) {
    const pack = await packOf(ctx, ref)
    return { folder: pack.folder, group: await ctx.service.setPackGroup(pack.folder, group ?? null) }
  },
  print: ({ folder, group }) => (group ? `${folder} rangé dans le groupe « ${group} ».` : `${folder} n’est plus dans un groupe.`)
})

/** Mods désignés par leur fichier ou leur projet CurseForge, retrouvés dans la dernière version du modpack. */
async function resolveMods(ctx: CommandContext, pack: PackView, refs: string[]): Promise<DisabledMod[]> {
  const latest = pack.versions[0]
  if (!latest) throw new StudioError('Ce modpack n’a encore aucune version : impossible de choisir ses mods.')
  const { mods } = await ctx.service.zipContents(pack.folder, latest.fileName)
  return refs.filter((ref) => ref.trim()).map((ref) => {
    const wanted = ref.trim().toLowerCase().replace(/\.disabled$/, '')
    const mod =
      mods.find((m) => String(m.addonId) === wanted) ??
      mods.find((m) => m.fileName.toLowerCase().replace(/\.disabled$/, '') === wanted) ??
      mods.find((m) => m.name?.toLowerCase() === wanted)
    if (!mod) throw new StudioError(`Mod introuvable dans ${latest.fileName} : « ${ref} ».`)
    return { addonId: mod.addonId, file: mod.fileName.replace(/\.disabled$/i, ''), name: mod.name }
  })
}

export const packsSettings = command({
  name: 'packs settings',
  summary: 'Règle les versions d’un modpack : fichiers exclus, mods désactivés chez les joueurs, configurations gardées.',
  description:
    'Chaque réglage absent reste tel quel ; une liste donnée remplace l’ancienne (liste vide, ou valeur vide en ligne de ' +
      'commande : tout retirer). Les fichiers ' +
    'exclus s’appliquent aux zips créés ensuite, jamais à un zip existant (voir « versions strip »). Les mods désactivés ' +
    'et keepPlayerConfigs partent dans le modpack.json de toutes les versions à la prochaine publication.',
  params: z.object({
    pack: packParam,
    exclude: z
      .array(z.string())
      .optional()
      .describe('Chemins depuis la racine de l’instance (dossier = tout son contenu ; jokers *, ?, **/).'),
    disabledMods: z
      .array(z.string())
      .optional()
      .describe('Mods installés désactivés chez les joueurs : fichier, projet CurseForge ou nom, pris dans la dernière version.'),
    keepPlayerConfigs: z
      .boolean()
      .optional()
      .describe('Une mise à jour garde les fichiers de config que le joueur a modifiés.')
  }),
  kind: 'write',
  async run({ pack: ref, exclude, disabledMods, keepPlayerConfigs }, ctx) {
    const pack = await packOf(ctx, ref)
    const settings = {
      exclude: exclude ?? pack.settings.exclude,
      disabledMods: disabledMods ? await resolveMods(ctx, pack, disabledMods) : pack.settings.disabledMods,
      keepPlayerConfigs: keepPlayerConfigs ?? pack.settings.keepPlayerConfigs
    }
    await ctx.service.updatePackSettings(pack.folder, settings)
    return (await packOf(ctx, pack.folder)).settings
  }
})

export const packsNotes = command({
  name: 'packs notes',
  summary: 'Écrit les notes d’une version (Markdown), affichées aux joueurs et dans la release GitHub.',
  params: z.object({
    pack: packParam,
    version: z.number().int().positive().describe('Numéro de la version (v3 → 3).'),
    notes: z.string().describe('Texte complet des notes ; vide pour les effacer.')
  }),
  kind: 'write',
  async run({ pack: ref, version, notes }, ctx) {
    const pack = await packOf(ctx, ref)
    if (!pack.versions.some((v) => v.number === version)) {
      throw new StudioError(`${pack.folder} n’a pas de v${version}.`)
    }
    await ctx.service.setNotes(pack.folder, version, notes)
    return { folder: pack.folder, version }
  },
  print: ({ folder, version }) => `Notes de la v${version} de ${folder} enregistrées.`
})

export const packsCover = command({
  name: 'packs cover',
  summary: 'Change l’image d’un modpack (png, jpg ou webp, 16:9 conseillé), ou la retire.',
  params: z.object({
    pack: packParam,
    file: z.string().optional().describe('Chemin absolu de la nouvelle image.'),
    remove: z.boolean().optional().describe('Retirer l’image.')
  }),
  kind: 'write',
  async run({ pack: ref, file, remove }, ctx) {
    if (!file === !remove) throw new StudioError('Donne soit file, soit remove.')
    if (file && !isAbsolute(file)) throw new StudioError('Le chemin de l’image doit être absolu.')
    const pack = await packOf(ctx, ref)
    await ctx.service.setCover(pack.folder, file ?? null)
    return { folder: pack.folder, cover: file ? 'changée' : 'retirée' }
  },
  print: ({ folder, cover }) => `Image de ${folder} ${cover}.`
})

export const packsDelete = command({
  name: 'packs delete',
  summary: 'Supprime un modpack : son dossier part à la corbeille et toutes ses releases sont retirées de GitHub.',
  description: 'Irréversible sur GitHub. Le profil CurseForge d’origine n’est jamais touché.',
  params: z.object({ pack: packParam }),
  kind: 'destructive',
  async run({ pack: ref }, ctx) {
    const pack = await packOf(ctx, ref)
    const result = await ctx.service.deletePack(pack.folder)
    if (!result.ok) throw new StudioError(result.error)
    return { folder: pack.folder, releasesRemoved: result.done }
  },
  print: ({ folder, releasesRemoved }) => `${folder} supprimé (${releasesRemoved} release(s) retirée(s) de GitHub).`
})
