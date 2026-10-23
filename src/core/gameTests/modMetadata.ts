// Ce qu'un .jar de mod déclare : ses identifiants et versions, ses dépendances (obligatoires, avec les versions
// acceptées), les mods avec lesquels il refuse de fonctionner, et le côté où il fonctionne. Lu dans
// fabric.mod.json (Fabric, Quilt), META-INF/mods.toml (Forge) ou META-INF/neoforge.mods.toml (NeoForge), y compris
// pour les mods embarqués dans d'autres (jar-in-jar : Fabric API en contient des dizaines).
import type { Entry, ZipFile } from 'yauzl'
import yauzl from 'yauzl'
import { openEntry, openZip, readEntries } from '../zip'

export interface DeclaredMod {
  id: string
  version: string | null
  /** Nom et description affichés (Fabric `name`, Forge `displayName`), s'ils sont donnés. */
  name?: string | null
  description?: string | null
  /** `client` : ne fonctionne que dans le jeu, jamais sur un serveur. */
  side: 'client' | 'server' | 'both'
  /** Identifiants des mods sans lesquels il ne démarre pas. */
  requires: string[]
  /** Dépendances et incompatibilités avec les versions concernées (pour les obligatoires : celles acceptées). */
  relations: ModRelation[]
}

/**
 * `required` : il faut ce mod dans l'une de ces versions. `breaks` : il refuse de démarrer avec ces versions de ce mod
 * (Fabric `breaks`, Forge `incompatible`). `conflicts` : il le déconseille (Fabric `conflicts`, Forge `discouraged`).
 */
export interface ModRelation {
  id: string
  kind: 'required' | 'breaks' | 'conflicts'
  /** Prédicat Fabric (chaîne ou tableau) ou plage Maven de Forge ; null = toutes les versions. */
  versions: string | string[] | null
  ecosystem: 'fabric' | 'forge'
}

export interface JarMetadata {
  loader: 'fabric' | 'quilt' | 'forge' | 'neoforge' | null
  /** Jar sans mod mais chargé par Forge ou NeoForge (bibliothèque, langage : `FMLModType` de son manifeste). */
  library: boolean
  /** Mods déclarés par ce jar (souvent un seul). */
  mods: DeclaredMod[]
  /** Mods embarqués (jar-in-jar), à toutes les profondeurs. */
  nested: DeclaredMod[]
}

// ---------------------------------------------------------------------------------------------
// TOML : juste ce qu'utilisent mods.toml et neoforge.mods.toml (tables, tableaux de tables, clé = valeur simple).

type TomlValue = string | number | boolean
type TomlTable = Record<string, TomlValue>

/** Tables d'un fichier TOML : `[[mods]]` → mods[], `[[dependencies.x]]` → dependencies.x[], clés de premier niveau. */
export function parseToml(text: string): Record<string, TomlTable[]> {
  const tables: Record<string, TomlTable[]> = { '': [{}] }
  let current = tables[''][0]
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    const header = /^\[\[\s*([^\]]+?)\s*\]\]/.exec(line) ?? /^\[\s*([^\]]+?)\s*\]/.exec(line)
    if (header) {
      const name = header[1].replace(/"/g, '')
      current = {}
      ;(tables[name] ??= []).push(current)
      continue
    }
    const pair = /^([A-Za-z0-9_.-]+|"[^"]+")\s*=\s*(.*)$/.exec(line)
    if (!pair) continue
    const key = pair[1].replace(/"/g, '')
    let raw = pair[2].trim()
    // Chaîne sur plusieurs lignes (description) : on avance jusqu'à sa fin.
    const fence = raw.startsWith('"""') ? '"""' : raw.startsWith("'''") ? "'''" : null
    if (fence) {
      let body = raw.slice(3)
      while (!body.includes(fence) && i + 1 < lines.length) body += '\n' + lines[++i]
      current[key] = body.slice(0, body.indexOf(fence))
      continue
    }
    raw = raw.replace(/\s+#.*$/, '')
    if (/^".*"$/.test(raw) || /^'.*'$/.test(raw)) current[key] = raw.slice(1, -1)
    else if (raw === 'true' || raw === 'false') current[key] = raw === 'true'
    else if (/^-?\d+(\.\d+)?$/.test(raw)) current[key] = Number(raw)
    else current[key] = raw
  }
  return tables
}

/** Mods qui ne sont pas des mods à installer : le jeu, Java et les chargeurs. */
export const BUILTIN_IDS = new Set([
  'minecraft',
  'java',
  'forge',
  'neoforge',
  'fml',
  'javafml',
  'lowcodefml',
  'fabricloader',
  'fabric-loader',
  'quilt_loader',
  'quilt_base'
])

/** `${file.jarVersion}` de Forge : la version écrite dans le manifeste du jar. */
const resolveJarVersion = (version: unknown, jarVersion: string | null) =>
  typeof version !== 'string' ? null : version.includes('${file.jarVersion}') ? (jarVersion ? version.replace('${file.jarVersion}', jarVersion) : null) : version

function fromForgeToml(text: string, jarVersion: string | null): DeclaredMod[] {
  const tables = parseToml(text)
  const clientOnly = tables['']?.[0]?.clientSideOnly === true
  return (tables.mods ?? []).map((mod) => {
    const id = String(mod.modId ?? '')
    const dependencies = (tables[`dependencies.${id}`] ?? [])
      .filter((dep) => !dep.side || String(dep.side).toUpperCase() !== 'CLIENT' || clientOnly)
      .filter((dep) => dep.modId)
    const kindOf = (dep: TomlTable): ModRelation['kind'] | null => {
      const type = typeof dep.type === 'string' ? dep.type.toLowerCase() : null
      if (type === 'incompatible') return 'breaks'
      if (type === 'discouraged') return 'conflicts'
      if (dep.mandatory === true || type === 'required' || (dep.mandatory === undefined && type === null)) return 'required'
      return null
    }
    const relations = dependencies.flatMap((dep): ModRelation[] => {
      const kind = kindOf(dep)
      const range = typeof dep.versionRange === 'string' && dep.versionRange.trim() ? dep.versionRange.trim() : null
      return kind ? [{ id: String(dep.modId), kind, versions: range, ecosystem: 'forge' }] : []
    })
    return {
      id,
      version: resolveJarVersion(mod.version, jarVersion),
      name: typeof mod.displayName === 'string' && mod.displayName.trim() ? mod.displayName.trim() : null,
      description: typeof mod.description === 'string' && mod.description.trim() ? mod.description.trim() : null,
      side: clientOnly ? 'client' : 'both',
      requires: relations.filter((r) => r.kind === 'required').map((r) => r.id),
      relations
    }
  })
}

/** Versions d'une relation Fabric : chaîne, tableau de chaînes, ou objet de Quilt. */
const fabricVersions = (value: unknown): string | string[] | null =>
  typeof value === 'string' ? value : Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : null

function fromFabricJson(text: string): { mod: DeclaredMod; nested: string[] } | null {
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text.replace(/^﻿/, '')) as Record<string, unknown>
  } catch {
    return null
  }
  const id = typeof json.id === 'string' ? json.id : null
  if (!id) return null
  const table = (key: string) => (json[key] && typeof json[key] === 'object' && !Array.isArray(json[key]) ? json[key] : {}) as Record<string, unknown>
  const depends = table('depends')
  const relations: ModRelation[] = [
    ...Object.entries(depends).map(([dep, v]): ModRelation => ({ id: dep, kind: 'required', versions: fabricVersions(v), ecosystem: 'fabric' })),
    ...Object.entries(table('breaks')).map(([dep, v]): ModRelation => ({ id: dep, kind: 'breaks', versions: fabricVersions(v), ecosystem: 'fabric' })),
    ...Object.entries(table('conflicts')).map(([dep, v]): ModRelation => ({ id: dep, kind: 'conflicts', versions: fabricVersions(v), ecosystem: 'fabric' }))
  ]
  const environment = json.environment === 'client' ? 'client' : json.environment === 'server' ? 'server' : 'both'
  const provides = Array.isArray(json.provides) ? json.provides.filter((p): p is string => typeof p === 'string') : []
  const nested = Array.isArray(json.jars) ? (json.jars as Array<{ file?: unknown }>).map((j) => String(j.file ?? '')).filter(Boolean) : []
  const version = typeof json.version === 'string' ? json.version : null
  return {
    mod: {
      id,
      version,
      name: typeof json.name === 'string' && json.name.trim() ? json.name.trim() : null,
      description: typeof json.description === 'string' && json.description.trim() ? json.description.trim() : null,
      side: environment,
      requires: Object.keys(depends),
      relations
    },
    nested: [...nested, ...provides.map((p) => `provides:${p}`)]
  }
}

async function readText(zip: ZipFile, entry: Entry): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of await openEntry(zip, entry)) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function readBuffer(zip: ZipFile, entry: Entry): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of await openEntry(zip, entry)) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

const fromBuffer = (buffer: Buffer) =>
  new Promise<ZipFile>((resolve, reject) =>
    yauzl.fromBuffer(buffer, { lazyEntries: true, autoClose: false }, (err, zip) => (err ? reject(err) : resolve(zip)))
  )

/** Famille de chargeurs du profil : un jar multi-chargeurs est lu avec la description qui lui correspond. */
export type LoaderFamily = 'fabric' | 'forge'

/** Chargeur du profil, pour lire un jar multi-chargeurs : Forge lit mods.toml, NeoForge neoforge.mods.toml. */
export type LoaderPreference = LoaderFamily | 'neoforge'

async function readZip(zip: ZipFile, depth: number, prefer: LoaderPreference): Promise<JarMetadata> {
  const entries = await readEntries(zip)
  const byName = new Map(entries.map((e) => [e.fileName, e]))
  const result: JarMetadata = { loader: null, library: false, mods: [], nested: [] }
  const manifest = byName.get('META-INF/MANIFEST.MF')
  const manifestText = manifest ? await readText(zip, manifest) : ''
  if (/^FMLModType:\s*(LIBRARY|LANGPROVIDER|GAMELIBRARY)/im.test(manifestText)) result.library = true
  const jarVersion = /^Implementation-Version:\s*(\S+)/im.exec(manifestText)?.[1] ?? null
  const nestedFiles: string[] = []

  const fabric = byName.get('fabric.mod.json') ?? byName.get('quilt.mod.json')
  const neoforge = byName.get('META-INF/neoforge.mods.toml')
  const forge = byName.get('META-INF/mods.toml')
  if (fabric && (prefer === 'fabric' || !(neoforge || forge))) {
    const parsed = fromFabricJson(await readText(zip, fabric))
    if (parsed) {
      result.loader = fabric.fileName === 'quilt.mod.json' ? 'quilt' : 'fabric'
      result.mods.push(parsed.mod)
      for (const item of parsed.nested) {
        if (item.startsWith('provides:')) result.nested.push({ id: item.slice(9), version: parsed.mod.version, side: 'both', requires: [], relations: [] })
        else nestedFiles.push(item)
      }
    }
  } else if (neoforge || forge) {
    const toml = prefer === 'neoforge' ? (neoforge ?? forge)! : (forge ?? neoforge)!
    result.loader = toml === neoforge ? 'neoforge' : 'forge'
    result.mods.push(...fromForgeToml(await readText(zip, toml), jarVersion))
  }
  // Jar-in-jar de Forge et NeoForge : les chemins sont dans META-INF/jarjar/metadata.json (souvent META-INF/jars/…).
  for (const entry of entries) {
    if (/^META-INF\/jarjar\/[^/]+\.jar$/i.test(entry.fileName)) nestedFiles.push(entry.fileName)
  }
  const jarjar = byName.get('META-INF/jarjar/metadata.json')
  if (jarjar) {
    try {
      const listed = (JSON.parse(await readText(zip, jarjar)) as { jars?: Array<{ path?: unknown }> }).jars ?? []
      for (const { path } of listed) if (typeof path === 'string' && !nestedFiles.includes(path)) nestedFiles.push(path)
    } catch {
      // métadonnées illisibles : seuls les jars de META-INF/jarjar comptent
    }
  }
  if (depth < 3) {
    for (const name of nestedFiles) {
      const entry = byName.get(name)
      if (!entry) continue
      try {
        const inner = await fromBuffer(await readBuffer(zip, entry))
        try {
          const meta = await readZip(inner, depth + 1, prefer)
          result.nested.push(...meta.mods, ...meta.nested)
        } finally {
          inner.close()
        }
      } catch {
        // jar embarqué illisible : ignoré
      }
    }
  }
  return result
}

/** Métadonnées d'un .jar de mod (null s'il est illisible). */
export async function readModJar(file: string, prefer: LoaderPreference = 'fabric'): Promise<JarMetadata | null> {
  let zip: ZipFile
  try {
    zip = await openZip(file)
  } catch {
    return null
  }
  try {
    return await readZip(zip, 0, prefer)
  } catch {
    return null
  } finally {
    zip.close()
  }
}
