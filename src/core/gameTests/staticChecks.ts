// Vérification d'un profil sans lancer le jeu, en quelques secondes : mods en double, dépendances obligatoires
// absentes ou dans une version refusée, incompatibilités déclarées, mods faits pour un autre chargeur ou une autre
// version du jeu, et liste des mods qui ne fonctionnent que dans le jeu (côté client).
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { CURSEFORGE_INSTANCE_FILE } from '../../shared/config'
import type { CheckFinding, StaticCheckReport } from '../../shared/studio'
import { modsOf } from '../profiles'
import { StudioError } from '../studio/analyze'
import { BUILTIN_IDS, readModJar, type JarMetadata, type LoaderFamily, type LoaderPreference } from './modMetadata'
import { compareMaven, describeConstraint, satisfies } from './versions'

type Json = Record<string, unknown>

const familyOf = (modLoader: string | null): LoaderFamily | null =>
  /^(neo)?forge/i.test(modLoader ?? '') ? 'forge' : /^(fabric|quilt)/i.test(modLoader ?? '') ? 'fabric' : null

const preferenceOf = (modLoader: string | null): LoaderPreference | null => (/^neoforge/i.test(modLoader ?? '') ? 'neoforge' : familyOf(modLoader))

/**
 * Le chargeur du profil lit-il ce jar ? Forge ignore un jar qui n'a que la description de NeoForge, et NeoForge, depuis
 * Minecraft 1.20.5, un jar qui n'a que celle de Forge. null : on ne sait pas.
 */
function loadedBy(jarLoader: JarMetadata['loader'], profile: LoaderPreference | null, minecraftVersion: string | null): boolean | null {
  if (!jarLoader || !profile) return null
  if (profile === 'fabric') return jarLoader === 'fabric' || jarLoader === 'quilt'
  if (jarLoader === 'fabric' || jarLoader === 'quilt') return false
  if (profile === 'forge') return jarLoader === 'forge'
  if (jarLoader === 'neoforge') return true
  const modern = minecraftVersion ? compareMaven(minecraftVersion, '1.20.5') : null
  return modern === null ? null : modern < 0
}

/**
 * Fichiers du dossier mods que CurseForge dit réservés au client : le fichier installé cite « Client » parmi ses
 * versions, et pas « Server ». C'est souvent la seule indication pour un mod Forge.
 */
export function clientOnlyFromCurseForge(instance: Json): Set<string> {
  const files = new Set<string>()
  for (const addon of (instance.installedAddons as Json[] | undefined) ?? []) {
    const versions = ((addon.installedFile as Json | undefined)?.gameVersion as unknown[] | undefined) ?? []
    if (versions.includes('Client') && !versions.includes('Server') && typeof addon.fileNameOnDisk === 'string') {
      files.add(addon.fileNameOnDisk.toLowerCase())
    }
  }
  return files
}

export interface ProfileMods {
  instance: Json
  family: LoaderFamily | null
  /** Chargeur précis du profil (Forge et NeoForge ne lisent pas la même description). */
  loader: LoaderPreference | null
  /** Mods actifs (.jar du dossier mods) et ce qu'ils déclarent. */
  jars: Array<{ file: string; meta: JarMetadata | null }>
  clientOnly: string[]
}

/** Lit le profil et les métadonnées de ses mods actifs. */
export async function readProfileMods(profilePath: string): Promise<ProfileMods> {
  let instance: Json
  try {
    instance = JSON.parse((await readFile(join(profilePath, CURSEFORGE_INSTANCE_FILE), 'utf8')).replace(/^﻿/, '')) as Json
  } catch {
    throw new StudioError(`${basename(profilePath)} n’est pas un profil CurseForge lisible.`)
  }
  const loaderName = ((instance.baseModLoader as Json | null)?.name as string | undefined) ?? null
  const family = familyOf(loaderName)
  const loader = preferenceOf(loaderName)
  const names = (await readdir(join(profilePath, 'mods')).catch(() => [] as string[])).filter((n) => /\.jar$/i.test(n))
  const jars = await Promise.all(names.map(async (file) => ({ file, meta: await readModJar(join(profilePath, 'mods', file), loader ?? 'fabric') })))
  const fromCurseForge = clientOnlyFromCurseForge(instance)
  const clientOnly = jars
    .filter(({ file, meta }) => fromCurseForge.has(file.toLowerCase()) || Boolean(meta?.mods.length && meta.mods.every((m) => m.side === 'client')))
    .map((j) => j.file)
    .sort()
  return { instance, family, loader, jars: jars.sort((a, b) => a.file.localeCompare(b.file)), clientOnly }
}

/** Versions du jeu et du chargeur du profil, sous les identifiants que les mods utilisent pour en dépendre. */
export function profileVersions(instance: Json): Map<string, string> {
  const versions = new Map<string, string>()
  if (typeof instance.gameVersion === 'string') versions.set('minecraft', instance.gameVersion)
  const loader = /^(neoforge|forge|fabric)-([^-]+)/i.exec(((instance.baseModLoader as Json | null)?.name as string | undefined) ?? '')
  if (loader) {
    const ids = { neoforge: ['neoforge'], forge: ['forge'], fabric: ['fabricloader', 'fabric-loader'] }[loader[1].toLowerCase() as 'forge']
    for (const id of ids) versions.set(id, loader[2])
  }
  return versions
}

const LOADER_NAMES: Record<string, string> = { forge: 'Forge', neoforge: 'NeoForge', fabricloader: 'Fabric Loader', 'fabric-loader': 'Fabric Loader' }

/**
 * Versions demandées et incompatibilités déclarées, comme les vérifient les chargeurs au démarrage : version du jeu, du
 * chargeur et des autres mods (y compris ceux embarqués). Une version ou une plage illisible n'est jamais signalée.
 */
export function versionFindings(jars: ProfileMods['jars'], builtins: Map<string, string>, loader: LoaderPreference | null = null): CheckFinding[] {
  const minecraft = builtins.get('minecraft') ?? null
  // Seuls les jars que le chargeur lit comptent (un mod Fabric dans un profil Forge est signalé à part).
  const loaded = jars.filter(({ meta }) => meta && loadedBy(meta.loader, loader, minecraft) !== false)
  const installed = new Map<string, Set<string>>()
  const declaredIn = new Map<string, Set<string>>()
  for (const { file, meta } of loaded) {
    for (const mod of [...(meta?.mods ?? []), ...(meta?.nested ?? [])]) {
      if (mod.version) installed.set(mod.id, (installed.get(mod.id) ?? new Set()).add(mod.version))
      declaredIn.set(mod.id, (declaredIn.get(mod.id) ?? new Set()).add(file))
    }
  }
  // Forge et NeoForge acceptent un mod fait pour une version voisine du jeu (1.21 sur 1.21.1, 1.20 sur 1.20.1).
  const minecraftCandidates = (() => {
    const match = minecraft ? /^(\d+)\.(\d+)\.(\d+)$/.exec(minecraft) : null
    if (!match) return minecraft ? [minecraft] : []
    const [, major, minor, patch] = match
    return [match[0], `${major}.${minor}`, ...Array.from({ length: Number(patch) - 1 }, (_, i) => `${major}.${minor}.${i + 1}`)]
  })()
  const grouped = new Map<string, CheckFinding>()
  const add = (severity: CheckFinding['severity'], message: string, file: string) => {
    const finding = grouped.get(message) ?? { severity, message, files: [] }
    if (!finding.files.includes(file)) finding.files.push(file)
    grouped.set(message, finding)
  }
  for (const { file, meta } of loaded) {
    for (const mod of [...(meta?.mods ?? []), ...(meta?.nested ?? [])]) {
      // Un mod présent dans plusieurs jars (ou fourni par un autre, comme Indium par Sodium) : le chargeur en choisit un.
      if ((declaredIn.get(mod.id)?.size ?? 0) > 1) continue
      for (const relation of mod.relations) {
        if (relation.id === 'java' || relation.id === mod.id) continue
        const builtin = builtins.get(relation.id)
        const versions = builtin ? [builtin] : [...(installed.get(relation.id) ?? [])]
        const candidates = relation.id === 'minecraft' && relation.ecosystem === 'forge' ? minecraftCandidates : versions
        if (!versions.length) continue
        const constraint = relation.versions
        const results = candidates.map((v) => (constraint === null ? true : satisfies(relation.ecosystem, constraint, v)))
        const wanted = constraint === null ? 'toutes versions' : describeConstraint(constraint)
        const shown = versions.join(', ')
        if (relation.kind === 'required') {
          if (results.some((r) => r !== false) || constraint === null) continue
          if (relation.id === 'minecraft') add('error', `« ${mod.id} » est fait pour Minecraft ${wanted}, pas pour la ${shown} du profil.`, file)
          else if (LOADER_NAMES[relation.id]) add('error', `« ${mod.id} » demande ${LOADER_NAMES[relation.id]} ${wanted}, mais le profil a la ${shown}.`, file)
          else add('error', `« ${mod.id} » demande « ${relation.id} » en version ${wanted}, mais la version installée est la ${shown}.`, file)
        } else {
          const hit = candidates.filter((_, i) => results[i] === true)
          if (!hit.length) continue
          if (relation.kind === 'breaks') add('error', `« ${mod.id} » refuse de démarrer avec « ${relation.id} » ${hit.join(', ')} : ces mods sont incompatibles.`, file)
          else add('warning', `« ${mod.id} » déconseille « ${relation.id} » ${hit.join(', ')} : ils peuvent mal fonctionner ensemble.`, file)
        }
      }
    }
  }
  return [...grouped.values()]
}

/** Vérifie un profil sans lancer le jeu. */
export async function checkProfileFiles(profilePath: string): Promise<StaticCheckReport> {
  const { instance, loader, jars, clientOnly } = await readProfileMods(profilePath)
  const findings: CheckFinding[] = []
  const minecraft = typeof instance.gameVersion === 'string' ? instance.gameVersion : null

  // Un jar fait pour un autre chargeur est ignoré par le jeu (il ne sert à rien, sans l'empêcher de démarrer) : seuls
  // ceux que le chargeur lit sont vérifiés ensuite.
  const ignored = jars.filter(({ meta }) => loadedBy(meta?.loader ?? null, loader, minecraft) === false)
  const loaded = jars.filter((j) => !ignored.includes(j))
  if (ignored.length) {
    const names: Record<string, string> = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' }
    const madeFor = [...new Set(ignored.map((j) => names[j.meta!.loader!]))].join(' ou ')
    findings.push({
      severity: 'warning',
      message: `Ces mods sont faits pour ${madeFor} : ${names[loader!]} ne les charge pas, ils ne servent à rien dans ce profil.`,
      files: ignored.map((j) => j.file)
    })
  }

  // Qui fournit quoi : les mods des jars, et ceux qu'ils embarquent.
  const providers = new Map<string, string[]>()
  const provided = new Set<string>()
  for (const { file, meta } of loaded) {
    for (const mod of meta?.mods ?? []) providers.set(mod.id, [...(providers.get(mod.id) ?? []), file])
    for (const mod of [...(meta?.mods ?? []), ...(meta?.nested ?? [])]) provided.add(mod.id)
  }

  for (const [id, files] of providers) {
    if (files.length > 1 && !BUILTIN_IDS.has(id)) {
      // Forge en garde un (constaté), d'autres chargeurs refusent de démarrer : dans tous les cas, un fichier de trop.
      findings.push({
        severity: 'warning',
        message: `Le mod « ${id} » est présent ${files.length} fois : un seul est chargé (ou le jeu refuse de démarrer). Garde un seul de ces fichiers.`,
        files
      })
    }
  }

  const missing = new Map<string, string[]>()
  for (const { file, meta } of loaded) {
    for (const mod of meta?.mods ?? []) {
      for (const dep of mod.requires) {
        if (BUILTIN_IDS.has(dep) || provided.has(dep)) continue
        missing.set(dep, [...new Set([...(missing.get(dep) ?? []), file])])
      }
    }
  }
  for (const [dep, files] of missing) {
    findings.push({ severity: 'error', message: `Il manque le mod « ${dep} », dont ces mods ont besoin pour démarrer.`, files })
  }

  findings.push(...versionFindings(loaded, profileVersions(instance), loader))

  const unreadable = jars.filter(({ meta }) => !meta?.mods.length && !meta?.library).map((j) => j.file)
  if (unreadable.length) {
    findings.push({
      severity: 'info',
      message: 'Ces fichiers ne déclarent aucun mod (pack de données, ressource ou fichier abîmé ?) : vérifie qu’ils ont leur place dans mods.',
      files: unreadable
    })
  }
  if (clientOnly.length) {
    findings.push({
      severity: 'info',
      message: 'Ces mods ne fonctionnent que dans le jeu : ils sont laissés de côté par le test du serveur.',
      files: clientOnly
    })
  }

  return {
    profile: basename(profilePath),
    profilePath,
    checkedAt: new Date().toISOString(),
    jars: jars.length,
    findings,
    clientOnly,
    modsSignature: (await modsOf(profilePath))?.signature ?? null
  }
}
