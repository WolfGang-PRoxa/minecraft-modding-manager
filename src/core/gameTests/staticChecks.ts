// Vérification d'un profil sans lancer le jeu, en quelques secondes : mods en double, dépendances obligatoires
// absentes, mods faits pour un autre chargeur, et liste des mods qui ne fonctionnent que dans le jeu (côté client).
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { CURSEFORGE_INSTANCE_FILE } from '../../shared/config'
import type { CheckFinding, StaticCheckReport } from '../../shared/studio'
import { StudioError } from '../studio/analyze'
import { BUILTIN_IDS, readModJar, type JarMetadata, type LoaderFamily } from './modMetadata'

type Json = Record<string, unknown>

const familyOf = (modLoader: string | null): LoaderFamily | null =>
  /^(neo)?forge/i.test(modLoader ?? '') ? 'forge' : /^(fabric|quilt)/i.test(modLoader ?? '') ? 'fabric' : null

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
  const family = familyOf(((instance.baseModLoader as Json | null)?.name as string | undefined) ?? null)
  const names = (await readdir(join(profilePath, 'mods')).catch(() => [] as string[])).filter((n) => /\.jar$/i.test(n))
  const jars = await Promise.all(names.map(async (file) => ({ file, meta: await readModJar(join(profilePath, 'mods', file), family ?? 'fabric') })))
  const fromCurseForge = clientOnlyFromCurseForge(instance)
  const clientOnly = jars
    .filter(({ file, meta }) => fromCurseForge.has(file.toLowerCase()) || Boolean(meta?.mods.length && meta.mods.every((m) => m.side === 'client')))
    .map((j) => j.file)
    .sort()
  return { instance, family, jars: jars.sort((a, b) => a.file.localeCompare(b.file)), clientOnly }
}

/** Vérifie un profil sans lancer le jeu. */
export async function checkProfileFiles(profilePath: string): Promise<StaticCheckReport> {
  const { family, jars, clientOnly } = await readProfileMods(profilePath)
  const findings: CheckFinding[] = []

  // Qui fournit quoi : les mods des jars, et ceux qu'ils embarquent.
  const providers = new Map<string, string[]>()
  const provided = new Set<string>()
  for (const { file, meta } of jars) {
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
  for (const { file, meta } of jars) {
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

  if (family) {
    const wrong = jars.filter(({ meta }) => {
      if (!meta?.loader) return false
      const jarFamily = meta.loader === 'fabric' || meta.loader === 'quilt' ? 'fabric' : 'forge'
      return jarFamily !== family
    })
    if (wrong.length) {
      findings.push({
        severity: 'error',
        message: `Ces mods sont faits pour ${family === 'forge' ? 'Fabric' : 'Forge ou NeoForge'}, pas pour le chargeur du profil.`,
        files: wrong.map((w) => w.file)
      })
    }
  }

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
    clientOnly
  }
}
