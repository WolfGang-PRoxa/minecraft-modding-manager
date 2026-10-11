// La vue du publieur : ses profils CurseForge, rangés dans les dossiers de CurseForge, chacun face au modpack qui en
// vient. Fonction pure : les profils, les dossiers et les modpacks sont lus ailleurs.
import type { PackView, ProfileFolder, ProfileState, ProfileView, PublisherLibrary } from '../../shared/studio'
import { TRIAL_PROFILE_SUFFIX } from '../../shared/config'
import type { CurseForgeGroup, CurseForgeProfile } from '../../shared/types'

const UNGROUPED = 'Sans dossier'

/** Le profil dont celui-ci est la copie d'essai (« <profil> (essai) »), s'il existe. */
function trialSource(profile: CurseForgeProfile, profiles: CurseForgeProfile[]): CurseForgeProfile | null {
  if (!profile.name.endsWith(TRIAL_PROFILE_SUFFIX)) return null
  const base = profile.name.slice(0, -TRIAL_PROFILE_SUFFIX.length).toLowerCase()
  return profiles.find((p) => p.name.toLowerCase() === base) ?? null
}

const isTrial = (profile: CurseForgeProfile, profiles: CurseForgeProfile[]) => trialSource(profile, profiles) !== null

/** « LMA_26.3 », « lma 26.3 » et « LMA-26.3 » désignent le même modpack. */
const comparable = (name: string) => name.toLowerCase().replace(/[\s_\-.]+/g, '')

/** Le profil source d'un modpack : enregistré (guid, sinon nom), sinon deviné (mêmes mods qu'une version, sinon même nom). */
function sourceOf(pack: PackView, profiles: CurseForgeProfile[]): { profile: CurseForgeProfile; link: 'saved' | 'guessed' } | null {
  // Un profil installé par l'application est la copie d'un joueur : jamais une source.
  const candidates = profiles.filter((p) => !p.installedPack)
  if (pack.profile) {
    const { guid, name } = pack.profile
    const saved =
      (guid && candidates.find((p) => p.guid === guid)) || candidates.find((p) => p.name.toLowerCase() === name.toLowerCase())
    return saved ? { profile: saved, link: 'saved' } : null
  }
  for (const version of pack.versions) {
    const signature = version.analysis?.modsSignature
    const same = signature ? candidates.find((p) => p.modsSignature === signature) : undefined
    if (same) return { profile: same, link: 'guessed' }
  }
  const namesake = candidates.find((p) => comparable(p.name) === comparable(pack.name) || comparable(p.name) === comparable(pack.folder))
  return namesake ? { profile: namesake, link: 'guessed' } : null
}

function stateOf(profile: CurseForgeProfile, pack: PackView | null): { state: ProfileState; matchingVersion: number | null } {
  if (!pack) return { state: 'unlinked', matchingVersion: null }
  if (!pack.versions.length) return { state: 'no-version', matchingVersion: null }
  const matching = profile.modsSignature
    ? pack.versions.find((v) => v.analysis?.modsSignature === profile.modsSignature)
    : undefined
  if (!matching) return { state: 'changed', matchingVersion: null }
  return { state: matching === pack.versions[0] ? 'up-to-date' : 'older', matchingVersion: matching.number }
}

export function buildLibrary(
  packs: PackView[],
  profiles: CurseForgeProfile[],
  groups: CurseForgeGroup[],
  instancesDir: string | null
): PublisherLibrary {
  const packOf = new Map<string, { pack: PackView; link: 'saved' | 'guessed' }>()
  const packsWithoutProfile: string[] = []
  // Les liens enregistrés d'abord : un lien deviné ne prend jamais le profil d'un autre modpack.
  const ordered = [...packs].sort((a, b) => Number(Boolean(b.profile)) - Number(Boolean(a.profile)))
  for (const pack of ordered) {
    // Une copie d'essai est un brouillon : jamais la source d'un modpack.
    const source = sourceOf(pack, profiles.filter((p) => !packOf.has(p.path) && !isTrial(p, profiles)))
    if (source) packOf.set(source.profile.path, { pack, link: source.link })
    else packsWithoutProfile.push(pack.folder)
  }

  const view = (profile: CurseForgeProfile): ProfileView => {
    const linked = packOf.get(profile.path) ?? null
    const pack = linked?.pack ?? null
    return {
      ...profile,
      pack: pack ? { folder: pack.folder, id: pack.id, name: pack.name } : null,
      link: linked?.link ?? null,
      ...stateOf(profile, pack),
      trialPath: profiles.find((p) => trialSource(p, profiles)?.path === profile.path)?.path ?? null,
      trialOf: trialSource(profile, profiles)?.path ?? null
    }
  }
  const byName = (a: ProfileView, b: ProfileView) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  const known = new Set(groups.map((g) => g.id))
  const folders: ProfileFolder[] = groups.map((group) => ({
    id: group.id,
    name: group.name,
    profiles: profiles.filter((p) => p.groupId === group.id).map(view).sort(byName)
  }))
  const ungrouped = profiles.filter((p) => !p.groupId || !known.has(p.groupId)).map(view).sort(byName)
  if (ungrouped.length) folders.push({ id: null, name: UNGROUPED, profiles: ungrouped })
  return { instancesDir, folders, packsWithoutProfile: packsWithoutProfile.sort(), error: null }
}
