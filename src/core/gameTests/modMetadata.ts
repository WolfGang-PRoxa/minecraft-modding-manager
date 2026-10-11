// Ce qu'un .jar de mod déclare : ses identifiants, ses dépendances obligatoires et le côté où il fonctionne. Lu dans
// fabric.mod.json (Fabric, Quilt), META-INF/mods.toml (Forge) ou META-INF/neoforge.mods.toml (NeoForge), y compris
// pour les mods embarqués dans d'autres (jar-in-jar : Fabric API en contient des dizaines).
import type { Entry, ZipFile } from 'yauzl'
import yauzl from 'yauzl'
import { openEntry, openZip, readEntries } from '../zip'

export interface DeclaredMod {
  id: string
  version: string | null
  /** `client` : ne fonctionne que dans le jeu, jamais sur un serveur. */
  side: 'client' | 'server' | 'both'
  /** Identifiants des mods sans lesquels il ne démarre pas. */
  requires: string[]
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

function fromForgeToml(text: string): DeclaredMod[] {
  const tables = parseToml(text)
  const clientOnly = tables['']?.[0]?.clientSideOnly === true
  return (tables.mods ?? []).map((mod) => {
    const id = String(mod.modId ?? '')
    const requires = (tables[`dependencies.${id}`] ?? [])
      .filter((dep) => dep.mandatory === true || dep.type === 'required' || (dep.mandatory === undefined && dep.type === undefined))
      .filter((dep) => !dep.side || String(dep.side).toUpperCase() !== 'CLIENT' || clientOnly)
      .map((dep) => String(dep.modId ?? ''))
      .filter(Boolean)
    return { id, version: typeof mod.version === 'string' ? mod.version : null, side: clientOnly ? 'client' : 'both', requires }
  })
}

function fromFabricJson(text: string): { mod: DeclaredMod; nested: string[] } | null {
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text.replace(/^﻿/, '')) as Record<string, unknown>
  } catch {
    return null
  }
  const id = typeof json.id === 'string' ? json.id : null
  if (!id) return null
  const depends = (json.depends && typeof json.depends === 'object' ? json.depends : {}) as Record<string, unknown>
  const environment = json.environment === 'client' ? 'client' : json.environment === 'server' ? 'server' : 'both'
  const provides = Array.isArray(json.provides) ? json.provides.filter((p): p is string => typeof p === 'string') : []
  const nested = Array.isArray(json.jars) ? (json.jars as Array<{ file?: unknown }>).map((j) => String(j.file ?? '')).filter(Boolean) : []
  return {
    mod: { id, version: typeof json.version === 'string' ? json.version : null, side: environment, requires: Object.keys(depends) },
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

async function readZip(zip: ZipFile, depth: number, prefer: LoaderFamily): Promise<JarMetadata> {
  const entries = await readEntries(zip)
  const byName = new Map(entries.map((e) => [e.fileName, e]))
  const result: JarMetadata = { loader: null, library: false, mods: [], nested: [] }
  const manifest = byName.get('META-INF/MANIFEST.MF')
  if (manifest && /^FMLModType:\s*(LIBRARY|LANGPROVIDER|GAMELIBRARY)/im.test(await readText(zip, manifest))) result.library = true
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
        if (item.startsWith('provides:')) result.nested.push({ id: item.slice(9), version: null, side: 'both', requires: [] })
        else nestedFiles.push(item)
      }
    }
  } else if (neoforge || forge) {
    result.loader = neoforge ? 'neoforge' : 'forge'
    result.mods.push(...fromForgeToml(await readText(zip, (neoforge ?? forge)!)))
  }
  // Jar-in-jar de Forge et NeoForge.
  for (const entry of entries) {
    if (/^META-INF\/jarjar\/[^/]+\.jar$/i.test(entry.fileName)) nestedFiles.push(entry.fileName)
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
export async function readModJar(file: string, prefer: LoaderFamily = 'fabric'): Promise<JarMetadata | null> {
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
